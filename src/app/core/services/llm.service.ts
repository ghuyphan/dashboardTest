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
  key: string; // Short key for token optimization
  keywords?: string[];
}

interface ToolResult {
  success: boolean;
  data?: string;
  error?: string;
}

interface MessageClassification {
  type: 'greeting' | 'acknowledgment' | 'tool_intent' | 'blocked' | 'harmful' | 'unknown';
  confidence: number;
  response?: string;
}

// ============================================================================
// CONSTANTS - OPTIMIZED
// ============================================================================

const SCREEN_KEYWORDS: Record<string, string[]> = {
  home: ['home', 'trang chủ', 'chính', 'dashboard', 'tổng quan'],
  settings: ['settings', 'cài đặt', 'tài khoản', 'account', 'mật khẩu', 'pass', 'password', 'đổi pass', 'thông tin', 'profile', 'hồ sơ'],
  'equipment/catalog': ['thiết bị', 'máy móc', 'catalog', 'danh sách', 'qr', 'bàn giao'],
  'equipment/dashboard': ['thiết bị dashboard', 'biểu đồ thiết bị'],
  'reports/bed-usage': ['giường', 'bed', 'công suất'],
  'reports/examination-overview': ['khám', 'examination', 'bhyt', 'viện phí', 'doanh thu'],
  'reports/missing-medical-records': ['hsba', 'hồ sơ bệnh án', 'medical records'],
  'reports/cls-level3': ['cls', 'tầng 3', 'lầu 3', 'level3'],
  'reports/cls-level6': ['cls', 'tầng 6', 'lầu 6', 'level6'],
  'reports/specialty-cls': ['cls chuyên khoa', 'specialty'],
};

// Compiled regex for performance
const BLOCKED_RE = /viết\s*(code|script)|code\s*(python|java|js|sql)|(fix|sửa)\s*(code|bug)|viết\s*(thơ|bài|truyện)|sáng tác|dịch.*sang|(chính trị|bầu cử|tôn giáo)|(nấu|làm)\s*(ăn|món)|recipe|(tình yêu|hẹn hò)|(giá|price).*(vàng|bitcoin|stock)|(đầu tư|invest|trading)|(phim|game).*hay|(thủ đô|capital)\s*(của|of)|(ai là|who is).*(tổng thống|president)|giải\s*(phương trình|toán)|^.{0,20}(chán|buồn|mệt|stress|vui).{0,15}$/i;

const HARMFUL_RE = /(thuốc|cách)\s*(độc|chết|tự tử)|cách\s*(giết|hại)|(hack|crack|exploit|bypass).*(password|system)|(sql injection|xss|ddos|malware)|truy cập\s*(trái phép|admin)|(làm|chế tạo)\s*(bom|thuốc nổ)|(ma túy|drug)|lấy.*thông tin.*bệnh nhân/i;

const INJECTION_RE = /ignore\s*(previous|all)\s*instructions?|bỏ qua.*hướng dẫn|system\s*prompt|(show|reveal).*prompt|\b(DAN|jailbreak)\b|(pretend|act)\s*(like|as)|giả vờ|you are now|bây giờ bạn là|\[INST\]|<<SYS>>|<\|im_/i;

// Navigation & theme keywords for quick detection
const NAV_KEYWORDS = ['mở', 'xem', 'chuyển', 'vào', 'đi', 'navigate', 'open', 'go', 'show', 'đến', 'tới'];
const THEME_KEYWORDS = ['theme', 'giao diện', 'sáng', 'tối', 'dark', 'light', 'đổi màu', 'chế độ'];
const BUSINESS_KEYWORDS = ['bệnh viện', 'khoa', 'bệnh nhân', 'bác sĩ', 'giường', 'khám', 'báo cáo', 'report', 'thống kê', 'dashboard', 'hsba', 'bhyt', 'thiết bị', 'equipment', 'cls'];

const ALLOWED_TOOLS = ['nav', 'theme'] as const;
type AllowedTool = (typeof ALLOWED_TOOLS)[number];

// ============================================================================
// SERVICE
// ============================================================================

@Injectable({ providedIn: 'root' })
export class LlmService {
  private readonly authService = inject(AuthService);
  private readonly themeService = inject(ThemeService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly ngZone = inject(NgZone);

  private readonly apiUrl = environment.llmUrl;
  private readonly MODEL = 'qwen3:4b';

  // ===== OPTIMIZED SETTINGS FOR QWEN3-4B =====
  private readonly MAX_CTX = 4096;          // Qwen3-4B context window
  private readonly MAX_HISTORY = 3;          // Reduced from 4
  private readonly MAX_OUTPUT = 150;         // Reduced - responses should be short
  private readonly TOOL_BUDGET = 200;        // Reduced tool token budget
  private readonly CHARS_PER_TOKEN = 2.5;    // Tuned for Vietnamese + Qwen3
  private readonly SESSION_TIMEOUT = 15 * 60 * 1000;
  private readonly THEME_COOLDOWN = 1000;
  private readonly UI_DEBOUNCE = 30;
  private readonly MAX_RETRIES = 2;
  private readonly RETRY_DELAY = 800;
  private readonly TIMEOUT = 60000;
  private readonly MAX_INPUT = 300;          // Reduced from 500
  private readonly MAX_OUTPUT_CHARS = 1000;  // Reduced from 2000
  private readonly RATE_LIMIT = 15;
  private readonly RATE_WINDOW = 60_000;
  private readonly RATE_COOLDOWN = 10_000;

  // Sampling - optimized for Qwen3
  private readonly SAMPLING = {
    temperature: 0.2,      // Lower for more deterministic tool calls
    top_p: 0.8,
    top_k: 15,
    repeat_penalty: 1.2,
  };

  // Debug
  private readonly DEBUG = false;

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
  private sessionTimer?: ReturnType<typeof setTimeout>;
  private lastThemeChange = 0;
  private abortCtrl: AbortController | null = null;
  private msgCounter = 0;
  private msgTimestamps: number[] = [];
  private rateCooldownUntil = 0;

  // Cache
  private routeCache: RouteInfo[] | null = null;
  private routeMap: Map<string, RouteInfo> | null = null;
  private toolCache: unknown[] | null = null;
  private promptCache = '';
  private promptTokens = 0;
  private permHash = '';

  private readonly streamUpdate$ = new Subject<StreamUpdate>();

  constructor() {
    effect(() => {
      if (!this.authService.isLoggedIn()) this.cleanup();
    });

    this.streamUpdate$
      .pipe(debounceTime(this.UI_DEBOUNCE), takeUntilDestroyed(this.destroyRef))
      .subscribe((u) => this.ngZone.run(() => this.applyUpdate(u)));

    this.destroyRef.onDestroy(() => this.cleanup());
  }

  // ============================================================================
  // PUBLIC API
  // ============================================================================

  public toggleChat(): void {
    const willOpen = !this.isOpen();
    this.isOpen.set(willOpen);

    if (willOpen) {
      this.resetSessionTimer();
      if (!this.modelLoaded() && !this.isModelLoading()) this.loadModel();
    } else {
      this.clearSessionTimer();
    }
  }

  public async sendMessage(content: string): Promise<void> {
    const input = this.sanitize(content);
    if (!input) return;

    const rateCheck = this.checkRate();
    if (!rateCheck.ok) {
      this.addMsg('assistant', rateCheck.msg!);
      return;
    }

    const cls = this.classify(input);

    // Handle locally without model
    if (cls.response) {
      this.messages.update((m) => [
        ...m,
        this.createMsg('user', input),
        this.createMsg('assistant', cls.response!),
      ]);
      return;
    }

    this.resetSessionTimer();
    this.abort();

    this.messages.update((m) => [...m, this.createMsg('user', input)]);

    // Check disambiguation for navigation
    const disambig = this.checkDisambiguation(input);
    if (disambig) {
      this.messages.update((m) => [...m, this.createMsg('assistant', disambig)]);
      return;
    }

    this.messages.update((m) => [...m, this.createMsg('assistant', '', 0)]);
    this.isGenerating.set(true);

    try {
      await this.retry(() => this.stream(input, cls.type === 'tool_intent'));
    } catch (e) {
      this.handleErr(e);
    } finally {
      this.finalize();
      this.isGenerating.set(false);
      this.abortCtrl = null;
      this.cleanupEmpty();
    }
  }

  public stopGeneration(): void {
    this.abort();
    this.isGenerating.set(false);
    this.finalize();
  }

  public resetChat(): void {
    this.abort();
    this.messages.set([]);
    this.contextUsage.set(0);
    this.msgCounter = 0;
    this.msgTimestamps = [];
    this.rateCooldownUntil = 0;

    if (this.modelLoaded() && this.authService.isLoggedIn()) {
      this.addGreeting();
    }
  }

  public async loadModel(): Promise<void> {
    if (this.modelLoaded() || this.isModelLoading()) return;

    this.isModelLoading.set(true);
    this.loadProgress.set('Đang kết nối...');

    try {
      await this.checkHealth();
      this.modelLoaded.set(true);
      this.loadProgress.set('Sẵn sàng');
      this.buildPrompt();
      this.buildTools();
      if (this.messages().length === 0) this.addGreeting();
    } catch (e) {
      console.error('[LLM] Connection Error:', e);
      this.loadProgress.set('Không thể kết nối máy chủ AI');
    } finally {
      this.isModelLoading.set(false);
    }
  }

  // ============================================================================
  // CLASSIFICATION - FAST PATH (POLISHED VIETNAMESE)
  // ============================================================================

  private classify(msg: string): MessageClassification {
    const n = msg.toLowerCase().trim();

    // Security checks first
    if (INJECTION_RE.test(n)) {
      return { type: 'harmful', confidence: 1, response: 'Yêu cầu không hợp lệ. Vui lòng nhập nội dung khác.' };
    }

    if (HARMFUL_RE.test(n)) {
      return { type: 'harmful', confidence: 1, response: 'Nội dung này vi phạm chính sách bảo mật. Vui lòng liên hệ IT (1108/1109) nếu cần hỗ trợ.' };
    }

    if (BLOCKED_RE.test(n)) {
      return { type: 'blocked', confidence: 0.9, response: 'Nội dung này nằm ngoài phạm vi hỗ trợ của tôi. Tôi chỉ có thể giúp bạn điều hướng màn hình hoặc thay đổi giao diện.' };
    }

    // Short message handlers
    if (n.length < 60) {
      const greeting = this.matchGreeting(n);
      if (greeting) return { type: 'greeting', confidence: 0.95, response: greeting };

      const ack = this.matchAck(n);
      if (ack) return { type: 'acknowledgment', confidence: 0.95, response: ack };
    }

    // Tool intent detection
    if (this.hasToolIntent(n)) {
      return { type: 'tool_intent', confidence: 0.9 };
    }

    // Long non-business messages
    if (n.length > 100 && !BUSINESS_KEYWORDS.some((k) => n.includes(k))) {
      return { type: 'blocked', confidence: 0.7, response: 'Câu hỏi này không liên quan đến hệ thống. Tôi chỉ có thể hỗ trợ các nghiệp vụ nội bộ.' };
    }

    return { type: 'unknown', confidence: 0.5 };
  }

  private hasToolIntent(n: string): boolean {
    if (NAV_KEYWORDS.some((k) => n.includes(k))) return true;
    if (THEME_KEYWORDS.some((k) => n.includes(k))) return true;
    const screenKw = Object.values(SCREEN_KEYWORDS).flat();
    return screenKw.some((k) => k.length > 2 && n.includes(k));
  }

  private matchGreeting(n: string): string | null {
    if (/^(xin\s+)?(chào|hello|hi|hey)(\s+(bạn|bot|ad|anh|chị|em))*[!.?\s]*$/i.test(n)) {
      return 'Xin chào. Tôi có thể hỗ trợ bạn điều hướng hệ thống hoặc thay đổi giao diện.';
    }
    if (/^(bạn|bot)\s*(là|tên)\s*(ai|gì)[?\s]*$/i.test(n)) {
      return 'Tôi là Trợ lý ảo IT của Bệnh viện Hoàn Mỹ.';
    }
    if (/^(bạn|bot)?\s*(làm|giúp)\s*(được)?\s*(gì|chi)[?\s]*$/i.test(n) || /^help[!\s]*$/i.test(n)) {
      return 'Tôi có thể hỗ trợ bạn thực hiện:\n• Điều hướng nhanh đến các màn hình chức năng.\n• Chuyển đổi giao diện Sáng/Tối.';
    }
    return null;
  }

  private matchAck(n: string): string | null {
    if (/^(xin\s+)?(cảm ơn|cám ơn|thank|thanks)(\s+(bạn|nhiều|nhé))*[!.\s]*$/i.test(n)) {
      return this.pick([
        'Rất vui được hỗ trợ bạn. Bạn có cần giúp thêm gì không?',
        'Dạ không có gì. Tôi luôn sẵn sàng hỗ trợ bạn.',
        'Cảm ơn bạn đã sử dụng dịch vụ. Chúc bạn làm việc hiệu quả.'
      ]);
    }
    if (/^(ok|oke|okay|dc|đc|được|vâng|dạ|ừ|rồi|hiểu rồi)[!.\s]*$/i.test(n)) {
      return 'Tôi đã hiểu. Bạn cần tôi thực hiện thao tác nào tiếp theo?';
    }
    if (/^(không|ko|k|no|hông|hem)[!.\s]*$/i.test(n)) {
      return 'Vâng, tôi sẽ ở đây khi bạn cần hỗ trợ.';
    }
    if (/^(tạm biệt|bye|goodbye|chào nhé)[!.\s]*$/i.test(n)) {
      return 'Tạm biệt bạn. Hẹn gặp lại.';
    }
    return null;
  }

  // ============================================================================
  // RATE LIMITING
  // ============================================================================

  private checkRate(): { ok: boolean; msg?: string } {
    const now = Date.now();

    if (now < this.rateCooldownUntil) {
      const sec = Math.ceil((this.rateCooldownUntil - now) / 1000);
      return { ok: false, msg: `Hệ thống đang bận xử lý. Vui lòng thử lại sau ${sec} giây.` };
    }

    this.msgTimestamps = this.msgTimestamps.filter((t) => now - t < this.RATE_WINDOW);

    if (this.msgTimestamps.length >= this.RATE_LIMIT) {
      this.rateCooldownUntil = now + this.RATE_COOLDOWN;
      return { ok: false, msg: 'Bạn đang gửi tin nhắn quá nhanh. Vui lòng đợi trong giây lát.' };
    }

    this.msgTimestamps.push(now);
    return { ok: true };
  }

  // ============================================================================
  // SANITIZATION
  // ============================================================================

  private sanitize(content: string): string {
    if (!content) return '';
    let r = content.trim();
    if (r.length > this.MAX_INPUT) r = r.slice(0, this.MAX_INPUT);
    r = r.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
    r = r.replace(/[ \t]+/g, ' ').replace(/\n{2,}/g, '\n');
    r = r.replace(/```[\s\S]*?```|<[^>]+>|\[INST\]|\[\/INST\]|<<SYS>>|<\|im_\w+\|>/gi, '');
    return r.trim();
  }

  private sanitizeOut(content: string): string {
    if (!content) return '';
    let r = content;
    // Remove tool artifacts, thinking tags, special tokens
    r = r.replace(/<think>[\s\S]*?<\/think>/gi, '');
    r = r.replace(/<tool_call>[\s\S]*?<\/tool_call>/gi, '');
    r = r.replace(/<\|.*?\|>/g, '');
    r = r.replace(/\{\s*"name"\s*:[^}]+\}/gi, '');
    r = r.replace(/nav\s+\S+|theme\s+(dark|light|toggle)/gi, '');
    r = r.replace(/https?:\/\/(?!localhost)[^\s<>]+/gi, '');
    if (r.length > this.MAX_OUTPUT_CHARS) r = r.substring(0, this.MAX_OUTPUT_CHARS) + '...';
    return r.replace(/\n{3,}/g, '\n\n').trim();
  }

  // ============================================================================
  // STREAMING - OPTIMIZED FOR QWEN3
  // ============================================================================

  private async stream(userMsg: string, isToolIntent: boolean): Promise<void> {
    this.abortCtrl = new AbortController();
    const { signal } = this.abortCtrl;

    // OPTIMIZATION: Skip context for tool intents - they're stateless
    const context = isToolIntent ? [] : this.prepareContext(userMsg);
    const prompt = this.buildPrompt();
    const tools = isToolIntent ? this.buildTools() : undefined;

    // OPTIMIZATION: Minimal output tokens based on intent
    const maxTokens = isToolIntent ? 80 : 120;

    const payload = {
      model: this.MODEL,
      messages: [
        { role: 'system', content: prompt },
        ...context.map((m) => ({ role: m.role, content: m.content })),
        { role: 'user', content: userMsg },
      ],
      tools,
      stream: true,
      options: {
        ...this.SAMPLING,
        num_predict: maxTokens,
        num_ctx: this.MAX_CTX,
      },
    };

    if (this.DEBUG) console.log('[LLM] Request:', JSON.stringify(payload, null, 2));

    const timeout = setTimeout(() => this.abortCtrl?.abort(), this.TIMEOUT);

    try {
      const res = await fetch(this.apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal,
      });

      clearTimeout(timeout);
      if (!res.ok) throw new Error(`API ${res.status}`);
      if (!res.body) throw new Error('No body');

      await this.processStream(res.body, signal);
    } finally {
      clearTimeout(timeout);
    }
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
            if (!line.trim()) continue;

            try {
              const json = JSON.parse(line);
              if (this.DEBUG) console.log('[LLM] Chunk:', json);

              if (json.message?.content) content += json.message.content;

              // Parse tool calls from multiple formats
              const tools = this.parseTools(json);
              for (const t of tools) {
                if (!toolCalls.some((tc) => tc.name === t.name)) toolCalls.push(t);
              }

              // Only stream text if no tools yet
              if (content.trim() && !toolCalls.length) {
                this.streamUpdate$.next({
                  content: this.sanitizeOut(content),
                  tokenEstimate: this.tokens(content),
                });
              }

              if (json.done) break;
            } catch {
              continue;
            }
          }
        }

        // Process remaining buffer
        if (buffer.trim()) {
          try {
            const json = JSON.parse(buffer);
            if (json.message?.content) content += json.message.content;
            const tools = this.parseTools(json);
            for (const t of tools) {
              if (!toolCalls.some((tc) => tc.name === t.name)) toolCalls.push(t);
            }
          } catch { /* ignore */ }
        }
      } finally {
        reader.releaseLock();

        if (this.DEBUG) {
          console.log('[LLM] Final content:', content);
          console.log('[LLM] Tool calls:', toolCalls);
        }

        // Fallback: extract from text
        if (!toolCalls.length) {
          const extracted = this.extractToolFromText(content);
          if (extracted) toolCalls.push(extracted);
        }

        if (toolCalls.length) {
          await this.ngZone.run(() => this.execTools(toolCalls));
        } else {
          this.streamUpdate$.next({
            content: this.sanitizeOut(content),
            tokenEstimate: this.tokens(content),
          });
        }
      }
    });
  }

  // ============================================================================
  // TOOL PARSING - ROBUST MULTI-FORMAT SUPPORT
  // ============================================================================

  private parseTools(json: Record<string, unknown>): ToolCall[] {
    const results: ToolCall[] = [];

    try {
      // Get message object - handle both nested and flat structures
      const msg = (json['message'] ?? json) as Record<string, unknown>;

      // Format 1: tool_calls array (can be on message or root)
      const toolCalls = msg['tool_calls'] ?? json['tool_calls'];
      if (Array.isArray(toolCalls)) {
        for (const tc of toolCalls) {
          const call = tc as Record<string, unknown>;
          const parsed = this.parseSingleToolCall(call);
          if (parsed) results.push(parsed);
        }
      }

      // Format 2: function_call (OpenAI legacy)
      const funcCall = msg['function_call'] ?? json['function_call'];
      if (funcCall && typeof funcCall === 'object') {
        const fc = funcCall as Record<string, unknown>;
        const name = this.mapToolName(fc['name'] as string);
        if (name) {
          results.push({ name, arguments: this.parseArgs(fc['arguments'] ?? fc['args']) });
        }
      }

      // Format 3: tool_call singular (some Ollama versions)
      const singleCall = msg['tool_call'] ?? json['tool_call'];
      if (singleCall && typeof singleCall === 'object') {
        const parsed = this.parseSingleToolCall(singleCall as Record<string, unknown>);
        if (parsed) results.push(parsed);
      }

    } catch (e) {
      if (this.DEBUG) console.error('[LLM] parseTools error:', e, 'json:', JSON.stringify(json));
    }

    return results;
  }

  private parseSingleToolCall(call: Record<string, unknown>): ToolCall | null {
    try {
      // OpenAI format: { function: { name, arguments } }
      if (call['function'] && typeof call['function'] === 'object') {
        const fn = call['function'] as Record<string, unknown>;
        const name = this.mapToolName(fn['name'] as string);
        if (name) {
          return { name, arguments: this.parseArgs(fn['arguments'] ?? fn['args'] ?? fn['parameters']) };
        }
      }

      // Ollama native format: { name, arguments } or { name, args }
      if (call['name'] && typeof call['name'] === 'string') {
        const name = this.mapToolName(call['name']);
        if (name) {
          return { name, arguments: this.parseArgs(call['arguments'] ?? call['args'] ?? call['parameters'] ?? call['input']) };
        }
      }

      // Qwen format sometimes: { tool: "name", ... }
      if (call['tool'] && typeof call['tool'] === 'string') {
        const name = this.mapToolName(call['tool']);
        if (name) {
          return { name, arguments: this.parseArgs(call['arguments'] ?? call['args'] ?? call) };
        }
      }
    } catch (e) {
      if (this.DEBUG) console.error('[LLM] parseSingleToolCall error:', e);
    }

    return null;
  }

  private mapToolName(name: string): string | null {
    if (!name) return null;
    const n = name.toLowerCase();
    if (n === 'nav' || n.includes('navigate')) return 'nav';
    if (n === 'theme' || n.includes('theme')) return 'theme';
    return null;
  }

  private parseArgs(args: unknown): Record<string, unknown> {
    if (!args) return {};

    // Already an object
    if (typeof args === 'object' && args !== null && !Array.isArray(args)) {
      return args as Record<string, unknown>;
    }

    // JSON string
    if (typeof args === 'string') {
      const trimmed = args.trim();
      if (trimmed.startsWith('{')) {
        try {
          return JSON.parse(trimmed);
        } catch {
          if (this.DEBUG) console.warn('[LLM] Failed to parse args JSON:', trimmed);
        }
      }
      // Single value - try to infer key
      return { k: trimmed };
    }

    return {};
  }

  private extractToolFromText(text: string): ToolCall | null {
    if (!text) return null;

    try {
      // Pattern 1: nav <key>
      const navMatch = text.match(/\bnav\s+["']?(\S+)["']?/i);
      if (navMatch) {
        return { name: 'nav', arguments: { k: navMatch[1].replace(/['"]/g, '') } };
      }

      // Pattern 2: theme <mode>
      const themeMatch = text.match(/\btheme\s+(dark|light|toggle)/i);
      if (themeMatch) {
        return { name: 'theme', arguments: { m: themeMatch[1].toLowerCase() } };
      }

      // Pattern 3: JSON in text
      const jsonMatch = text.match(/\{\s*"name"\s*:\s*"(\w+)".*?"(?:arguments|k|m)"\s*:\s*("[^"]+"|{[^}]+})/i);
      if (jsonMatch) {
        const name = this.mapToolName(jsonMatch[1]);
        if (name) {
          let args: Record<string, unknown> = {};
          try {
            const argStr = jsonMatch[2];
            if (argStr.startsWith('{')) args = JSON.parse(argStr);
            else args = { k: argStr.replace(/"/g, '') };
          } catch { /* ignore */ }
          return { name, arguments: args };
        }
      }

      // Pattern 4: Vietnamese natural language -> try to match route
      const vnMatch = text.match(/(?:mở|chuyển|vào)\s+(?:trang\s+)?(\S+)/i);
      if (vnMatch) {
        const key = this.findRouteKey(vnMatch[1]);
        if (key) return { name: 'nav', arguments: { k: key } };
      }
    } catch { /* ignore */ }

    return null;
  }

  // ============================================================================
  // TOOL EXECUTION (POLISHED VIETNAMESE)
  // ============================================================================

  private async execTools(calls: ToolCall[]): Promise<void> {
    for (const call of calls.slice(0, 2)) {
      if (!ALLOWED_TOOLS.includes(call.name as AllowedTool)) continue;

      try {
        const result = await this.execTool(call.name as AllowedTool, call.arguments);
        const msg = this.getConfirmation(call.name, call.arguments, result);
        if (msg) this.setLastMsg(msg);
      } catch (e) {
        console.error(`[LLM] Tool error ${call.name}:`, e);
        this.setLastMsg(this.getToolErr(call.name));
      }
    }
  }

  private async execTool(name: AllowedTool, args: Record<string, unknown>): Promise<ToolResult> {
    switch (name) {
      case 'nav': {
        const key = (args['k'] || args['key'] || args['path'] || args['screen']) as string;
        if (!key) return { success: false, error: 'Đường dẫn không hợp lệ.' };
        return this.doNav(key);
      }
      case 'theme': {
        const mode = (args['m'] || args['mode'] || 'toggle') as string;
        return this.doTheme(mode);
      }
    }
  }

  private getConfirmation(name: string, args: Record<string, unknown>, result: ToolResult): string {
    if (!result.success) return result.error || 'Có lỗi xảy ra khi thực hiện thao tác.';

    if (result.data === 'SAME') {
      return this.pick([
        'Bạn đang ở màn hình này rồi.',
        'Hệ thống ghi nhận bạn đang xem trang này.'
      ]);
    }

    if (name === 'nav') {
      return this.pick([
        `Tôi đang chuyển hướng đến màn hình **${result.data}**...`,
        `Hệ thống đang mở trang **${result.data}** theo yêu cầu.`,
        `Đã tìm thấy trang **${result.data}**. Đang tải...`,
      ]);
    }

    if (name === 'theme') {
      const isDark = result.data === 'dark';
      return isDark
        ? this.pick(['Tôi đã chuyển sang **giao diện tối**.', 'Hệ thống đã kích hoạt **chế độ ban đêm**.'])
        : this.pick(['Tôi đã chuyển về **giao diện sáng**.', 'Hệ thống đã kích hoạt **chế độ ban ngày**.']);
    }

    return 'Thao tác đã hoàn tất.';
  }

  private getToolErr(name: string): string {
    return name === 'nav'
      ? 'Tôi không thể mở trang này. Có thể tài khoản của bạn chưa được cấp quyền truy cập.'
      : 'Hiện tại tôi không thể thay đổi giao diện. Vui lòng thử lại sau.';
  }

  // ============================================================================
  // NAVIGATION & THEME (ABSTRACTION LAYER ADDED)
  // ============================================================================

  private doNav(key: string): ToolResult {
    const currentPath = this.router.url.split('?')[0];

    if (this.isNavigating()) return { success: true, data: 'SAME' };

    // Resolve key to route
    const route = this.resolveRoute(key);
    if (!route) return { success: false, error: 'Không tìm thấy trang này trong hệ thống.' };

    if (currentPath === route.fullUrl) return { success: true, data: 'SAME' };

    this.isNavigating.set(true);
    setTimeout(() => {
      this.router.navigateByUrl(route.fullUrl).finally(() => {
        setTimeout(() => this.isNavigating.set(false), 500);
      });
    }, 600);

    return { success: true, data: route.title };
  }

  private resolveRoute(key: string): RouteInfo | null {
    this.ensureRouteMap();

    // 1. Direct key match (Fastest)
    if (this.routeMap!.has(key)) return this.routeMap!.get(key)!;

    // 2. Abstraction Layer: Handle cases where LLM hallucinates 'app/' or '/app/'
    // "app/settings" -> "settings"
    // "/app/settings" -> "settings"
    const cleanKey = key.replace(/^\/?(app\/)?/, '');
    if (this.routeMap!.has(cleanKey)) return this.routeMap!.get(cleanKey)!;

    // 3. Fuzzy match (Slower but robust)
    const routes = this.getRoutes();
    const lower = key.toLowerCase();

    return routes.find((r) =>
      r.key.includes(lower) ||
      r.fullUrl.includes(lower) ||
      r.title.toLowerCase().includes(lower) ||
      r.keywords?.some((kw) => kw.includes(lower))
    ) || null;
  }

  private findRouteKey(query: string): string | null {
    const route = this.resolveRoute(query);
    return route?.key || null;
  }

  private doTheme(action: string): ToolResult {
    const now = Date.now();
    const isDark = this.themeService.isDarkTheme();

    if (now - this.lastThemeChange < this.THEME_COOLDOWN) {
      return { success: true, data: isDark ? 'dark' : 'light' };
    }
    this.lastThemeChange = now;

    const mode = action.toLowerCase();
    let newMode: 'dark' | 'light';

    if (mode === 'dark' || mode === 'tối') {
      if (!isDark) this.themeService.toggleTheme();
      newMode = 'dark';
    } else if (mode === 'light' || mode === 'sáng') {
      if (isDark) this.themeService.toggleTheme();
      newMode = 'light';
    } else {
      this.themeService.toggleTheme();
      newMode = isDark ? 'light' : 'dark';
    }

    return { success: true, data: newMode };
  }

  // ============================================================================
  // ROUTES - OPTIMIZED
  // ============================================================================

  private getRoutes(): RouteInfo[] {
    if (!this.routeCache) {
      this.routeCache = this.scanRoutes(this.router.config);
    }
    return this.routeCache;
  }

  private ensureRouteMap(): void {
    if (!this.routeMap) {
      this.routeMap = new Map();
      for (const r of this.getRoutes()) {
        this.routeMap.set(r.key, r);
      }
    }
  }

  private scanRoutes(routes: Routes, parent = ''): RouteInfo[] {
    const results: RouteInfo[] = [];

    for (const route of routes) {
      if (route.redirectTo || route.path === '**') continue;

      const path = route.path || '';
      const fullPath = parent ? `${parent}/${path}` : `/${path}`;
      const key = fullPath.startsWith('/app/') ? fullPath.substring(5) : fullPath.substring(1);

      if (!this.checkPerm(route)) continue;

      if (route.data?.['title']) {
        results.push({
          title: route.data['title'] as string,
          fullUrl: fullPath,
          key,
          keywords: SCREEN_KEYWORDS[key],
        });
      }

      if (route.children) {
        results.push(...this.scanRoutes(route.children, fullPath));
      }
    }

    return results;
  }

  private checkPerm(route: Route): boolean {
    const perm = route.data?.['permission'] as string | undefined;
    if (!perm) return true;
    const user = this.authService.currentUser();
    return user?.permissions?.some((p) => p.startsWith(perm)) ?? false;
  }

  // ============================================================================
  // DISAMBIGUATION (POLISHED VIETNAMESE)
  // ============================================================================

  private checkDisambiguation(msg: string): string | null {
    const n = msg.toLowerCase().trim();

    // Let model handle theme
    if (THEME_KEYWORDS.some((k) => n.includes(k))) return null;

    // Check for navigation intent
    if (!NAV_KEYWORDS.some((k) => n.includes(k))) return null;

    // Extract target
    let query = n;
    NAV_KEYWORDS.forEach((k) => (query = query.replace(k, '')));
    query = query.replace(/trang|màn hình|screen|page|báo cáo|report|cho tôi|giúp|của|đi/g, '').trim();

    if (!query || query.length < 2) return null;

    const matches = this.findMatches(query);

    if (matches.length === 0) {
      const routes = this.getRoutes();
      const sample = routes.slice(0, 5).map((r) => `• ${r.title}`).join('\n');
      return `Tôi không tìm thấy màn hình nào có tên "${query}". Dưới đây là một số trang gợi ý:\n\n${sample}`;
    }

    if (matches.length === 1) return null;

    const opts = matches.slice(0, 5).map((m, i) => `${i + 1}. ${m.title}`).join('\n');
    return `Tôi tìm thấy ${matches.length} màn hình phù hợp với yêu cầu:\n\n${opts}\n\nBạn muốn mở màn hình số mấy?`;
  }

  private findMatches(query: string): RouteInfo[] {
    const words = query.toLowerCase().split(/\s+/).filter((w) => w.length > 1);
    return this.getRoutes().filter((r) => {
      const title = r.title.toLowerCase();
      const key = r.key.toLowerCase();
      const kw = r.keywords || [];
      return words.some((w) => title.includes(w) || key.includes(w) || kw.some((k) => k.includes(w)));
    });
  }

  // ============================================================================
  // CONTEXT - OPTIMIZED
  // ============================================================================

  private prepareContext(newMsg: string): ChatMessage[] {
    const newTokens = this.tokens(newMsg);
    const available = this.MAX_CTX - this.promptTokens - this.TOOL_BUDGET - this.MAX_OUTPUT - newTokens - 50;

    const history = this.messages()
      .filter((m) => m.content.trim() && m.role !== 'system' && m.role !== 'tool')
      .map((m) => ({
        ...m,
        // Aggressive truncation
        content: m.content.length > 100 ? m.content.substring(0, 100) + '...' : m.content,
      }));

    const result: ChatMessage[] = [];
    let used = 0;

    for (let i = history.length - 1; i >= 0 && result.length < this.MAX_HISTORY; i--) {
      const tokens = this.tokens(history[i].content);
      if (used + tokens > available) break;
      used += tokens;
      result.unshift(history[i]);
    }

    // Ensure we start with user message
    if (result.length && result[0].role === 'assistant') result.shift();

    this.contextUsage.set(
      Math.min(100, Math.round(((this.promptTokens + used + newTokens) / this.MAX_CTX) * 100))
    );

    return result;
  }

  private tokens(text: string): number {
    if (!text) return 0;
    // Qwen3 tokenizer: ~2.5 chars/token for Vietnamese
    return Math.ceil(text.length / this.CHARS_PER_TOKEN) + 2;
  }

  // ============================================================================
  // SYSTEM PROMPT - ULTRA COMPACT FOR TOKEN SAVINGS
  // ============================================================================

  private buildPrompt(): string {
    const hash = JSON.stringify(this.authService.currentUser()?.permissions || []);

    if (hash !== this.permHash) {
      this.promptCache = '';
      this.routeCache = null;
      this.routeMap = null;
      this.toolCache = null;
      this.permHash = hash;
    }

    if (this.promptCache) return this.promptCache;

    const routes = this.getRoutes();
    // Compact route list: key:Title. Increased slice to 10 for better context
    const routeStr = routes.slice(0, 10).map((r) => `${r.key}:${r.title}`).join('|');

    // ULTRA COMPACT PROMPT - optimized for Qwen3-4B
    // Added RULE: Reply in Vietnamese
    this.promptCache = `IT Bot HM Hospital.
TASK:nav screens+change theme ONLY
TOOLS:nav(k=route_key)|theme(m=dark/light/toggle)
ROUTES:${routeStr}
OUT_OF_SCOPE:"Hotline IT 1108/1109"
RULE:Reply in Vietnamese. Call tool immediately when user wants nav/theme. Short friendly response.`;

    this.promptTokens = this.tokens(this.promptCache);

    if (this.DEBUG) {
      console.log('[LLM] System prompt tokens:', this.promptTokens);
      console.log('[LLM] System prompt:', this.promptCache);
    }

    return this.promptCache;
  }

  // ============================================================================
  // TOOLS - COMPACT SCHEMA
  // ============================================================================

  private buildTools(): unknown[] {
    if (this.toolCache) return this.toolCache;

    // Use short keys for route enum to save tokens
    const routeKeys = this.getRoutes().map((r) => r.key);

    this.toolCache = [
      {
        type: 'function',
        function: {
          name: 'nav',
          description: 'Navigate to screen. Use when user wants to open/go/view a page.',
          parameters: {
            type: 'object',
            properties: {
              k: { type: 'string', enum: routeKeys, description: 'Route key' },
            },
            required: ['k'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'theme',
          description: 'Change theme. Use when user mentions dark/light/theme/giao diện.',
          parameters: {
            type: 'object',
            properties: {
              m: { type: 'string', enum: ['light', 'dark', 'toggle'], description: 'Mode' },
            },
            required: ['m'],
          },
        },
      },
    ];

    if (this.DEBUG) {
      console.log('[LLM] Tools:', JSON.stringify(this.toolCache, null, 2));
    }

    return this.toolCache;
  }

  // ============================================================================
  // MESSAGE HELPERS
  // ============================================================================

  private setLastMsg(text: string): void {
    this.messages.update((msgs) => {
      const arr = [...msgs];
      for (let i = arr.length - 1; i >= 0; i--) {
        if (arr[i].role === 'assistant') {
          arr[i] = { ...arr[i], content: text };
          break;
        }
      }
      return arr;
    });
  }

  private finalize(): void {
    this.messages.update((msgs) => {
      const arr = [...msgs];
      const last = arr.length - 1;

      if (last >= 0 && arr[last].role === 'assistant') {
        let content = arr[last].content.trim();
        if (!content) return arr;

        content = content.charAt(0).toUpperCase() + content.slice(1);

        const endings = ['.', '!', '?', ':', ')', '"', "'", '*'];
        if (!endings.includes(content.slice(-1)) && content.length > 5) {
          content += '.';
        }

        arr[last] = { ...arr[last], content };
      }
      return arr;
    });
  }

  private applyUpdate(u: StreamUpdate): void {
    this.messages.update((msgs) => {
      const arr = [...msgs];
      const last = arr.length - 1;
      if (last >= 0 && arr[last].role === 'assistant') {
        arr[last] = { ...arr[last], content: u.content, tokenEstimate: u.tokenEstimate };
      }
      return arr;
    });
  }

  private cleanupEmpty(): void {
    this.messages.update((msgs) => {
      const arr = [...msgs];
      const last = arr.length - 1;
      if (last >= 0 && arr[last].role === 'assistant' && !arr[last].content.trim()) {
        arr[last] = { ...arr[last], content: 'Có lỗi xảy ra trong quá trình phản hồi. Vui lòng thử lại.' };
      }
      return arr;
    });
  }

  private addMsg(role: ChatMessage['role'], content: string): void {
    this.messages.update((m) => [...m, this.createMsg(role, content)]);
  }

  private createMsg(role: ChatMessage['role'], content: string, tokenEstimate?: number): ChatMessage {
    return {
      id: `m_${Date.now()}_${++this.msgCounter}`,
      role,
      content,
      tokenEstimate: tokenEstimate ?? this.tokens(content),
      timestamp: Date.now(),
    };
  }

  private addGreeting(): void {
    this.addMsg('assistant', 'Xin chào. Tôi có thể hỗ trợ bạn điều hướng hệ thống hoặc thay đổi giao diện.');
  }

  // ============================================================================
  // UTILITIES
  // ============================================================================

  private async retry<T>(fn: () => Promise<T>): Promise<T> {
    let lastErr: Error | null = null;

    for (let i = 0; i <= this.MAX_RETRIES; i++) {
      try {
        return await fn();
      } catch (e) {
        lastErr = e as Error;
        if (e instanceof DOMException && e.name === 'AbortError') throw e;
        if (i < this.MAX_RETRIES) await this.delay(this.RETRY_DELAY * (i + 1));
      }
    }

    throw lastErr;
  }

  private pick(arr: string[]): string {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  private async checkHealth(): Promise<void> {
    const ctrl = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(), 10000);

    try {
      const url = new URL(this.apiUrl);
      const res = await fetch(`${url.protocol}//${url.host}/`, { method: 'GET', signal: ctrl.signal });
      if (!res.ok && res.status !== 404) throw new Error('Server unreachable');
    } finally {
      clearTimeout(timeout);
    }
  }

  private handleErr(error: unknown): void {
    if (error instanceof DOMException && error.name === 'AbortError') return;

    console.error('[LLM] Error:', error);

    this.messages.update((msgs) => {
      const arr = [...msgs];
      const last = arr.length - 1;
      if (last >= 0 && arr[last].role === 'assistant') {
        const msg = error instanceof Error && error.message.includes('404')
          ? `Model "${this.MODEL}" không khả dụng. Vui lòng liên hệ IT Helpdesk.`
          : 'Hệ thống đang bận. Vui lòng thử lại sau giây lát.';
        arr[last] = { ...arr[last], content: msg };
      }
      return arr;
    });
  }

  private abort(): void {
    this.abortCtrl?.abort();
    this.abortCtrl = null;
  }

  private cleanup(): void {
    this.abort();
    this.clearSessionTimer();
    this.resetChat();
    this.isOpen.set(false);
    this.modelLoaded.set(false);
    this.promptCache = '';
    this.routeCache = null;
    this.routeMap = null;
    this.toolCache = null;
  }

  private resetSessionTimer(): void {
    this.clearSessionTimer();
    this.sessionTimer = setTimeout(() => {
      this.resetChat();
      this.isOpen.set(false);
    }, this.SESSION_TIMEOUT);
  }

  private clearSessionTimer(): void {
    if (this.sessionTimer) {
      clearTimeout(this.sessionTimer);
      this.sessionTimer = undefined;
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
  }
}