import { Injectable, signal, inject, effect, DestroyRef, NgZone } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router, Routes, Route } from '@angular/router';
import { AuthService } from './auth.service';
import { ThemeService } from './theme.service';
import { environment } from '../../../environments/environment.development';
import { Subject, debounceTime } from 'rxjs';

// ============================================================================
// INTERFACES
// ============================================================================

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  tokenEstimate?: number;
  timestamp?: number;
  toolCalls?: ToolCall[];
  isThinking?: boolean;
  toolName?: string;
}

interface ToolCall {
  name: string;
  arguments: Record<string, unknown>;
}

interface StreamUpdate {
  content: string;
  tokenEstimate: number;
  toolCalls?: ToolCall[];
  isThinking?: boolean;
}

interface RouteInfo {
  title: string;
  fullUrl: string;
  purePath: string;
  description?: string;
  keywords?: string[];
}

// Screen descriptions with keywords for better matching
const SCREEN_CONFIG: Record<
  string,
  { description: string; keywords: string[] }
> = {
  home: {
    description: 'Trang chính, thống kê tổng quan',
    keywords: ['home', 'trang chủ', 'chính', 'dashboard', 'tổng quan'],
  },
  settings: {
    description: 'Cài đặt tài khoản, đổi mật khẩu',
    keywords: ['settings', 'cài đặt', 'tài khoản', 'mật khẩu', 'config', 'password'],
  },
  'equipment/catalog': {
    description: 'Danh sách máy móc, in QR, biên bản bàn giao',
    keywords: ['thiết bị', 'máy móc', 'catalog', 'danh sách', 'qr', 'bàn giao'],
  },
  'equipment/dashboard': {
    description: 'Dashboard thiết bị, biểu đồ tình trạng',
    keywords: ['thiết bị', 'dashboard', 'biểu đồ', 'tình trạng'],
  },
  'reports/bed-usage': {
    description: 'Công suất giường bệnh theo khoa',
    keywords: ['giường', 'bed', 'công suất', 'khoa'],
  },
  'reports/examination-overview': {
    description: 'Tổng quan khám chữa bệnh, BHYT/Viện phí',
    keywords: ['khám', 'examination', 'bhyt', 'viện phí', 'tổng quan'],
  },
  'reports/missing-medical-records': {
    description: 'Báo cáo bác sĩ chưa hoàn tất HSBA',
    keywords: ['hsba', 'hồ sơ', 'bác sĩ', 'medical records', 'thiếu'],
  },
  'reports/cls-level3': {
    description: 'Hoạt động CLS Tầng 3',
    keywords: ['cls', 'tầng 3', 'level 3', 'cận lâm sàng'],
  },
  'reports/cls-level6': {
    description: 'Hoạt động CLS Tầng 6',
    keywords: ['cls', 'tầng 6', 'level 6', 'cận lâm sàng'],
  },
  'reports/specialty-cls': {
    description: 'Thống kê CLS theo Chuyên khoa',
    keywords: ['cls', 'chuyên khoa', 'specialty', 'thống kê'],
  },
};

// ============================================================================
// SERVICE
// ============================================================================

@Injectable({
  providedIn: 'root',
})
export class LlmService {
  private readonly authService = inject(AuthService);
  private readonly themeService = inject(ThemeService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly ngZone = inject(NgZone);

  private readonly apiUrl = environment.llmUrl;

  // ===== MODEL CONFIGURATION =====
  // UPDATED: Using Qwen 3 4B as requested
  private readonly MODEL_NAME = 'qwen3:4b'; 

  // ===== SESSION SETTINGS =====
  private readonly SESSION_TIMEOUT = 15 * 60 * 1000; // 15 minutes
  private readonly THEME_COOLDOWN = 1000;

  // ===== CONTEXT SETTINGS =====
  private readonly MAX_CONTEXT_TOKENS = 8192;
  private readonly MAX_HISTORY_MESSAGES = 6;
  private readonly MAX_OUTPUT_TOKENS = 1024; // Increased for thinking output
  private readonly SYSTEM_PROMPT_BUDGET = 600;
  private readonly TOOL_BUDGET = 300;
  private readonly BUFFER_TOKENS = 100;
  private readonly AVG_CHARS_PER_TOKEN = 3.0;

  // ===== SAMPLING PARAMETERS =====
  private readonly SAMPLING_CONFIG = {
    temperature: 0.6, // Increased slightly to allow for "Thinking" creativity
    top_p: 0.85,
    top_k: 20,
    repeat_penalty: 1.1,
    presence_penalty: 0.1,
  };

  // ===== PERFORMANCE SETTINGS =====
  private readonly UI_UPDATE_DEBOUNCE_MS = 30;
  private readonly MAX_RETRIES = 2;
  private readonly RETRY_DELAY_MS = 800;
  private readonly CONNECT_TIMEOUT_MS = 15000;

  // ===== PUBLIC SIGNALS =====
  public readonly isOpen = signal<boolean>(false);
  public readonly isModelLoading = signal<boolean>(false);
  public readonly isGenerating = signal<boolean>(false);
  public readonly modelLoaded = signal<boolean>(false);
  public readonly loadProgress = signal<string>('');
  public readonly messages = signal<ChatMessage[]>([]);
  public readonly isNavigating = signal<boolean>(false);
  public readonly contextUsage = signal<number>(0);

  // ===== PRIVATE STATE =====
  private sessionTimeout?: ReturnType<typeof setTimeout>;
  private lastThemeChange = 0;
  private currentAbortController: AbortController | null = null;
  private messageIdCounter = 0;

  // ===== CACHING =====
  private _cachedAllowedRoutes: RouteInfo[] | null = null;
  private _cachedToolDefinitions: unknown[] | null = null;
  private _cachedSystemPrompt: string = '';
  private _systemPromptTokens: number = 0;
  private _lastUserPermissionsHash: string = '';
  private _routeEnumCache: string[] | null = null;

  // ===== DEBOUNCED UI UPDATES =====
  private readonly streamUpdate$ = new Subject<StreamUpdate>();
  private pendingContent = '';
  private pendingToolCalls: ToolCall[] = [];

  constructor() {
    effect(() => {
      if (!this.authService.isLoggedIn()) {
        this.cleanup();
      }
    });

    this.streamUpdate$
      .pipe(
        debounceTime(this.UI_UPDATE_DEBOUNCE_MS),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe((update) => {
        // Run update inside Angular Zone to ensure UI reflects changes
        this.ngZone.run(() => this.applyStreamUpdate(update));
      });

    this.destroyRef.onDestroy(() => this.cleanup());
  }

  // ============================================================================
  // PUBLIC API
  // ============================================================================

  public toggleChat(): void {
    const willOpen = !this.isOpen();
    this.isOpen.set(willOpen);

    if (willOpen) {
      this.resetSessionTimeout();
      if (!this.modelLoaded() && !this.isModelLoading()) {
        this.loadModel();
      }
    } else {
      this.clearSessionTimeout();
    }
  }

  public async sendMessage(content: string): Promise<void> {
    const sanitized = this.sanitizeInput(content);
    if (!sanitized) return;

    this.resetSessionTimeout();
    this.abortCurrentRequest();

    const newMsgTokens = this.estimateTokens(sanitized);

    this.messages.update((msgs) => [
      ...msgs,
      this.createMessage('user', sanitized, newMsgTokens),
    ]);

    const disambiguationMsg = this.checkAmbiguousNavigation(sanitized);
    if (disambiguationMsg) {
      this.messages.update((msgs) => [
        ...msgs,
        this.createMessage('assistant', disambiguationMsg),
      ]);
      return;
    }

    this.messages.update((msgs) => [
      ...msgs,
      this.createMessage('assistant', '', 0),
    ]);

    this.isGenerating.set(true);
    this.pendingContent = '';
    this.pendingToolCalls = [];

    try {
      await this.executeWithRetry(() => this.streamResponse(sanitized));
    } catch (error) {
      this.handleError(error);
    } finally {
      this.isGenerating.set(false);
      this.currentAbortController = null;
      this.cleanupEmptyResponse();
    }
  }

  public stopGeneration(): void {
    this.abortCurrentRequest();
    this.isGenerating.set(false);
  }

  public resetChat(): void {
    this.abortCurrentRequest();
    this.messages.set([]);
    this.contextUsage.set(0);
    this.messageIdCounter = 0;
    this.pendingContent = '';
    this.pendingToolCalls = [];

    if (this.modelLoaded() && this.authService.isLoggedIn()) {
      this.addGreetingMessage();
    }
  }

  public async loadModel(): Promise<void> {
    if (this.modelLoaded() || this.isModelLoading()) return;

    this.isModelLoading.set(true);
    this.loadProgress.set('Đang kết nối...');

    try {
      await this.checkServerHealth();
      this.modelLoaded.set(true);
      this.loadProgress.set('Sẵn sàng');

      this.getDynamicSystemPrompt();
      this.getToolDefinitions();

      if (this.messages().length === 0) {
        this.addGreetingMessage();
      }
    } catch (error) {
      console.error('AI Connection Error:', error);
      this.loadProgress.set('Không tìm thấy máy chủ AI');
    } finally {
      this.isModelLoading.set(false);
    }
  }

  // ============================================================================
  // STREAMING LOGIC
  // ============================================================================

  private async streamResponse(userMessage: string): Promise<void> {
    this.currentAbortController = new AbortController();
    const { signal } = this.currentAbortController;

    const contextMessages = this.prepareContextWindow(userMessage);
    const systemPrompt = this.getDynamicSystemPrompt();
    
    // HEURISTIC: Only attach tools if the user's intent looks like an action
    const shouldEnableTools = this.detectToolIntent(userMessage);
    const tools = shouldEnableTools ? this.getToolDefinitions() : undefined;

    const payload = {
      model: this.MODEL_NAME,
      messages: [
        { role: 'system', content: systemPrompt },
        ...contextMessages.map((m) => ({
          role: m.role,
          content: m.content,
          ...(m.role === 'tool' && m.toolName ? { tool_name: m.toolName } : {}),
        })),
        { role: 'user', content: userMessage },
      ],
      tools: tools,
      stream: true,
      options: {
        ...this.SAMPLING_CONFIG,
        num_predict: this.MAX_OUTPUT_TOKENS,
        num_ctx: this.MAX_CONTEXT_TOKENS,
        // CRITICAL: Enable thinking for Qwen3 to show reasoning
        enable_thinking: true, 
      },
    };

    const connectionTimeoutId = setTimeout(() => {
      this.currentAbortController?.abort();
    }, this.CONNECT_TIMEOUT_MS);

    try {
      console.log(`[LLM] Sending request to ${this.apiUrl} using model ${this.MODEL_NAME}. Tools enabled: ${shouldEnableTools}`);

      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal,
      });

      clearTimeout(connectionTimeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API error: ${response.status} - ${errorText}`);
      }

      if (!response.body) {
        throw new Error('No response body');
      }

      await this.processStream(response.body, signal);
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        if (signal.aborted) {
          console.log('[LLM] Request aborted by user or timeout');
          throw err;
        }
      }
      throw err;
    } finally {
      clearTimeout(connectionTimeoutId);
    }
  }

  private detectToolIntent(message: string): boolean {
    const normalized = message.toLowerCase();
    
    const actionKeywords = [
      'mở', 'xem', 'chuyển', 'vào', 'đi tới', 'open', 'go', 'navigate', 'show',
      'theme', 'giao diện', 'màu', 'sáng', 'tối', 'dark', 'light', 'mode',
      'bật', 'tắt', 'đổi', 'change', 'turn', 'switch',
      'ở đâu', 'chỗ nào', 'làm sao', 'như thế nào', 'cách', 'where', 'how' 
    ];

    if (actionKeywords.some(kw => normalized.includes(kw))) {
      return true;
    }

    const screenKeywords = Object.values(SCREEN_CONFIG).flatMap(c => c.keywords);
    const meaningfulKeywords = screenKeywords.filter(k => k.length > 3);

    if (meaningfulKeywords.some(kw => normalized.includes(kw))) {
      return true;
    }

    return false;
  }

  private async processStream(
    body: ReadableStream<Uint8Array>,
    signal: AbortSignal
  ): Promise<void> {
    return this.ngZone.runOutsideAngular(async () => {
      const reader = body.getReader();
      const decoder = new TextDecoder();
      let fullResponse = '';
      let detectedToolCalls: ToolCall[] = [];
      let buffer = '';

      try {
        while (!signal.aborted) {
          const { done, value } = await reader.read();

          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          buffer += chunk;
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;

            try {
              const json = JSON.parse(trimmed);

              // HANDLE THINKING: Append separate thinking field if present
              if (json.message?.thinking) {
                fullResponse += json.message.thinking;
              }

              if (json.message?.content) {
                fullResponse += json.message.content;
              }

              if (
                json.message?.tool_calls &&
                Array.isArray(json.message.tool_calls)
              ) {
                for (const tc of json.message.tool_calls) {
                  if (
                    tc.function?.name &&
                    !detectedToolCalls.some(
                      (existing) => existing.name === tc.function.name
                    )
                  ) {
                    detectedToolCalls.push({
                      name: tc.function.name,
                      arguments: tc.function.arguments || {},
                    });
                  }
                }
              }

              const displayContent = this.cleanResponseForDisplay(fullResponse);

              this.streamUpdate$.next({
                content: displayContent,
                tokenEstimate: this.estimateTokens(displayContent),
                toolCalls:
                  detectedToolCalls.length > 0
                    ? [...detectedToolCalls]
                    : undefined,
                isThinking: !!json.message?.thinking, // Signal UI that we are in thought mode
              });

              if (json.done === true) break;
            } catch (e) {
              console.warn('[LLM] JSON parse failed, skipping chunk');
            }
          }
        }
      } catch (streamError) {
        if (signal.aborted) return;
        console.error('[LLM] Stream error:', streamError);
        throw streamError;
      } finally {
        reader.releaseLock();

        // Check for text-based tool calls if native ones failed
        if (
          detectedToolCalls.length === 0 &&
          fullResponse.includes('<tool_call>')
        ) {
          const textToolCall = this.extractToolCallFromText(fullResponse);
          if (textToolCall) {
            detectedToolCalls.push(textToolCall);
          }
        }

        if (detectedToolCalls.length > 0) {
          await this.ngZone.run(async () => {
            await this.executeToolCalls(detectedToolCalls);
          });
        }

        const finalContent = this.cleanResponseForDisplay(fullResponse);
        this.streamUpdate$.next({
          content: finalContent,
          tokenEstimate: this.estimateTokens(finalContent),
          toolCalls: detectedToolCalls.length > 0 ? detectedToolCalls : undefined,
        });
      }
    });
  }

  private extractToolCallFromText(text: string): ToolCall | null {
    try {
      const hermesMatch = text.match(
        /<tool_call>\s*(\{[\s\S]*?"name"[\s\S]*?"arguments"[\s\S]*?\})\s*<\/tool_call>/i
      );
      if (hermesMatch) {
        const parsed = JSON.parse(hermesMatch[1]);
        if (parsed.name && parsed.arguments) {
          return { name: parsed.name, arguments: parsed.arguments };
        }
      }

      const jsonMatch = text.match(
        /\{\s*"name"\s*:\s*"([^"]+)"\s*,\s*"(?:arguments|parameters)"\s*:\s*(\{[^}]*\})\s*\}/i
      );
      if (jsonMatch) {
        return {
          name: jsonMatch[1],
          arguments: JSON.parse(jsonMatch[2]),
        };
      }
    } catch (e) {
      console.warn('[LLM] Tool call parse error:', e);
    }
    return null;
  }

  private cleanResponseForDisplay(text: string): string {
    if (!text) return '';
    let result = text;

    // UPDATED: Do NOT remove <think> tags. User wants to see reasoning.
    
    // Only remove technical tool artifacts
    result = result.replace(/<tool_call>[\s\S]*?<\/tool_call>/gi, '');
    result = result.replace(
      /```json\s*\{[^`]*"name"\s*:[^`]*(?:"arguments"|"parameters")\s*:[^`]*\}\s*```/gi,
      ''
    );
    // REMOVED: result = result.replace(/\/(?:no_)?think\b/gi, ''); 
    result = result.replace(/\n{3,}/g, '\n\n');

    return result.trim();
  }

private async executeToolCalls(toolCalls: ToolCall[]): Promise<void> {
    for (const call of toolCalls) {
      try {
        const result = await this.executeTool(call.name, call.arguments);
        
        const confirmation = this.getToolConfirmation(
          call.name,
          call.arguments,
          result
        );

        this.messages.update(msgs => [
          ...msgs,
          this.createMessage(
            'tool', 
            JSON.stringify({ success: result, message: confirmation }),
            0,
            call.name
          )
        ]);

        if (confirmation) {
              this.appendToLastMessage(confirmation); 
        }

      } catch (error) {
        console.error(`Tool execution failed for ${call.name}:`, error);
        const errorMsg = this.getToolErrorMessage(call.name);
        
        this.messages.update(msgs => [
          ...msgs,
          this.createMessage('tool', JSON.stringify({ error: errorMsg }), 0, call.name)
        ]);
        
        this.appendToLastMessage(errorMsg);
      }
    }
  }

  private async executeTool(
    name: string,
    args: Record<string, unknown>
  ): Promise<boolean> {
    switch (name) {
      case 'navigate_to_screen':
      case 'navigate': {
        const path = (args['path'] || args['screen'] || args['url']) as string;
        return this.triggerNavigation(path);
      }
      case 'change_theme':
      case 'toggle_theme': {
        const mode = (args['mode'] || args['theme'] || 'toggle') as string;
        return this.triggerThemeAction(mode);
      }
      default:
        console.warn(`[LLM] Unknown tool: ${name}`);
        throw new Error(`Unknown tool: ${name}`);
    }
  }

  private getToolConfirmation(
    name: string,
    args: Record<string, unknown>,
    result: boolean
  ): string {
    if (!result) return '';

    switch (name) {
      case 'navigate_to_screen':
      case 'navigate':
        return '✓ Đang chuyển trang...';
      case 'change_theme':
      case 'toggle_theme': {
        const mode = args['mode'] as string;
        if (mode === 'dark') return '✓ Đã bật giao diện tối.';
        if (mode === 'light') return '✓ Đã bật giao diện sáng.';
        return '✓ Đã đổi giao diện.';
      }
      default:
        return '';
    }
  }

  private getToolErrorMessage(name: string): string {
    switch (name) {
      case 'navigate_to_screen':
      case 'navigate':
        return '✗ Bạn không có quyền truy cập trang này.';
      case 'change_theme':
      case 'toggle_theme':
        return '✗ Không thể đổi giao diện lúc này.';
      default:
        return '✗ Không thể thực hiện.';
    }
  }

  private appendToLastMessage(text: string): void {
    this.messages.update((msgs) => {
      const newMsgs = [...msgs];
      const lastIdx = newMsgs.length - 1;

      if (lastIdx >= 0 && newMsgs[lastIdx].role === 'assistant') {
        const current = newMsgs[lastIdx].content.trim();
        newMsgs[lastIdx] = {
          ...newMsgs[lastIdx],
          content: current ? `${current}\n\n${text}` : text,
        };
      }
      return newMsgs;
    });
  }

  private applyStreamUpdate(update: StreamUpdate): void {
    this.messages.update((msgs) => {
      const newMsgs = [...msgs];
      const lastIdx = newMsgs.length - 1;

      if (lastIdx >= 0 && newMsgs[lastIdx].role === 'assistant') {
        newMsgs[lastIdx] = {
          ...newMsgs[lastIdx],
          content: update.content,
          tokenEstimate: update.tokenEstimate,
          toolCalls: update.toolCalls,
          isThinking: update.isThinking,
        };
      }
      return newMsgs;
    });
  }

  private cleanupEmptyResponse(): void {
    this.messages.update((msgs) => {
      const newMsgs = [...msgs];
      const lastIdx = newMsgs.length - 1;

      if (lastIdx >= 0 && newMsgs[lastIdx].role === 'assistant') {
        const content = newMsgs[lastIdx].content.trim();

        if (!content) {
          const hasToolCalls =
            newMsgs[lastIdx].toolCalls &&
            newMsgs[lastIdx].toolCalls!.length > 0;

          if (!hasToolCalls) {
            newMsgs[lastIdx] = {
              ...newMsgs[lastIdx],
              content: 'Xin lỗi, có lỗi xảy ra. Vui lòng thử lại.',
            };
          }
        }
      }
      return newMsgs;
    });
  }

  // ============================================================================
  // RETRY LOGIC
  // ============================================================================

  private async executeWithRetry<T>(fn: () => Promise<T>): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.MAX_RETRIES; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error as Error;

        if (error instanceof DOMException && error.name === 'AbortError') {
          throw error;
        }

        if (attempt < this.MAX_RETRIES) {
          await this.delay(this.RETRY_DELAY_MS * (attempt + 1));
        }
      }
    }

    throw lastError;
  }

  // ============================================================================
  // CONTEXT MANAGEMENT
  // ============================================================================

  private prepareContextWindow(newUserMessage: string): ChatMessage[] {
    const newMsgTokens = this.estimateTokens(newUserMessage);

    const availableForHistory =
      this.MAX_CONTEXT_TOKENS -
      this._systemPromptTokens -
      this.TOOL_BUDGET -
      this.MAX_OUTPUT_TOKENS -
      newMsgTokens -
      this.BUFFER_TOKENS;

    const history = this.messages()
      .filter((m) => m.content.trim() && m.role !== 'system')
      .map((m) => {
        if (m.role === 'assistant') {
          return {
            ...m,
            content: this.cleanResponseForDisplay(m.content),
          };
        }
        return m;
      })
      .filter((m) => m.content.trim());

    const result: ChatMessage[] = [];
    let usedTokens = 0;

    for (
      let i = history.length - 1;
      i >= 0 && result.length < this.MAX_HISTORY_MESSAGES;
      i--
    ) {
      const msg = history[i];
      const msgTokens = this.estimateTokens(msg.content);

      if (usedTokens + msgTokens > availableForHistory) break;

      usedTokens += msgTokens;
      result.unshift({ ...msg, tokenEstimate: msgTokens });
    }

    if (result.length > 0 && result[0].role === 'assistant') {
      result.shift();
    }

    const totalUsed =
      this._systemPromptTokens + this.TOOL_BUDGET + usedTokens + newMsgTokens;
    const usagePercent = Math.round(
      (totalUsed / this.MAX_CONTEXT_TOKENS) * 100
    );
    this.contextUsage.set(Math.min(usagePercent, 100));

    return result;
  }

  private estimateTokens(text: string): number {
    if (!text) return 0;
    const vietnameseChars = (
      text.match(
        /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/gi
      ) || []
    ).length;
    const baseTokens = Math.ceil(text.length / this.AVG_CHARS_PER_TOKEN);
    const vietnameseBonus = Math.ceil(vietnameseChars * 0.3);
    return baseTokens + vietnameseBonus + 4;
  }

  // ============================================================================
  // SYSTEM PROMPT
  // ============================================================================

  private getDynamicSystemPrompt(): string {
    const currentUser = this.authService.currentUser();
    const permissionsHash = JSON.stringify(currentUser?.permissions || []);

    if (permissionsHash !== this._lastUserPermissionsHash) {
      this._cachedSystemPrompt = '';
      this._cachedAllowedRoutes = null;
      this._cachedToolDefinitions = null;
      this._routeEnumCache = null;
      this._lastUserPermissionsHash = permissionsHash;
    }

    if (this._cachedSystemPrompt) {
      return this._cachedSystemPrompt;
    }

    const userName = currentUser?.fullName?.split(' ').pop() || 'bạn';
    const allowedRoutes = this.getAllowedRoutes();

    const routeList = allowedRoutes
      .slice(0, 10)
      .map((r) => `• ${r.title}: ${r.fullUrl}`)
      .join('\n');

    // Prompt optimized for Qwen 3 with Thinking allowed
    // Note: We removed "/no_think" from the previous prompt
    const prompt = `
Bạn là IT Assistant của Bệnh viện Hoàn Mỹ.
User: ${userName}

NHIỆM VỤ:
1. Điều hướng: Nếu user yêu cầu hoặc hỏi về tính năng có màn hình (ví dụ: "đổi mật khẩu ở đâu", "xem báo cáo"), hãy dùng tool navigate_to_screen NGAY LẬP TỨC.
2. Đổi theme: Dùng tool change_theme nếu user nhắc đến giao diện/màu sắc.
3. Chat thông thường: Trả lời ngắn gọn, hỗ trợ user.

SCREENS CÓ SẴN:
${routeList}

Liên hệ IT: hotline 1108/1109`;

    this._cachedSystemPrompt = prompt;
    this._systemPromptTokens = this.estimateTokens(prompt);

    return prompt;
  }

  // ============================================================================
  // TOOL DEFINITIONS
  // ============================================================================

  private getToolDefinitions(): unknown[] {
    if (this._cachedToolDefinitions) {
      return this._cachedToolDefinitions;
    }

    const routeEnums = this.getRouteEnums();

    const tools = [
      {
        type: 'function',
        function: {
          name: 'navigate_to_screen',
          description:
            'Điều hướng đến màn hình. Sử dụng khi user muốn mở, xem, hoặc hỏi cách truy cập một chức năng.',
          parameters: {
            type: 'object',
            properties: {
              path: {
                type: 'string',
                description: 'Đường dẫn màn hình (path)',
                enum: routeEnums,
              },
            },
            required: ['path'],
            additionalProperties: false,
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'change_theme',
          description:
            'Đổi theme. Sử dụng khi user muốn đổi giao diện, màu sáng/tối.',
          parameters: {
            type: 'object',
            properties: {
              mode: {
                type: 'string',
                description:
                  'Chế độ theme: "light" (sáng), "dark" (tối), hoặc "toggle" (đổi)',
                enum: ['light', 'dark', 'toggle'],
              },
            },
            required: ['mode'],
            additionalProperties: false,
          },
        },
      },
    ];

    this._cachedToolDefinitions = tools;
    return tools;
  }

  private getRouteEnums(): string[] {
    if (this._routeEnumCache) {
      return this._routeEnumCache;
    }

    this._routeEnumCache = this.getAllowedRoutes().map((r) => r.fullUrl);
    return this._routeEnumCache;
  }

  // ============================================================================
  // NAVIGATION & THEME
  // ============================================================================

  private triggerNavigation(path: string): boolean {
    if (this.isNavigating() || this.router.url === path) {
      return true;
    }

    const allowedRoutes = this.getAllowedRoutes();
    const isAllowed = allowedRoutes.some(
      (r) =>
        r.fullUrl === path || r.purePath === path || path.endsWith(r.purePath)
    );

    if (!isAllowed) {
      console.warn('Navigation blocked - permission denied:', path);
      return false;
    }

    this.isNavigating.set(true);

    const normalizedPath = path.startsWith('/') ? path : `/${path}`;

    setTimeout(() => {
      this.router.navigateByUrl(normalizedPath).finally(() => {
        setTimeout(() => this.isNavigating.set(false), 500);
      });
    }, 800);

    return true;
  }

  private triggerThemeAction(action: string): boolean {
    const now = Date.now();
    if (now - this.lastThemeChange < this.THEME_COOLDOWN) {
      return true;
    }
    this.lastThemeChange = now;

    const isDark = this.themeService.isDarkTheme();
    const mode = action.toLowerCase();

    if (
      (mode === 'dark' && !isDark) ||
      (mode === 'light' && isDark) ||
      mode === 'toggle'
    ) {
      this.themeService.toggleTheme();
    }

    return true;
  }

  // ============================================================================
  // ROUTES & PERMISSIONS
  // ============================================================================

  private getAllowedRoutes(): RouteInfo[] {
    if (!this._cachedAllowedRoutes) {
      this._cachedAllowedRoutes = this.scanRoutes(this.router.config);
    }
    return this._cachedAllowedRoutes;
  }

  private scanRoutes(routes: Routes, parentPath: string = ''): RouteInfo[] {
    const results: RouteInfo[] = [];

    for (const route of routes) {
      if (route.redirectTo || route.path === '**') continue;

      const pathPart = route.path || '';
      const fullPath = parentPath
        ? `${parentPath}/${pathPart}`
        : `/${pathPart}`;
      const purePath = fullPath.startsWith('/app/')
        ? fullPath.substring(5)
        : fullPath.substring(1);

      if (!this.checkRoutePermission(route)) continue;

      if (route.data?.['title']) {
        const config = SCREEN_CONFIG[purePath];
        results.push({
          title: route.data['title'] as string,
          fullUrl: fullPath,
          purePath,
          description: config?.description,
          keywords: config?.keywords,
        });
      }

      if (route.children) {
        results.push(...this.scanRoutes(route.children, fullPath));
      }
    }

    return results;
  }

  private checkRoutePermission(route: Route): boolean {
    const requiredPerm = route.data?.['permission'] as string | undefined;
    if (!requiredPerm) return true;

    const user = this.authService.currentUser();
    return user?.permissions?.some((p) => p.startsWith(requiredPerm)) ?? false;
  }

  // ============================================================================
  // DISAMBIGUATION
  // ============================================================================

  private checkAmbiguousNavigation(userMessage: string): string | null {
    const lowerMsg = userMessage.toLowerCase().trim();

    const navKeywords = [
      'mở',
      'chuyển',
      'đi',
      'vào',
      'xem',
      'open',
      'go',
      'navigate',
    ];
    const hasNavKeyword = navKeywords.some((kw) => lowerMsg.includes(kw));

    if (!hasNavKeyword) return null;

    let query = lowerMsg;
    navKeywords.forEach((kw) => {
      query = query.replace(new RegExp(kw, 'g'), '').trim();
    });
    query = query
      .replace(
        /trang|màn hình|screen|page|báo cáo|report|cho tôi|giúp|đến/g,
        ''
      )
      .trim();

    if (!query || query.length < 2) return null;

    const matches = this.findMatchingScreens(query);

    if (matches.length === 0) {
      const routes = this.getAllowedRoutes();
      const suggestions = routes
        .slice(0, 5)
        .map((r) => `• ${r.title}`)
        .join('\n');
      return `Không tìm thấy màn hình "${query}".\n\nCác màn hình có sẵn:\n${suggestions}`;
    }

    if (matches.length === 1) {
      return null;
    }

    const options = matches
      .slice(0, 5)
      .map(
        (m, i) =>
          `${i + 1}. ${m.title}${m.description ? ` - ${m.description}` : ''}`
      )
      .join('\n');

    return `Tìm thấy ${matches.length} màn hình phù hợp:\n\n${options}\n\nBạn muốn mở màn hình nào?`;
  }

  private findMatchingScreens(query: string): RouteInfo[] {
    const normalizedQuery = query.toLowerCase().trim();
    const queryWords = normalizedQuery.split(/\s+/);
    const allowedRoutes = this.getAllowedRoutes();

    return allowedRoutes.filter((route) => {
      const titleLower = route.title.toLowerCase();
      const pathLower = route.purePath.toLowerCase();
      const descLower = route.description?.toLowerCase() || '';
      const keywords = route.keywords || [];

      return queryWords.some(
        (word) =>
          titleLower.includes(word) ||
          pathLower.includes(word) ||
          descLower.includes(word) ||
          keywords.some((kw) => kw.includes(word) || word.includes(kw))
      );
    });
  }

  // ============================================================================
  // UTILITIES
  // ============================================================================

  private sanitizeInput(content: string): string {
    return content
      .trim()
      .slice(0, 1000)
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
  }

  private createMessage(
    role: 'user' | 'assistant' | 'system' | 'tool',
    content: string,
    tokenEstimate?: number,
    toolName?: string
  ): ChatMessage {
    return {
      id: this.generateMessageId(),
      role,
      content,
      tokenEstimate: tokenEstimate ?? this.estimateTokens(content),
      timestamp: Date.now(),
      ...(toolName ? { toolName } : {}),
    };
  }

  private async checkServerHealth(): Promise<void> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    try {
      const baseUrl = this.getBaseUrl();
      const response = await fetch(baseUrl, {
        method: 'GET',
        signal: controller.signal,
      });

      if (!response.ok && response.status !== 404) {
        throw new Error('Server unreachable');
      }
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private getBaseUrl(): string {
    try {
      const urlObj = new URL(this.apiUrl);
      return `${urlObj.protocol}//${urlObj.host}/`;
    } catch {
      return this.apiUrl;
    }
  }

  private addGreetingMessage(): void {
    const name =
      this.authService.currentUser()?.fullName?.split(' ').pop() || 'bạn';
    this.messages.update((msgs) => [
      ...msgs,
      this.createMessage(
        'assistant',
        `Chào ${name}! Tôi là IT Assistant. Bạn cần hỗ trợ gì?`
      ),
    ]);
  }

  private handleError(error: unknown): void {
    const isAbort =
      error instanceof DOMException && error.name === 'AbortError';

    if (!isAbort) {
      console.error('[LLM] Error details:', {
        name: error instanceof Error ? error.name : 'Unknown',
        message: error instanceof Error ? error.message : String(error),
        model: this.MODEL_NAME,
        apiUrl: this.apiUrl,
      });

      this.messages.update((msgs) => {
        const newMsgs = [...msgs];
        const lastIdx = newMsgs.length - 1;

        if (lastIdx >= 0 && newMsgs[lastIdx].role === 'assistant') {
          const errorMessage =
            error instanceof Error && error.message.includes('404')
              ? `Model "${this.MODEL_NAME}" không tìm thấy. Chạy: ollama pull ${this.MODEL_NAME}`
              : 'Hệ thống đang bận, vui lòng thử lại.';

          newMsgs[lastIdx] = {
            ...newMsgs[lastIdx],
            content: errorMessage,
          };
        }
        return newMsgs;
      });
    }
  }

  private abortCurrentRequest(): void {
    if (this.currentAbortController) {
      this.currentAbortController.abort();
      this.currentAbortController = null;
    }
  }

  private cleanup(): void {
    this.abortCurrentRequest();
    this.clearSessionTimeout();
    this.resetChat();
    this.isOpen.set(false);

    this._cachedSystemPrompt = '';
    this._cachedAllowedRoutes = null;
    this._cachedToolDefinitions = null;
    this._routeEnumCache = null;
  }

  private resetSessionTimeout(): void {
    this.clearSessionTimeout();
    this.sessionTimeout = setTimeout(() => {
      this.resetChat();
      this.isOpen.set(false);
    }, this.SESSION_TIMEOUT);
  }

  private clearSessionTimeout(): void {
    if (this.sessionTimeout) {
      clearTimeout(this.sessionTimeout);
      this.sessionTimeout = undefined;
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private generateMessageId(): string {
    return `msg_${Date.now()}_${++this.messageIdCounter}`;
  }
}