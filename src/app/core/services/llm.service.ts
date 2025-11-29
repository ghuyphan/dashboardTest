import {
  Injectable,
  signal,
  inject,
  effect,
  DestroyRef,
  NgZone,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router, Routes, Route } from '@angular/router';
import { AuthService } from './auth.service';
import { ThemeService } from './theme.service';
import { environment } from '../../../environments/environment.development';
import { Subject, debounceTime } from 'rxjs';

// ... (Giữ nguyên các Interface)
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  tokenEstimate?: number;
  timestamp?: number;
  toolCalls?: ToolCall[];
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
}

interface RouteInfo {
  title: string;
  fullUrl: string;
  purePath: string;
  keywords?: string[];
}

interface ToolResult {
  success: boolean;
  data?: string;
  error?: string;
}

interface MessageClassification {
  type: 'greeting' | 'acknowledgment' | 'business_intent' | 'blocked_topic' | 'harmful' | 'unknown';
  confidence: number;
  suggestedResponse?: string;
}

// ... (CONSTANTS: SCREEN_CONFIG, BLOCKED_PATTERNS, HARMFUL_PATTERNS, INJECTION_PATTERNS, BUSINESS_KEYWORDS, ALLOWED_TOOLS) ...
const SCREEN_CONFIG: Record<string, string[]> = {
  home: ['home', 'trang chủ', 'chính', 'dashboard', 'tổng quan'],
  settings: [
    'settings', 'cài đặt', 'tài khoản', 'account',
    'mật khẩu', 'pass', 'password', 'đổi pass', 'đổi mật khẩu',
    'thông tin', 'cá nhân', 'profile', 'hồ sơ',
  ],
  'equipment/catalog': ['thiết bị', 'máy móc', 'catalog', 'danh sách', 'qr', 'bàn giao'],
  'equipment/dashboard': ['thiết bị dashboard', 'biểu đồ thiết bị'],
  'reports/bed-usage': ['giường', 'bed', 'công suất'],
  'reports/examination-overview': ['khám', 'examination', 'bhyt', 'viện phí', 'doanh thu'],
  'reports/missing-medical-records': ['hsba', 'hồ sơ bệnh án', 'medical records'],
  'reports/cls-level3': ['cls', 'tầng 3', 'lầu 3', 'level3'],
  'reports/cls-level6': ['cls', 'tầng 6', 'lầu 6', 'level6'],
  'reports/specialty-cls': ['cls chuyên khoa', 'specialty'],
};

const BLOCKED_PATTERNS: RegExp[] = [
  /viết\s*(code|script|chương trình|hàm)/i, /code\s*(python|java|javascript|sql)/i, /(fix|sửa|debug)\s*(code|bug)/i,
  /viết\s*(thơ|bài hát|truyện|văn|essay)/i, /sáng tác|compose/i,
  /(dịch|translate).*(sang|to).*(tiếng|ngôn ngữ)/i,
  /(chính trị|bầu cử|tôn giáo|religion)/i,
  /(nấu|làm|chế biến)\s*(ăn|món|bánh)/i, /recipe|cooking/i,
  /(tình yêu|hẹn hò|dating)/i,
  /(giá|price)\s*(vàng|bitcoin|stock|chứng khoán)/i, /(đầu tư|invest|trading|crypto)/i,
  /(phim|movie|game).*(hay|recommend)/i,
  /(thủ đô|capital)\s*(của|of)/i, /(ai là|who is).*(tổng thống|president)/i,
  /giải\s*(phương trình|toán)/i,
  /^.{0,20}(chán|buồn|mệt|stress|vui|happy|sad|tired|bored).{0,15}$/i,
];

const HARMFUL_PATTERNS: RegExp[] = [
  /(thuốc|cách)\s*(độc|chết|tự tử)/i, /cách\s*(giết|hại|đầu độc)/i,
  /(hack|crack|exploit|bypass)\s*(password|system)/i, /(sql injection|xss|ddos|phishing|malware)/i,
  /truy cập\s*(trái phép|admin|root)/i,
  /(làm|chế tạo)\s*(bom|thuốc nổ|weapon)/i, /(ma túy|drug|cocaine)/i,
  /(lấy|đánh cắp)\s*(thông tin|data).*(bệnh nhân|patient)/i,
];

const INJECTION_PATTERNS: RegExp[] = [
  /ignore\s*(previous|all)\s*(instructions?|prompts?)/i, /bỏ qua\s*(hướng dẫn|quy tắc)/i,
  /system\s*prompt/i, /(show|reveal)\s*(your|the)\s*(prompt|instructions?)/i,
  /\b(DAN|jailbreak)\b/i, /(pretend|act)\s*(like|as)/i, /giả vờ\s*(là|như)/i,
  /you are now|bây giờ bạn là/i, /\[INST\]|<<SYS>>|<\|im_/i,
];

const BUSINESS_KEYWORDS = [
  'bệnh viện', 'khoa', 'bệnh nhân', 'bác sĩ', 'giường', 'khám',
  'báo cáo', 'report', 'thống kê', 'dashboard', 'hsba', 'hồ sơ', 'bhyt', 'viện phí',
  'thiết bị', 'equipment', 'catalog', 'màn hình', 'trang', 'mở', 'xem', 'chuyển', 'vào',
  'cài đặt', 'settings', 'mật khẩu', 'password', 'giao diện', 'theme', 'sáng', 'tối', 'dark', 'light',
  'cls', 'tầng 3', 'tầng 6',
];

const ALLOWED_TOOLS = ['navigate_to_screen', 'navigate', 'change_theme', 'toggle_theme'] as const;
type AllowedToolName = (typeof ALLOWED_TOOLS)[number];

@Injectable({ providedIn: 'root' })
export class LlmService {
  private readonly authService = inject(AuthService);
  private readonly themeService = inject(ThemeService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly ngZone = inject(NgZone);

  private readonly apiUrl = environment.llmUrl;
  private readonly MODEL_NAME = 'qwen3-vl:4b-instruct';

  // Settings
  private readonly SESSION_TIMEOUT_MS = 15 * 60 * 1000;
  private readonly THEME_COOLDOWN_MS = 1000;
  private readonly MAX_CONTEXT_TOKENS = 8192;
  private readonly MAX_HISTORY_MESSAGES = 4;
  private readonly MAX_OUTPUT_TOKENS = 1024;
  private readonly TOOL_BUDGET_TOKENS = 300;
  private readonly AVG_CHARS_PER_TOKEN = 3.0;
  private readonly UI_UPDATE_DEBOUNCE_MS = 30;
  private readonly MAX_RETRIES = 2;
  private readonly RETRY_DELAY_MS = 800;
  private readonly CONNECT_TIMEOUT_MS = 30000;
  private readonly MAX_INPUT_LENGTH = 500;
  private readonly MAX_OUTPUT_LENGTH = 2000;
  private readonly RATE_LIMIT_MAX = 15;
  private readonly RATE_LIMIT_WINDOW_MS = 60_000;
  private readonly RATE_LIMIT_COOLDOWN_MS = 10_000;

  // Sampling
  private readonly SAMPLING = {
    temperature: 0.3,
    top_p: 0.85,
    top_k: 20,
    repeat_penalty: 1.15,
  };

  // Signals
  public readonly isOpen = signal(false);
  public readonly isModelLoading = signal(false);
  public readonly isGenerating = signal(false);
  public readonly modelLoaded = signal(false);
  public readonly loadProgress = signal('');
  public readonly messages = signal<ChatMessage[]>([]);
  public readonly isNavigating = signal(false);
  public readonly contextUsage = signal(0);

  // State
  private sessionTimeout?: ReturnType<typeof setTimeout>;
  private lastThemeChange = 0;
  private currentAbortController: AbortController | null = null;
  private messageIdCounter = 0;
  private messageTimestamps: number[] = [];
  private rateLimitCooldownUntil = 0;

  // Cache
  private cachedRoutes: RouteInfo[] | null = null;
  private cachedTools: unknown[] | null = null;
  private cachedPrompt = '';
  private promptTokens = 0;
  private permissionsHash = '';

  private readonly streamUpdate$ = new Subject<StreamUpdate>();

  constructor() {
    effect(() => {
      if (!this.authService.isLoggedIn()) this.cleanup();
    });

    this.streamUpdate$
      .pipe(debounceTime(this.UI_UPDATE_DEBOUNCE_MS), takeUntilDestroyed(this.destroyRef))
      .subscribe((u) => this.ngZone.run(() => this.applyStreamUpdate(u)));

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
      if (!this.modelLoaded() && !this.isModelLoading()) this.loadModel();
    } else {
      this.clearSessionTimeout();
    }
  }

  public async sendMessage(content: string): Promise<void> {
    const sanitized = this.sanitizeInput(content);
    if (!sanitized) return;

    const rateCheck = this.checkRateLimit();
    if (!rateCheck.allowed) {
      this.addAssistantMessage(rateCheck.message!);
      return;
    }

    const classification = this.classifyIntent(sanitized);

    if (classification.type === 'harmful' || classification.type === 'blocked_topic') {
      this.messages.update((m) => [
        ...m,
        this.createMessage('user', sanitized),
        this.createMessage('assistant', classification.suggestedResponse!),
      ]);
      return;
    }

    if ((classification.type === 'greeting' || classification.type === 'acknowledgment') &&
        classification.suggestedResponse) {
      this.messages.update((m) => [
        ...m,
        this.createMessage('user', sanitized),
        this.createMessage('assistant', classification.suggestedResponse!),
      ]);
      return;
    }

    this.resetSessionTimeout();
    this.abortCurrentRequest();

    this.messages.update((m) => [...m, this.createMessage('user', sanitized)]);

    const disambiguation = this.checkAmbiguousNavigation(sanitized);
    if (disambiguation) {
      this.messages.update((m) => [...m, this.createMessage('assistant', disambiguation)]);
      return;
    }

    this.messages.update((m) => [...m, this.createMessage('assistant', '', 0)]);
    this.isGenerating.set(true);

    try {
      await this.executeWithRetry(() => this.streamResponse(sanitized));
    } catch (e) {
      this.handleError(e);
    } finally {
      this.finalizeLastMessage(); // POLISH: Clean up final text
      this.isGenerating.set(false);
      this.currentAbortController = null;
      this.cleanupEmptyResponse();
    }
  }

  public stopGeneration(): void {
    this.abortCurrentRequest();
    this.isGenerating.set(false);
    this.finalizeLastMessage();
  }

  public resetChat(): void {
    this.abortCurrentRequest();
    this.messages.set([]);
    this.contextUsage.set(0);
    this.messageIdCounter = 0;
    this.messageTimestamps = [];
    this.rateLimitCooldownUntil = 0;

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
      this.getSystemPrompt();
      this.getToolDefinitions();
      if (this.messages().length === 0) this.addGreetingMessage();
    } catch (e) {
      console.error('[LLM] Connection Error:', e);
      this.loadProgress.set('Không thể kết nối máy chủ AI');
    } finally {
      this.isModelLoading.set(false);
    }
  }

  // ============================================================================
  // CLASSIFICATION
  // ============================================================================

  private classifyIntent(message: string): MessageClassification {
    const n = message.toLowerCase().trim();

    if (INJECTION_PATTERNS.some((p) => p.test(n))) {
      return { type: 'harmful', confidence: 1, suggestedResponse: 'Yêu cầu không hợp lệ.' };
    }

    if (HARMFUL_PATTERNS.some((p) => p.test(n))) {
      return {
        type: 'harmful',
        confidence: 1,
        suggestedResponse: 'Không thể xử lý yêu cầu này. Liên hệ IT Helpdesk (1108/1109) nếu cần hỗ trợ.',
      };
    }

    if (BLOCKED_PATTERNS.some((p) => p.test(n))) {
      return {
        type: 'blocked_topic',
        confidence: 0.9,
        suggestedResponse: 'Nội dung ngoài phạm vi hỗ trợ. Tôi có thể giúp điều hướng hệ thống hoặc đổi giao diện.',
      };
    }

    if (n.length < 50) {
      const greeting = this.getGreetingResponse(n);
      if (greeting) return { type: 'greeting', confidence: 0.95, suggestedResponse: greeting };

      const ack = this.getAckResponse(n);
      if (ack) return { type: 'acknowledgment', confidence: 0.95, suggestedResponse: ack };
    }

    if (this.detectToolIntent(message) || BUSINESS_KEYWORDS.some((k) => n.includes(k))) {
      return { type: 'business_intent', confidence: 0.85 };
    }

    if (n.length > 150 && !BUSINESS_KEYWORDS.some((k) => n.includes(k))) {
      return {
        type: 'blocked_topic',
        confidence: 0.7,
        suggestedResponse: 'Câu hỏi ngoài phạm vi hỗ trợ. Tôi giúp điều hướng hệ thống. Bạn cần mở trang nào?',
      };
    }

    return { type: 'unknown', confidence: 0.5 };
  }

  private getGreetingResponse(n: string): string | null {
    if (/^(xin\s*)?(chào|hello|hi|hey)[!.?]*$/i.test(n)) return 'Xin chào. Tôi có thể hỗ trợ gì cho bạn?';
    if (/^(bạn là ai|bạn tên gì)[?]*$/i.test(n)) {
      return 'Tôi là Trợ lý IT Bệnh viện Hoàn Mỹ. Tôi hỗ trợ điều hướng hệ thống và đổi giao diện.';
    }
    if (/^(bạn (làm|giúp) (được )?gì|help)[?]*$/i.test(n)) {
      return 'Tôi hỗ trợ các tác vụ sau:\n• Điều hướng màn hình (báo cáo, cài đặt...)\n• Đổi giao diện sáng/tối\n\nBạn cần tôi giúp gì?';
    }
    return null;
  }

  private getAckResponse(n: string): string | null {
    if (/^(xin\s*)?(cảm ơn|thanks?|thank you)(\s*(nhiều|bạn|nhé|nhen|bot|ad))?[!.?]*$/i.test(n)) return 'Không có gì. Chúc bạn làm việc hiệu quả.';
    if (/^(ok|okay|oke|được|vâng|dạ|ừ|rồi|hiểu rồi)[!.]*$/i.test(n)) return 'Bạn cần hỗ trợ gì thêm không?';
    if (/^(không|no|ko)[!.]*$/i.test(n)) return 'Vâng, tôi đã rõ.';
    if (/^(tạm biệt|bye)[!.?]*$/i.test(n)) return 'Tạm biệt. Hẹn gặp lại!';
    return null;
  }

  // ============================================================================
  // RATE LIMITING
  // ============================================================================

  private checkRateLimit(): { allowed: boolean; message?: string } {
    const now = Date.now();

    if (now < this.rateLimitCooldownUntil) {
      const sec = Math.ceil((this.rateLimitCooldownUntil - now) / 1000);
      return { allowed: false, message: `Vui lòng chờ ${sec} giây trước khi gửi tin nhắn mới.` };
    }

    this.messageTimestamps = this.messageTimestamps.filter((t) => now - t < this.RATE_LIMIT_WINDOW_MS);

    if (this.messageTimestamps.length >= this.RATE_LIMIT_MAX) {
      this.rateLimitCooldownUntil = now + this.RATE_LIMIT_COOLDOWN_MS;
      return { allowed: false, message: 'Bạn gửi quá nhanh. Vui lòng đợi một lát.' };
    }

    this.messageTimestamps.push(now);
    return { allowed: true };
  }

  // ============================================================================
  // SANITIZATION
  // ============================================================================

  private sanitizeInput(content: string): string {
    if (!content) return '';
    let r = content.trim();
    if (r.length > this.MAX_INPUT_LENGTH) r = r.slice(0, this.MAX_INPUT_LENGTH);
    r = r.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
    r = r.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n');
    r = r.replace(/```[\s\S]*?```/g, '');
    r = r.replace(/<[^>]+>/g, '');
    r = r.replace(/\[INST\]|\[\/INST\]|<<SYS>>|<<\/SYS>>|<\|im_\w+\|>/gi, '');
    return r.trim();
  }

  private sanitizeOutput(content: string): string {
    if (!content) return '';
    let r = content;
    r = r.replace(/navigate_to_screen\s+[\/\w\-]+/gi, '');
    r = r.replace(/change_theme\s+(dark|light|toggle)/gi, '');
    r = r.replace(/\{\s*"name"\s*:[^}]+\}/gi, '');
    r = r.replace(/<tool_call>[\s\S]*?<\/tool_call>/gi, '');
    r = r.replace(/https?:\/\/(?!localhost)[^\s<>]+/gi, '');
    if (r.length > this.MAX_OUTPUT_LENGTH) r = r.substring(0, this.MAX_OUTPUT_LENGTH) + '...';
    return r.replace(/\n{3,}/g, '\n\n').trim();
  }

  // ============================================================================
  // STREAMING
  // ============================================================================

  private async streamResponse(userMessage: string): Promise<void> {
    this.currentAbortController = new AbortController();
    const { signal } = this.currentAbortController;

    const context = this.prepareContext(userMessage);
    const systemPrompt = this.getSystemPrompt();
    const hasToolIntent = this.detectToolIntent(userMessage);
    const tools = hasToolIntent ? this.getToolDefinitions() : undefined;
    const outputTokens = hasToolIntent ? 256 : userMessage.length < 30 ? 128 : 512;

    const payload = {
      model: this.MODEL_NAME,
      messages: [
        { role: 'system', content: systemPrompt },
        ...context.map((m) => ({ role: m.role, content: m.content })),
        { role: 'user', content: userMessage },
      ],
      tools,
      stream: true,
      options: { ...this.SAMPLING, num_predict: outputTokens, num_ctx: this.MAX_CONTEXT_TOKENS },
    };

    const timeout = setTimeout(() => this.currentAbortController?.abort(), this.CONNECT_TIMEOUT_MS);

    try {
      const res = await fetch(this.apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal,
      });

      clearTimeout(timeout);

      if (!res.ok) throw new Error(`API error: ${res.status}`);
      if (!res.body) throw new Error('No response body');

      await this.processStream(res.body, signal);
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') throw e;
      throw e;
    } finally {
      clearTimeout(timeout);
    }
  }

  private detectToolIntent(message: string): boolean {
    const n = message.toLowerCase();
    const nav = ['mở', 'xem', 'chuyển', 'vào', 'đi tới', 'navigate', 'open', 'go', 'show'];
    const theme = ['theme', 'giao diện', 'sáng', 'tối', 'dark', 'light', 'đổi'];
    const task = ['password', 'mật khẩu', 'đổi pass', 'báo cáo', 'settings', 'cài đặt', 'thiết bị'];

    if (nav.some((k) => n.includes(k))) return true;
    if (theme.some((k) => n.includes(k))) return true;
    if (task.some((k) => n.includes(k))) return true;

    const screenKw = Object.values(SCREEN_CONFIG).flat().filter((k) => k.length > 3);
    return screenKw.some((k) => n.includes(k));
  }

private async processStream(body: ReadableStream<Uint8Array>, signal: AbortSignal): Promise<void> {
    return this.ngZone.runOutsideAngular(async () => {
      const reader = body.getReader();
      const decoder = new TextDecoder();
      let content = '';
      let toolCalls: ToolCall[] = [];
      let buffer = '';

      try {
        while (!signal.aborted) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;

            try {
              const json = JSON.parse(trimmed);

              if (json.message?.content) {
                content += json.message.content;
              }

              if (Array.isArray(json.message?.tool_calls)) {
                for (const tc of json.message.tool_calls) {
                  if (tc.function?.name && !toolCalls.some((t) => t.name === tc.function.name)) {
                    if (this.isValidTool(tc.function.name)) {
                      toolCalls.push({ name: tc.function.name, arguments: tc.function.arguments || {} });
                    }
                  }
                }
              }

              // ONLY update the stream while generating if NO tools have been detected yet
              // This prevents the UI from flickering if the model outputs text + tools
              if (content.trim() && toolCalls.length === 0) {
                this.streamUpdate$.next({
                  content: this.sanitizeOutput(content),
                  tokenEstimate: this.estimateTokens(content),
                  toolCalls: undefined,
                });
              }

              if (json.done === true) break;
            } catch {
              continue;
            }
          }
        }

        if (buffer.trim()) {
          try {
            const json = JSON.parse(buffer);
            if (json.message?.content) content += json.message.content;
          } catch {}
        }
      } catch (e) {
        if (signal.aborted) return;
        throw e;
      } finally {
        reader.releaseLock();

        // Fallback: extract tool calls from text
        if (toolCalls.length === 0) {
          const textTool = this.extractToolFromText(content);
          if (textTool && this.isValidTool(textTool.name)) {
            toolCalls.push(textTool);
          }
        }

        // --- FIXED LOGIC START ---
        if (toolCalls.length > 0) {
          // 1. Execute tools. 
          // Note: executeToolCalls internally calls `setLastAssistantMessage` 
          // which updates the UI with "I am navigating..."
          await this.ngZone.run(() => this.executeToolCalls(toolCalls));
          
          // 2. IMPORTANT: Do NOT call streamUpdate$.next() here.
          // Calling it would pass `content` (which is likely empty after sanitization)
          // and overwrite the confirmation message set by executeToolCalls.
        } else {
          // Only update with text content if NO tools were executed
          this.streamUpdate$.next({
            content: this.sanitizeOutput(content),
            tokenEstimate: this.estimateTokens(content),
            toolCalls: undefined,
          });
        }
        // --- FIXED LOGIC END ---
      }
    });
  }

  private extractToolFromText(text: string): ToolCall | null {
    try {
      // <tool_call>JSON</tool_call>
      const xmlMatch = text.match(/<tool_call>\s*(\{[\s\S]*?"name"[\s\S]*?\})\s*<\/tool_call>/i);
      if (xmlMatch) {
        const p = JSON.parse(xmlMatch[1]);
        if (p.name && p.arguments) return { name: p.name, arguments: p.arguments };
      }

      // Inline JSON
      const jsonMatch = text.match(/\{\s*"name"\s*:\s*"([^"]+)"\s*,\s*"(?:arguments|parameters)"\s*:\s*(\{[^}]*\})\s*\}/i);
      if (jsonMatch) return { name: jsonMatch[1], arguments: JSON.parse(jsonMatch[2]) };

      // Plain text: navigate_to_screen path
      const navMatch = text.match(/navigate_to_screen\s+[\/]?(?:app[\/])?([^\s\n]+)/i);
      if (navMatch) {
        let path = navMatch[1].trim();
        if (!path.startsWith('/')) path = '/app/' + path;
        return { name: 'navigate_to_screen', arguments: { path } };
      }

      // Plain text: change_theme mode
      const themeMatch = text.match(/change_theme\s+(dark|light|toggle)/i);
      if (themeMatch) return { name: 'change_theme', arguments: { mode: themeMatch[1].toLowerCase() } };
    } catch {}
    return null;
  }

  // ============================================================================
  // TOOL EXECUTION
  // ============================================================================

  private isValidTool(name: string): name is AllowedToolName {
    return ALLOWED_TOOLS.includes(name as AllowedToolName);
  }

  private async executeToolCalls(calls: ToolCall[]): Promise<void> {
    for (const call of calls.slice(0, 3)) {
      if (!this.isValidTool(call.name)) continue;

      try {
        const result = await this.executeTool(call.name, call.arguments);
        const msg = this.getToolConfirmation(call.name, call.arguments, result);
        if (msg) this.setLastAssistantMessage(msg);
      } catch (e) {
        console.error(`[LLM] Tool error ${call.name}:`, e);
        this.setLastAssistantMessage(this.getToolError(call.name));
      }
    }
  }

  private async executeTool(name: AllowedToolName, args: Record<string, unknown>): Promise<ToolResult> {
    switch (name) {
      case 'navigate_to_screen':
      case 'navigate': {
        const path = (args['path'] || args['screen'] || args['url']) as string;
        if (!path) return { success: false, error: 'Đường dẫn không hợp lệ' };
        return this.doNavigation(path);
      }
      case 'change_theme':
      case 'toggle_theme': {
        const mode = (args['mode'] || args['theme'] || 'toggle') as string;
        return this.doThemeChange(mode);
      }
      default:
        return { success: false, error: 'Chức năng không hỗ trợ' };
    }
  }

  // Helper for random responses
  private getRandomResponse(responses: string[]): string {
    return responses[Math.floor(Math.random() * responses.length)];
  }

private getToolConfirmation(name: string, args: Record<string, unknown>, result: ToolResult): string {
    if (!result.success) return result.error || 'Xin lỗi, tôi gặp sự cố khi thực hiện thao tác này.';

    // --- CHECK FOR ALREADY ON PAGE ---
    if (result.data === 'ALREADY_ON_PAGE') {
      return this.getRandomResponse([
        'Bạn đang ở màn hình này rồi.',
        'Chúng ta đang ở trang này mà.',
        'Đây chính là màn hình bạn yêu cầu.',
        'Bạn đang xem trang đó rồi, không cần chuyển hướng nữa.'
      ]);
    }
    // ---------------------------------

    switch (name) {
      case 'navigate_to_screen':
      case 'navigate': {
        const screenName = result.data || 'màn hình';
        const path = (args['path'] || '') as string;
        
        // Specific for settings page
        if (path.includes('settings')) {
          return this.getRandomResponse([
            `Tôi đang mở **${screenName}**. Bạn có thể kiểm tra thông tin hoặc đổi mật khẩu tại đó.`,
            `Đã chuyển hướng. Bạn có thể xem cài đặt tại màn hình **${screenName}** ngay bây giờ.`,
            `Tôi đã mở màn hình **${screenName}** cho bạn.`
          ]);
        }
        
        // Generic pages
        return this.getRandomResponse([
          `Tôi đang chuyển hướng bạn đến **${screenName}**. Vui lòng đợi trong giây lát.`,
          `Đã rõ, tôi đang mở màn hình **${screenName}** theo yêu cầu của bạn.`,
          `Vâng, tôi sẽ đưa bạn đến trang **${screenName}** ngay bây giờ.`
        ]);
      }
      case 'change_theme':
      case 'toggle_theme': {
        const currentMode = result.data || '';
        if (currentMode === 'dark' || currentMode.includes('tối')) {
            return this.getRandomResponse([
            'Tôi đã chuyển sang **Giao diện tối**. Hy vọng bạn sẽ thấy dịu mắt hơn.',
            'Đã kích hoạt **Chế độ tối**. Giao diện bây giờ đã chuyển sang màu tối.',
            'Vâng, tôi đã đổi sang giao diện tối cho bạn.'
          ]);
        }
        if (currentMode === 'light' || currentMode.includes('sáng')) {
            return this.getRandomResponse([
            'Tôi đã chuyển về **Giao diện sáng** giúp hiển thị rõ ràng hơn.',
            'Đã bật **Chế độ sáng**. Giao diện đã sáng trở lại.',
            'Vâng, tôi đã đổi lại giao diện sáng cho bạn.'
          ]);
        }
        return 'Tôi đã thực hiện đổi giao diện thành công.';
      }
      default:
        return 'Thao tác đã hoàn tất.';
    }
  }

  private getToolError(name: string): string {
    if (name.includes('navigate')) return 'Xin lỗi, tôi không thể mở trang này. Có thể bạn chưa được cấp quyền truy cập.';
    if (name.includes('theme')) return 'Tôi không thể đổi giao diện lúc này. Vui lòng thử lại sau.';
    return 'Xin lỗi, tôi không thể thực hiện thao tác này.';
  }

  private setLastAssistantMessage(text: string): void {
    this.messages.update((msgs) => {
      const newMsgs = [...msgs];
      for (let i = newMsgs.length - 1; i >= 0; i--) {
        if (newMsgs[i].role === 'assistant') {
          newMsgs[i] = { ...newMsgs[i], content: text };
          break;
        }
      }
      return newMsgs;
    });
  }

  // POLISH: Clean up the final message to have "Head and Tail"
  private finalizeLastMessage(): void {
    this.messages.update((msgs) => {
      const newMsgs = [...msgs];
      const lastIdx = newMsgs.length - 1;
      
      if (lastIdx >= 0 && newMsgs[lastIdx].role === 'assistant') {
        let content = newMsgs[lastIdx].content.trim();
        
        if (!content) return newMsgs;

        // 1. Capitalize first letter
        content = content.charAt(0).toUpperCase() + content.slice(1);

        // 2. Ensure punctuation at the end for full sentences
        const lastChar = content.slice(-1);
        const validEndings = ['.', '!', '?', ':', ')', '"', "'"];
        // Only add dot if it's a decent length sentence (not just "OK") and missing punctuation
        if (!validEndings.includes(lastChar) && content.length > 5) {
          content += '.';
        }

        newMsgs[lastIdx] = { ...newMsgs[lastIdx], content };
      }
      return newMsgs;
    });
  }

  private applyStreamUpdate(u: StreamUpdate): void {
    this.messages.update((msgs) => {
      const newMsgs = [...msgs];
      const last = newMsgs.length - 1;
      if (last >= 0 && newMsgs[last].role === 'assistant') {
        newMsgs[last] = { ...newMsgs[last], content: u.content, tokenEstimate: u.tokenEstimate, toolCalls: u.toolCalls };
      }
      return newMsgs;
    });
  }

  private cleanupEmptyResponse(): void {
    this.messages.update((msgs) => {
      const newMsgs = [...msgs];
      const last = newMsgs.length - 1;
      if (last >= 0 && newMsgs[last].role === 'assistant' && !newMsgs[last].content.trim()) {
        if (!newMsgs[last].toolCalls?.length) {
          newMsgs[last] = { ...newMsgs[last], content: 'Có lỗi xảy ra trong quá trình phản hồi. Vui lòng thử lại.' };
        }
      }
      return newMsgs;
    });
  }

  // ============================================================================
  // NAVIGATION & THEME
  // ============================================================================

private doNavigation(path: string): ToolResult {
    // Standardize URLs to ignore query params for comparison
    const currentPath = this.router.url.split('?')[0];
    const targetPath = path.split('?')[0];

    if (this.isNavigating() || currentPath === targetPath) {
      // Return a specific flag
      return { success: true, data: 'ALREADY_ON_PAGE' };
    }

    const routes = this.getAllowedRoutes();
    const route = routes.find((r) =>
      r.fullUrl === path || r.purePath === path || path.endsWith(r.purePath) || r.fullUrl.endsWith(path)
    );

    if (!route) return { success: false, error: 'Không có quyền truy cập trang này.' };

    this.isNavigating.set(true);
    setTimeout(() => {
      this.router.navigateByUrl(route.fullUrl).finally(() => {
        setTimeout(() => this.isNavigating.set(false), 500);
      });
    }, 800);

    return { success: true, data: route.title };
  }

  private doThemeChange(action: string): ToolResult {
    const now = Date.now();
    const isDark = this.themeService.isDarkTheme();

    if (now - this.lastThemeChange < this.THEME_COOLDOWN_MS) {
      return { success: true, data: isDark ? 'dark' : 'light' };
    }
    this.lastThemeChange = now;

    const mode = action.toLowerCase();
    let newMode: 'dark' | 'light';

    if (mode === 'dark') {
      if (!isDark) this.themeService.toggleTheme();
      newMode = 'dark';
    } else if (mode === 'light') {
      if (isDark) this.themeService.toggleTheme();
      newMode = 'light';
    } else {
      this.themeService.toggleTheme();
      newMode = isDark ? 'light' : 'dark';
    }

    return { success: true, data: newMode };
  }

  // ============================================================================
  // ROUTES
  // ============================================================================

  private getAllowedRoutes(): RouteInfo[] {
    if (!this.cachedRoutes) this.cachedRoutes = this.scanRoutes(this.router.config);
    return this.cachedRoutes;
  }

  private scanRoutes(routes: Routes, parent = ''): RouteInfo[] {
    const results: RouteInfo[] = [];

    for (const route of routes) {
      if (route.redirectTo || route.path === '**') continue;

      const path = route.path || '';
      const fullPath = parent ? `${parent}/${path}` : `/${path}`;
      const purePath = fullPath.startsWith('/app/') ? fullPath.substring(5) : fullPath.substring(1);

      if (!this.checkPermission(route)) continue;

      if (route.data?.['title']) {
        results.push({
          title: route.data['title'] as string,
          fullUrl: fullPath,
          purePath,
          keywords: SCREEN_CONFIG[purePath],
        });
      }

      if (route.children) results.push(...this.scanRoutes(route.children, fullPath));
    }

    return results;
  }

  private checkPermission(route: Route): boolean {
    const perm = route.data?.['permission'] as string | undefined;
    if (!perm) return true;
    const user = this.authService.currentUser();
    return user?.permissions?.some((p) => p.startsWith(perm)) ?? false;
  }

  // ============================================================================
  // DISAMBIGUATION
  // ============================================================================

private checkAmbiguousNavigation(msg: string): string | null {
    const n = msg.toLowerCase().trim();
    
    // 1. THEME GUARD: Nếu câu lệnh liên quan đến đổi theme, return null ngay
    // để AI tự xử lý (gọi tool change_theme), không cố xử lý như là navigation.
    const themeKw = ['theme', 'giao diện', 'sáng', 'tối', 'dark', 'light', 'chế độ', 'màu'];
    if (themeKw.some(k => n.includes(k))) return null;

    // 2. NAV CHECK: Tiếp tục kiểm tra navigation như cũ
    // Đã xóa từ 'đi' khỏi danh sách vì trong tiếng Việt 'đi' hay dùng làm từ đệm cuối câu gây bắt nhầm
    const navKw = ['mở', 'chuyển', 'vào', 'xem', 'open', 'go', 'navigate', 'to', 'đến', 'tới']; 
    if (!navKw.some((k) => n.includes(k))) return null;

    let query = n;
    navKw.forEach((k) => (query = query.replace(new RegExp(k, 'g'), '')));
    // Xóa thêm các từ đệm
    query = query.replace(/trang|màn hình|screen|page|báo cáo|report|cho tôi|giúp|đến|tới|của|đi/g, '').trim();
    
    if (!query || query.length < 2) return null;

    const matches = this.findMatchingScreens(query);

    if (matches.length === 0) {
      const routes = this.getAllowedRoutes();
      // Lấy ngẫu nhiên 5 trang để gợi ý thay vì luôn lấy 5 trang đầu
      const shuffled = [...routes].sort(() => 0.5 - Math.random());
      const list = shuffled.slice(0, 5).map((r) => `• ${r.title}`).join('\n');
      
      return this.getRandomResponse([
        `Hmm, tôi không tìm thấy màn hình nào tên là "${query}". Bạn có muốn thử một trong các trang này không?\n\n${list}`,
        `Xin lỗi, hệ thống không có trang "${query}". Dưới đây là một số màn hình phổ biến:\n\n${list}`,
        `Có vẻ như tôi chưa hiểu ý bạn. Bạn đang tìm trang nào trong danh sách này?\n\n${list}`
      ]);
    }

    if (matches.length === 1) return null;

    const opts = matches.slice(0, 5).map((m, i) => `${i + 1}. ${m.title}`).join('\n');
    return `Tôi tìm thấy ${matches.length} màn hình phù hợp:\n\n${opts}\n\nBạn muốn tôi mở màn hình nào?`;
  }

  private findMatchingScreens(query: string): RouteInfo[] {
    const words = query.toLowerCase().split(/\s+/).filter((w) => w.length > 1);
    return this.getAllowedRoutes().filter((r) => {
      const title = r.title.toLowerCase();
      const path = r.purePath.toLowerCase();
      const kw = r.keywords || [];
      return words.some((w) => title.includes(w) || path.includes(w) || kw.some((k) => k.includes(w)));
    });
  }

  // ============================================================================
  // CONTEXT
  // ============================================================================

  private prepareContext(newMsg: string): ChatMessage[] {
    const newTokens = this.estimateTokens(newMsg);
    const available = this.MAX_CONTEXT_TOKENS - this.promptTokens - this.TOOL_BUDGET_TOKENS -
                      this.MAX_OUTPUT_TOKENS - newTokens - 100;

    const history = this.messages()
      .filter((m) => m.content.trim() && m.role !== 'system' && m.role !== 'tool')
      .map((m) => ({
        ...m,
        content: m.content.length > 150 ? m.content.substring(0, 150) + '...' : m.content,
      }));

    const result: ChatMessage[] = [];
    let used = 0;

    for (let i = history.length - 1; i >= 0 && result.length < this.MAX_HISTORY_MESSAGES; i--) {
      const tokens = this.estimateTokens(history[i].content);
      if (used + tokens > available) break;
      used += tokens;
      result.unshift(history[i]);
    }

    if (result.length > 0 && result[0].role === 'assistant') result.shift();

    this.contextUsage.set(Math.min(100, Math.round(((this.promptTokens + used + newTokens) / this.MAX_CONTEXT_TOKENS) * 100)));

    return result;
  }

  private estimateTokens(text: string): number {
    if (!text) return 0;
    const vn = (text.match(/[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/gi) || []).length;
    return Math.ceil(text.length / this.AVG_CHARS_PER_TOKEN) + Math.ceil(vn * 0.3) + 4;
  }

  // ============================================================================
  // SYSTEM PROMPT
  // ============================================================================

  private getSystemPrompt(): string {
    const hash = JSON.stringify(this.authService.currentUser()?.permissions || []);

    if (hash !== this.permissionsHash) {
      this.cachedPrompt = '';
      this.cachedRoutes = null;
      this.cachedTools = null;
      this.permissionsHash = hash;
    }

    if (this.cachedPrompt) return this.cachedPrompt;

    const routes = this.getAllowedRoutes();
    const routeList = routes.slice(0, 10).map((r) => `${r.purePath}:${r.title}`).join('|');

    // POLISH: Updated system prompt for better structure
    this.cachedPrompt = `Trợ lý IT Bệnh viện Hoàn Mỹ.
PHẠM VI: Điều hướng màn hình + đổi theme. Không reset pass/sửa máy/truy cập DB.
HÀNH ĐỘNG: navigate_to_screen (đổi pass→settings) hoặc change_theme.
NGOÀI PHẠM VI: "Liên hệ hotline IT 1108/1109"
ROUTES: ${routeList}
YÊU CẦU: Trả lời ngắn gọn, có đầu đuôi (đầy đủ chủ ngữ/vị ngữ), thân thiện và lịch sự. Nếu thực hiện lệnh, không cần giải thích chi tiết kỹ thuật./no_think`;

    this.promptTokens = this.estimateTokens(this.cachedPrompt);
    return this.cachedPrompt;
  }

  // ============================================================================
  // TOOLS
  // ============================================================================

  private getToolDefinitions(): unknown[] {
    if (this.cachedTools) return this.cachedTools;

    const routeEnums = this.getAllowedRoutes().map((r) => r.fullUrl);

    this.cachedTools = [
      {
        type: 'function',
        function: {
          name: 'navigate_to_screen',
          description: 'Mở màn hình',
          parameters: {
            type: 'object',
            properties: { path: { type: 'string', enum: routeEnums } },
            required: ['path'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'change_theme',
          description: 'Đổi giao diện',
          parameters: {
            type: 'object',
            properties: { mode: { type: 'string', enum: ['light', 'dark', 'toggle'] } },
            required: ['mode'],
          },
        },
      },
    ];

    return this.cachedTools;
  }

  // ============================================================================
  // UTILITIES
  // ============================================================================

  private async executeWithRetry<T>(fn: () => Promise<T>): Promise<T> {
    let lastError: Error | null = null;

    for (let i = 0; i <= this.MAX_RETRIES; i++) {
      try {
        return await fn();
      } catch (e) {
        lastError = e as Error;
        if (e instanceof DOMException && e.name === 'AbortError') throw e;
        if (i < this.MAX_RETRIES) await this.delay(this.RETRY_DELAY_MS * (i + 1));
      }
    }

    throw lastError;
  }

  private addAssistantMessage(content: string): void {
    this.messages.update((m) => [...m, this.createMessage('assistant', content)]);
  }

  private createMessage(role: ChatMessage['role'], content: string, tokenEstimate?: number): ChatMessage {
    return {
      id: `msg_${Date.now()}_${++this.messageIdCounter}`,
      role,
      content,
      tokenEstimate: tokenEstimate ?? this.estimateTokens(content),
      timestamp: Date.now(),
    };
  }

  private async checkServerHealth(): Promise<void> {
    const ctrl = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(), 5000);

    try {
      const url = new URL(this.apiUrl);
      const res = await fetch(`${url.protocol}//${url.host}/`, { method: 'GET', signal: ctrl.signal });
      if (!res.ok && res.status !== 404) throw new Error('Server unreachable');
    } finally {
      clearTimeout(timeout);
    }
  }

  private addGreetingMessage(): void {
    this.messages.update((m) => [
      ...m,
      this.createMessage('assistant', 'Xin chào. Tôi là Trợ lý IT Bệnh viện Hoàn Mỹ. Tôi hỗ trợ điều hướng hệ thống và đổi giao diện.'),
    ]);
  }

  private handleError(error: unknown): void {
    if (error instanceof DOMException && error.name === 'AbortError') return;

    console.error('[LLM] Error:', error);

    this.messages.update((msgs) => {
      const newMsgs = [...msgs];
      const last = newMsgs.length - 1;
      if (last >= 0 && newMsgs[last].role === 'assistant') {
        const msg = error instanceof Error && error.message.includes('404')
          ? `Model "${this.MODEL_NAME}" không khả dụng. Vui lòng liên hệ IT Helpdesk.`
          : 'Hệ thống đang bận. Vui lòng thử lại sau giây lát.';
        newMsgs[last] = { ...newMsgs[last], content: msg };
      }
      return newMsgs;
    });
  }

  private abortCurrentRequest(): void {
    this.currentAbortController?.abort();
    this.currentAbortController = null;
  }

  private cleanup(): void {
    this.abortCurrentRequest();
    this.clearSessionTimeout();
    this.resetChat();
    this.isOpen.set(false);
    this.modelLoaded.set(false);
    this.cachedPrompt = '';
    this.cachedRoutes = null;
    this.cachedTools = null;
  }

  private resetSessionTimeout(): void {
    this.clearSessionTimeout();
    this.sessionTimeout = setTimeout(() => {
      this.resetChat();
      this.isOpen.set(false);
    }, this.SESSION_TIMEOUT_MS);
  }

  private clearSessionTimeout(): void {
    if (this.sessionTimeout) {
      clearTimeout(this.sessionTimeout);
      this.sessionTimeout = undefined;
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
  }
}