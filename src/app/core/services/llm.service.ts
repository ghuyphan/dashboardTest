import { Injectable, signal, inject, effect, DestroyRef } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router, Routes, Route } from '@angular/router';
import { AuthService } from './auth.service';
import { ThemeService } from './theme.service';
import { environment } from '../../../environments/environment.development';
import { Subject, debounceTime } from 'rxjs';

export interface ChatMessage {
  id: string;  // Unique identifier for tracking
  role: 'user' | 'assistant' | 'system';
  content: string;
  tokenEstimate?: number;
  timestamp?: number;
}

interface StreamUpdate {
  content: string;
  tokenEstimate: number;
}

const SCREEN_DESCRIPTIONS: Record<string, string> = {
  'home': 'Trang chính, thống kê tổng quan',
  'settings': 'Cài đặt tài khoản, đổi mật khẩu',
  'equipment/catalog': 'Danh sách máy móc, in QR, biên bản bàn giao',
  'equipment/dashboard': 'Dashboard thiết bị, biểu đồ tình trạng',
  'reports/bed-usage': 'Công suất giường bệnh theo khoa',
  'reports/examination-overview': 'Tổng quan khám chữa bệnh, BHYT/Viện phí',
  'reports/missing-medical-records': 'Báo cáo bác sĩ chưa hoàn tất HSBA',
  'reports/cls-level3': 'Hoạt động CLS Tầng 3',
  'reports/cls-level6': 'Hoạt động CLS Tầng 6',
  'reports/specialty-cls': 'Thống kê CLS theo Chuyên khoa'
};

@Injectable({
  providedIn: 'root',
})
export class LlmService {
  private readonly authService = inject(AuthService);
  private readonly themeService = inject(ThemeService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  private readonly apiUrl = environment.llmUrl;
  private readonly MODEL_NAME = 'gemma3:4b-it-qat';
  private readonly SESSION_TIMEOUT = 15 * 60 * 1000;
  private readonly THEME_COOLDOWN = 1000;

  // ===== CONTEXT SETTINGS =====
  private readonly MAX_CONTEXT_TOKENS = 6000;
  private readonly MAX_HISTORY_MESSAGES = 6;
  private readonly MAX_OUTPUT_TOKENS = 512;
  private readonly AVG_CHARS_PER_TOKEN = 3.5;

  // ===== PERFORMANCE SETTINGS =====
  private readonly UI_UPDATE_DEBOUNCE_MS = 50; // Batch UI updates
  private readonly MAX_RETRIES = 2;
  private readonly RETRY_DELAY_MS = 1000;

  // --- Signals ---
  public readonly isOpen = signal<boolean>(false);
  public readonly isModelLoading = signal<boolean>(false);
  public readonly isGenerating = signal<boolean>(false);
  public readonly modelLoaded = signal<boolean>(false);
  public readonly loadProgress = signal<string>('');
  public readonly messages = signal<ChatMessage[]>([]);
  public readonly isNavigating = signal<boolean>(false);
  public readonly contextUsage = signal<number>(0);

  // --- Internal State ---
  private sessionTimeout?: ReturnType<typeof setTimeout>;
  private lastThemeChange = 0;
  private currentAbortController: AbortController | null = null;
  private messageIdCounter = 0;  // Unique ID counter
  
  // --- Caching ---
  private _cachedAllowedPaths: string[] | null = null;
  private _cachedSystemPrompt: string = '';
  private _systemPromptTokens: number = 0;
  private _lastUserPermissionsHash: string = '';

  // --- Debounced UI Updates ---
  private readonly streamUpdate$ = new Subject<StreamUpdate>();

  constructor() {
    // Setup auth state listener
    effect(() => {
      if (!this.authService.isLoggedIn()) {
        this.cleanup();
      }
    });

    // Debounce stream updates to reduce change detection cycles
    this.streamUpdate$
      .pipe(
        debounceTime(this.UI_UPDATE_DEBOUNCE_MS),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe(update => this.applyStreamUpdate(update));

    // Cleanup on destroy
    this.destroyRef.onDestroy(() => this.cleanup());
  }

  // ===== PUBLIC API =====

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
    this.abortCurrentRequest(); // Cancel any in-flight request

    const newMsgTokens = this.estimateTokens(sanitized);

    // Add user message with unique ID
    this.messages.update(msgs => [
      ...msgs,
      { 
        id: this.generateMessageId(),
        role: 'user', 
        content: sanitized, 
        tokenEstimate: newMsgTokens, 
        timestamp: Date.now() 
      }
    ]);

    // Add assistant placeholder with unique ID
    this.messages.update(msgs => [
      ...msgs,
      { 
        id: this.generateMessageId(),
        role: 'assistant', 
        content: '', 
        tokenEstimate: 0, 
        timestamp: Date.now() 
      }
    ]);

    this.isGenerating.set(true);

    try {
      await this.executeWithRetry(() => this.streamResponse(sanitized));
    } catch (error) {
      this.handleError(error);
    } finally {
      this.isGenerating.set(false);
      this.currentAbortController = null;
      
      // Ensure we don't have an empty assistant message
      this.cleanupEmptyResponse();
    }
  }

  /**
   * Remove empty assistant response or add fallback message
   */
  private cleanupEmptyResponse(): void {
    this.messages.update(msgs => {
      const newMsgs = [...msgs];
      const lastIdx = newMsgs.length - 1;
      
      if (lastIdx >= 0 && newMsgs[lastIdx].role === 'assistant') {
        const content = newMsgs[lastIdx].content.trim();
        
        if (!content) {
          // Replace empty response with fallback
          newMsgs[lastIdx] = {
            ...newMsgs[lastIdx],
            content: 'Xin lỗi, tôi không hiểu yêu cầu của bạn. Bạn có thể nói rõ hơn được không?'
          };
        }
      }
      
      return newMsgs;
    });
  }

  public stopGeneration(): void {
    this.abortCurrentRequest();
    this.isGenerating.set(false);
  }

  public resetChat(): void {
    this.abortCurrentRequest();
    this.messages.set([]);
    this.contextUsage.set(0);
    this.messageIdCounter = 0;  // Reset ID counter

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

      // Pre-warm caches
      this.getDynamicSystemPrompt();
      this.getAllowedPaths();

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

  // ===== STREAMING LOGIC =====

  private async streamResponse(userMessage: string): Promise<void> {
    this.currentAbortController = new AbortController();
    const { signal } = this.currentAbortController;

    const contextMessages = this.prepareContextWindow(userMessage);
    const systemPrompt = this.getDynamicSystemPrompt();

    const payload = {
      model: this.MODEL_NAME,
      messages: [
        { role: 'system', content: systemPrompt },
        ...contextMessages.map(m => ({ role: m.role, content: m.content })),
        { role: 'user', content: userMessage }
      ],
      stream: true,
      options: {
        temperature: 1,
        top_p: 0.8,
        top_k: 25,
        repeat_penalty: 1.2,
        num_predict: this.MAX_OUTPUT_TOKENS,
        num_ctx: this.MAX_CONTEXT_TOKENS,
        mirostat: 0,
        stop: ['\n\nUser:', '\n\nHuman:', '[[END]]', '</s>']
      }
    };

    const response = await fetch(this.apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    if (!response.body) {
      throw new Error('No response body');
    }

    await this.processStream(response.body, signal);
  }

  private async processStream(body: ReadableStream<Uint8Array>, signal: AbortSignal): Promise<void> {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let fullResponse = '';
    let hasActionTriggered = false;
    let commandConfirmation = '';
    let buffer = ''; // Handle partial JSON chunks

    try {
      while (!signal.aborted) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        
        // Keep incomplete line in buffer
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed === '[DONE]') continue;

          try {
            const jsonStr = trimmed.startsWith('data: ') ? trimmed.slice(6) : trimmed;
            const json = JSON.parse(jsonStr);
            const token = json.message?.content || json.choices?.[0]?.delta?.content || json.response || '';

            if (token) {
              fullResponse += token;

              // Check for commands (only execute once)
              if (!hasActionTriggered) {
                const commandMatch = fullResponse.match(/\[\[(NAVIGATE|THEME):(.*?)]]/);
                if (commandMatch) {
                  const [fullMatch, commandType, arg] = commandMatch;
                  fullResponse = fullResponse.replace(fullMatch, '').trim();
                  
                  // Execute command and get confirmation
                  const success = this.executeCommand(commandType, arg.trim());
                  commandConfirmation = success 
                    ? this.getCommandConfirmation(commandType, arg.trim())
                    : (commandType === 'NAVIGATE' ? this.getNavigationErrorMessage(arg.trim()) : '');
                  
                  hasActionTriggered = true;
                }
              }

              // Get display text (strip any commands and incomplete command patterns)
              let displayText = this.getDisplayText(fullResponse);
              
              // If display is empty but we have a confirmation, use it
              if (!displayText && commandConfirmation) {
                displayText = commandConfirmation;
              }

              // Debounced UI update
              this.streamUpdate$.next({
                content: displayText,
                tokenEstimate: this.estimateTokens(displayText)
              });
            }

            if (json.done) break;
          } catch {
            // Ignore JSON parse errors for incomplete chunks
          }
        }
      }
    } finally {
      reader.releaseLock();
      
      // Final update - strip any remaining commands
      let finalText = this.getDisplayText(fullResponse);
      
      // Use confirmation if text is empty
      if (!finalText && commandConfirmation) {
        finalText = commandConfirmation;
      }
      
      this.applyStreamUpdate({
        content: finalText,
        tokenEstimate: this.estimateTokens(finalText)
      });
    }
  }

  /**
   * Strip commands and incomplete command patterns from display text
   */
  private getDisplayText(text: string): string {
    // Remove complete commands: [[NAVIGATE:...]] or [[THEME:...]]
    let result = text.replace(/\[\[(NAVIGATE|THEME):[^\]]*]]/g, '');
    
    // Remove incomplete command patterns at the end (being typed)
    // Matches: [[ or [[N or [[NAVIGATE: or [[NAVIGATE:/path (without closing ]])
    result = result.replace(/\[\[(?:NAVIGATE|THEME)?:?[^\]]*$/i, '');
    
    // Also handle case where just [[ is at the end
    result = result.replace(/\[\[$/g, '');
    
    // Clean up extra whitespace
    return result.trim();
  }

  /**
   * Get confirmation message for executed command
   */
  private getCommandConfirmation(type: string, arg: string): string {
    switch (type) {
      case 'NAVIGATE':
        return `Đang chuyển đến trang bạn yêu cầu...`;
      case 'THEME':
        const themeAction = arg.toLowerCase();
        if (themeAction === 'dark') return 'Đã chuyển sang giao diện tối.';
        if (themeAction === 'light') return 'Đã chuyển sang giao diện sáng.';
        return 'Đã thay đổi giao diện.';
      default:
        return '';
    }
  }

  /**
   * Get error message when navigation fails
   */
  private getNavigationErrorMessage(path: string): string {
    return `Xin lỗi, tôi không thể mở "${path}". Chức năng này không tồn tại hoặc bạn không có quyền truy cập.`;
  }

  private applyStreamUpdate(update: StreamUpdate): void {
    this.messages.update(msgs => {
      const newMsgs = [...msgs];
      const lastIdx = newMsgs.length - 1;
      if (lastIdx >= 0 && newMsgs[lastIdx].role === 'assistant') {
        newMsgs[lastIdx] = {
          ...newMsgs[lastIdx],
          content: update.content,
          tokenEstimate: update.tokenEstimate
        };
      }
      return newMsgs;
    });
  }

  // ===== RETRY LOGIC =====

  private async executeWithRetry<T>(fn: () => Promise<T>): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.MAX_RETRIES; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error as Error;
        
        // Don't retry on abort or client errors
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

  // ===== CONTEXT MANAGEMENT =====

  private prepareContextWindow(newUserMessage: string): ChatMessage[] {
    const newMsgTokens = this.estimateTokens(newUserMessage);
    const availableForHistory = this.MAX_CONTEXT_TOKENS
      - this._systemPromptTokens
      - this.MAX_OUTPUT_TOKENS
      - newMsgTokens
      - 100;

    const history = this.messages().filter(m => m.content.trim() && m.role !== 'system');
    const result: ChatMessage[] = [];
    let usedTokens = 0;

    // Build from most recent
    for (let i = history.length - 1; i >= 0 && result.length < this.MAX_HISTORY_MESSAGES; i--) {
      const msg = history[i];
      const msgTokens = msg.tokenEstimate || this.estimateTokens(msg.content);

      if (usedTokens + msgTokens > availableForHistory) break;

      usedTokens += msgTokens;
      result.unshift({ ...msg, tokenEstimate: msgTokens });
    }

    // Update context usage
    const totalUsed = this._systemPromptTokens + usedTokens + newMsgTokens;
    this.contextUsage.set(Math.round((totalUsed / this.MAX_CONTEXT_TOKENS) * 100));

    return result;
  }

  private estimateTokens(text: string): number {
    if (!text) return 0;
    return Math.ceil(text.length / this.AVG_CHARS_PER_TOKEN) + 4;
  }

  // ===== SYSTEM PROMPT =====

// ===== SYSTEM PROMPT =====

  private getDynamicSystemPrompt(): string {
    const currentUser = this.authService.currentUser();
    const permissionsHash = JSON.stringify(currentUser?.permissions || []);

    if (permissionsHash !== this._lastUserPermissionsHash) {
      this._cachedSystemPrompt = '';
      this._cachedAllowedPaths = null;
      this._lastUserPermissionsHash = permissionsHash;
    }

    if (this._cachedSystemPrompt) {
      return this._cachedSystemPrompt;
    }

    const routes = this.scanRoutes(this.router.config);
    const sitemap = routes
      .map(r => {
        const desc = SCREEN_DESCRIPTIONS[r.purePath] || '';
        return `- ${r.title}: ${r.fullUrl} (${desc})`;
      })
      .join('\n');

    // IMPROVED PROMPT
    const prompt = `Bạn là Trợ lý ảo IT (IT Assistant) thân thiện của hệ thống Hoàn Mỹ.
Người dùng hiện tại: ${currentUser?.fullName || 'Khách'}

NHIỆM VỤ CỦA BẠN:
1. Trò chuyện tự nhiên: Nếu người dùng chào hỏi, than vãn (buồn, chán, mệt), hãy trả lời ân cần, hài hước hoặc động viên họ ngắn gọn. Đừng lúc nào cũng hỏi về chức năng.
2. Hỗ trợ hệ thống: Chỉ khi người dùng hỏi về công việc hoặc chức năng, hãy dùng danh sách dưới đây để hỗ trợ.

DANH SÁCH CHỨC NĂNG (SITEMAP):
${sitemap}

CÁC LỆNH HỆ THỐNG (System Commands):
- Nếu người dùng muốn mở một màn hình cụ thể, hãy trả về: [[NAVIGATE:/đường-dẫn]]
- Nếu người dùng muốn đổi giao diện (tối/sáng), hãy trả về: [[THEME:dark/light/toggle]]
- Hotline IT: 1108 hoặc 1109.

QUY TẮC PHẢN HỒI:
- Không được bịa ra chức năng không có trong Sitemap.
- Với câu hỏi đời thường: Trả lời thân thiện (VD: "Mệt thì nghỉ chút đi bạn", "Uống cafe không?").
- Với yêu cầu công việc: Thực hiện lệnh ngay lập tức.`;

    this._cachedSystemPrompt = prompt;
    this._systemPromptTokens = this.estimateTokens(prompt);

    return prompt;
  }

  // ===== COMMAND EXECUTION =====

  private executeCommand(type: string, arg: string): boolean {
    switch (type) {
      case 'NAVIGATE':
        return this.triggerNavigation(arg);
      case 'THEME':
        return this.triggerThemeAction(arg);
      default:
        return false;
    }
  }

  private triggerNavigation(path: string): boolean {
    if (this.isNavigating() || this.router.url === path) {
      return true; // Already there or navigating
    }

    const allowedPaths = this.getAllowedPaths();
    if (!allowedPaths.includes(path)) {
      console.warn('Navigation blocked:', path);
      return false; // Not allowed
    }

    this.isNavigating.set(true);

    setTimeout(() => {
      this.router.navigateByUrl(path).finally(() => {
        setTimeout(() => this.isNavigating.set(false), 800);
      });
    }, 1000);

    return true;
  }

  private triggerThemeAction(action: string): boolean {
    const now = Date.now();
    if (now - this.lastThemeChange < this.THEME_COOLDOWN) {
      return true; // Cooldown, but not an error
    }
    this.lastThemeChange = now;

    const isDark = this.themeService.isDarkTheme();
    const mode = action.toLowerCase();

    if ((mode === 'dark' && !isDark) || (mode === 'light' && isDark) || mode === 'toggle') {
      this.themeService.toggleTheme();
    }

    return true;
  }

  // ===== ROUTES & PERMISSIONS =====

  private getAllowedPaths(): string[] {
    if (!this._cachedAllowedPaths) {
      this._cachedAllowedPaths = this.scanRoutes(this.router.config).map(r => r.fullUrl);
    }
    return this._cachedAllowedPaths;
  }

  private scanRoutes(
    routes: Routes,
    parentPath: string = ''
  ): { title: string; fullUrl: string; purePath: string }[] {
    const results: { title: string; fullUrl: string; purePath: string }[] = [];

    for (const route of routes) {
      if (route.redirectTo || route.path === '**') continue;

      const pathPart = route.path || '';
      const fullPath = parentPath ? `${parentPath}/${pathPart}` : `/${pathPart}`;
      const purePath = fullPath.startsWith('/app/') ? fullPath.substring(5) : fullPath.substring(1);

      if (!this.checkRoutePermission(route)) continue;

      if (route.data?.['title']) {
        results.push({
          title: route.data['title'] as string,
          fullUrl: fullPath,
          purePath
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
    return user?.permissions?.some(p => p.startsWith(requiredPerm)) ?? false;
  }

  // ===== UTILITIES =====

  private sanitizeInput(content: string): string {
    return content.replace(/\[\[(NAVIGATE|THEME):.*?]]/g, '').trim();
  }

  private async checkServerHealth(): Promise<void> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    try {
      const baseUrl = this.getBaseUrl();
      const response = await fetch(baseUrl, {
        method: 'GET',
        signal: controller.signal
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
    const name = this.authService.currentUser()?.fullName || 'bạn';
    this.messages.update(msgs => [
      ...msgs,
      {
        id: this.generateMessageId(),
        role: 'assistant',
        content: `Chào ${name}! Tôi là IT Assistant. Bạn cần hỗ trợ gì?`,
        tokenEstimate: 25,
        timestamp: Date.now()
      }
    ]);
  }

  private handleError(error: unknown): void {
    const isAbort = error instanceof DOMException && error.name === 'AbortError';
    
    if (!isAbort) {
      console.error('AI Error:', error);
      this.messages.update(msgs => {
        const newMsgs = [...msgs];
        const lastIdx = newMsgs.length - 1;
        if (lastIdx >= 0) {
          newMsgs[lastIdx] = {
            ...newMsgs[lastIdx],
            content: 'Hệ thống đang bận, vui lòng thử lại.'
          };
        }
        return newMsgs;
      });
    }
  }

  // ===== CLEANUP =====

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
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Generate unique message ID
   */
  private generateMessageId(): string {
    return `msg_${Date.now()}_${++this.messageIdCounter}`;
  }
}