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
}

interface ToolCall {
  name: string;
  arguments: Record<string, unknown>;
}

interface StreamUpdate {
  content: string;
  tokenEstimate: number;
}

interface RouteInfo {
  title: string;
  fullUrl: string;
  key: string;
  keywords?: string[];
}

interface ToolResult {
  success: boolean;
  data?: string;
  error?: string;
}

// ============================================================================
// TEXT NORMALIZATION
// ============================================================================

const ABBREVIATIONS: [RegExp, string][] = [
  [/\b(ko|k|hông|hem)\b/g, 'không'],
  [/\b(dc|đc|đuoc)\b/g, 'được'],
  [/\b(oke|okie|okê|oki)\b/g, 'ok'],
  [/\b(tks|thks|thanks|thank)\b/g, 'cảm ơn'],
  [/\b(j|ji)\b/g, 'gì'],
  [/\br\b/g, 'rồi'],
  [/\bbt\b/g, 'bình thường'],
  [/\bad\b/g, 'admin'],
];

function normalize(text: string): string {
  let s = text.toLowerCase().trim();

  for (const [re, repl] of ABBREVIATIONS) {
    s = s.replace(re, repl);
  }

  // Remove diacritics
  s = s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  s = s.replace(/đ/g, 'd').replace(/Đ/g, 'D');

  return s.replace(/\s+/g, ' ').trim();
}

// ============================================================================
// WHITELIST CLASSIFICATION
// ============================================================================

interface WhitelistEntry {
  patterns: string[];
  response?: string | string[];
  intent?: 'nav' | 'theme';
}

interface ClassifyResult {
  type: 'direct' | 'llm' | 'blocked';
  response?: string;
  intent?: 'nav' | 'theme';
  extractedCommand?: string; // Clean command to send to LLM
}

// Blocklist: Always rejected (checked first)
const BLOCKLIST: RegExp[] = [
  // === Injection attempts ===
  /ignore.*(previous|all|above)?\s*instruction/i,
  /disregard.*(previous|all)?\s*(instruction|prompt)/i,
  /bo qua.*huong dan/i,
  /system\s*prompt/i,
  /\b(DAN|jailbreak|STAN|DUDE)\b/i,
  /\[INST\]|<<SYS>>|<\|im_/i,
  /you are now|bay gio ban la/i,
  /pretend\s*(to\s*be|you('re| are))/i,
  /gia vo.*la/i,
  /act\s*as\s*(if|a)/i,

  // === Harmful content ===
  /(cach|thuoc|lam sao).*(tu tu|chet|giet|hai|doc)/i,
  /(hack|crack|bypass|exploit).*(password|system|admin|server|database)/i,
  /(sql injection|xss|ddos|malware|ransomware|trojan|phishing)/i,
  /(lam|che tao).*(bom|thuoc no|ma tuy|vu khi)/i,
  /(lay|danh cap|steal|extract).*thong tin.*(benh nhan|database|patient)/i,
  /truy cap\s*trai phep/i,
  /unauthorized\s*access/i,

  // === Out-of-scope (Vietnamese) ===
  /viet\s*(code|script|tho|truyen|bai|van)/i,
  /code\s*(python|java|sql|js|javascript|html|css)/i,
  /(fix|sua|debug)\s*(code|bug|loi)/i,
  /dich.*sang\s*(tieng|anh|viet|phap|trung)/i,
  /(chinh tri|bau cu|ton giao|dang phai)/i,
  /gia\s*(vang|bitcoin|chung khoan|stock|coin)/i,
  /(dau tu|trading|invest|crypto)/i,
  /(nau|lam)\s*(an|mon|banh)/i,
  /recipe|cong thuc nau/i,
  /(phim|game|nhac|truyen)\s*hay/i,
  /thu do\s*(cua|of)/i,
  /ai la.*(tong thong|president|thu tuong)/i,
  /giai\s*(phuong trinh|toan|bai tap)/i,

  // === Out-of-scope (English) ===
  /write\s*(a|me|the)?\s*(poem|story|essay|code|script|song)/i,
  /tell\s*(me)?\s*(a\s*)?(joke|story|about)/i,
  /explain\s*(how|what|why|the)/i,
  /what\s*(is|are|was|were)\s*(the|a)?/i,
  /who\s*(is|are|was|were)/i,
  /how\s*(do|does|to|can|did)/i,
  /can you\s*(help|tell|explain|write)/i,
  /create\s*(a|an|the)?\s*(image|picture|song|video)/i,
  /generate\s*(a|an)?\s*(random|new)/i,
  /translate\s*(this|to|from)/i,
  /summarize|paraphrase/i,
  /give\s*(me)?\s*(advice|tips|suggestions)/i,
];

// Whitelist: Only these patterns pass through
const WHITELIST: WhitelistEntry[] = [
  // ===== GREETINGS =====
  {
    patterns: ['chao', 'xin chao', 'hello', 'hi', 'hey', 'alo', 'co ai khong', 'good morning', 'good afternoon'],
    response: [
      'Xin chào. Tôi có thể hỗ trợ bạn điều hướng hệ thống hoặc thay đổi giao diện.',
      'Chào bạn! Bạn cần mở trang nào?',
    ],
  },
  {
    patterns: ['ban la ai', 'ban ten gi', 'bot la gi', 'who are you', 'la ai', 'what are you'],
    response: 'Tôi là Trợ lý ảo IT của Bệnh viện Hoàn Mỹ. Tôi có thể hỗ trợ điều hướng và thay đổi giao diện.',
  },
  {
    patterns: ['giup gi', 'lam duoc gi', 'help', 'huong dan', 'chuc nang', 'ho tro gi', 'what can you do'],
    response: 'Tôi có thể hỗ trợ bạn:\n• Điều hướng đến các màn hình chức năng\n• Chuyển đổi giao diện Sáng/Tối\n\nBạn cần mở trang nào?',
  },

  // ===== ACKNOWLEDGMENTS =====
  {
    patterns: ['cam on', 'thank', 'thanks'],
    response: [
      'Không có gì. Bạn cần hỗ trợ thêm gì không?',
      'Rất vui được hỗ trợ bạn!',
      'Dạ, tôi luôn sẵn sàng.',
    ],
  },
  {
    patterns: ['ok', 'duoc', 'vang', 'da', 'u', 'hieu roi', 'da hieu', 'got it', 'understood'],
    response: 'Bạn cần hỗ trợ thêm gì không?',
  },
  {
    patterns: ['khong', 'no', 'thoi', 'khoi', 'het roi', 'khong can'],
    response: 'Vâng, tôi sẽ ở đây khi bạn cần.',
  },
  {
    patterns: ['tam biet', 'bye', 'goodbye', 'chao nhe', 'hen gap lai', 'see you'],
    response: 'Tạm biệt. Hẹn gặp lại!',
  },

  // ===== NAVIGATION INTENT =====
  {
    patterns: [
      'mo', 'xem', 'chuyen', 'vao', 'di den', 'den', 'toi', 'dua toi',
      'navigate', 'open', 'go to', 'go', 'show', 'display', 'take me',
      'man hinh', 'trang', 'menu',
    ],
    intent: 'nav',
  },
  {
    patterns: [
      'dashboard', 'home', 'trang chu', 'tong quan',
      'settings', 'cai dat', 'tai khoan', 'account', 'mat khau', 'password', 'profile', 'ho so',
      'thiet bi', 'equipment', 'catalog', 'may moc', 'qr', 'ban giao',
      'bao cao', 'report', 'thong ke',
      'giuong', 'bed', 'cong suat',
      'kham', 'examination', 'bhyt', 'vien phi', 'doanh thu',
      'hsba', 'ho so benh an', 'medical record',
      'cls', 'tang 3', 'tang 6', 'lau 3', 'lau 6', 'level 3', 'level 6',
      'chuyen khoa', 'specialty',
    ],
    intent: 'nav',
  },

  // ===== THEME INTENT =====
  {
    patterns: [
      'theme', 'giao dien', 'che do',
      'sang', 'toi', 'dark', 'light',
      'doi mau', 'chuyen mau', 'doi giao dien',
      'ban dem', 'ban ngay', 'night mode', 'day mode',
    ],
    intent: 'theme',
  },
];

// Collect all intent patterns for density checking
const ALL_NAV_PATTERNS = WHITELIST
  .filter(e => e.intent === 'nav')
  .flatMap(e => e.patterns);

const ALL_THEME_PATTERNS = WHITELIST
  .filter(e => e.intent === 'theme')
  .flatMap(e => e.patterns);

// Security thresholds
const MAX_INTENT_INPUT_LENGTH = 60; // Hard limit for tool intent inputs
const MIN_KEYWORD_DENSITY = 0.25;   // At least 25% of words must be relevant
const MIN_PATTERN_RATIO = 0.15;     // Pattern must be at least 15% of input length

function classify(input: string): ClassifyResult {
  const raw = input.toLowerCase();
  const normalized = normalize(input);
  const words = normalized.split(' ').filter(w => w.length > 0);

  // Step 1: Blocklist check (on both raw and normalized)
  for (const pattern of BLOCKLIST) {
    if (pattern.test(raw) || pattern.test(normalized)) {
      return {
        type: 'blocked',
        response: 'Nội dung này nằm ngoài phạm vi hỗ trợ. Tôi chỉ có thể giúp điều hướng và thay đổi giao diện.',
      };
    }
  }

  // Step 2: Whitelist check
  for (const entry of WHITELIST) {
    const matchedPattern = entry.patterns.find(pattern => {
      if (pattern.length <= 3) {
        return words.includes(pattern);
      }
      return normalized.includes(pattern);
    });

    if (matchedPattern) {
      // Direct response - no security concern
      if (entry.response) {
        const resp = Array.isArray(entry.response)
          ? entry.response[Math.floor(Math.random() * entry.response.length)]
          : entry.response;
        return { type: 'direct', response: resp };
      }

      // Intent matched - apply security checks
      if (entry.intent) {
        const securityCheck = validateIntentSecurity(normalized, words, matchedPattern, entry.intent);
        
        if (!securityCheck.safe) {
          return {
            type: 'blocked',
            response: securityCheck.reason || 'Vui lòng nhập lệnh điều hướng ngắn gọn hơn.',
          };
        }

        return { 
          type: 'llm', 
          intent: entry.intent,
          extractedCommand: securityCheck.cleanCommand,
        };
      }
    }
  }

  // Step 3: Not in whitelist - block with helpful message
  if (input.length < 10) {
    return {
      type: 'blocked',
      response: 'Xin lỗi, tôi không hiểu. Bạn có thể nói rõ hơn không?',
    };
  }

  return {
    type: 'blocked',
    response: 'Tôi chỉ có thể hỗ trợ điều hướng và thay đổi giao diện. Bạn cần mở trang nào?',
  };
}

/**
 * Validate that an intent request isn't a Trojan Horse attack
 */
function validateIntentSecurity(
  normalized: string,
  words: string[],
  matchedPattern: string,
  intent: 'nav' | 'theme'
): { safe: boolean; reason?: string; cleanCommand?: string } {
  
  const cleanInput = normalized.replace(/\s/g, '');
  const cleanPattern = matchedPattern.replace(/\s/g, '');
  
  // Check 1: Hard length limit - legitimate commands are short
  if (cleanInput.length > MAX_INTENT_INPUT_LENGTH) {
    return { 
      safe: false, 
      reason: 'Vui lòng nhập lệnh ngắn gọn. Ví dụ: "mở báo cáo giường" hoặc "đổi theme tối".' 
    };
  }

  // Check 2: Pattern density - pattern should be significant part of input
  if (cleanInput.length > 20) {
    const patternRatio = cleanPattern.length / cleanInput.length;
    
    if (patternRatio < MIN_PATTERN_RATIO) {
      // Check keyword density as second chance
      const relevantPatterns = intent === 'nav' ? ALL_NAV_PATTERNS : ALL_THEME_PATTERNS;
      
      const relevantWordCount = words.filter(word => 
        relevantPatterns.some(p => {
          const pNorm = normalize(p);
          return pNorm.includes(word) || word.includes(pNorm);
        })
      ).length;
      
      const density = relevantWordCount / words.length;
      
      if (density < MIN_KEYWORD_DENSITY) {
        return { 
          safe: false, 
          reason: 'Tôi chỉ hỗ trợ các lệnh điều hướng đơn giản. Vui lòng thử lại.' 
        };
      }
    }
  }

  // Check 3: Extract clean command (remove filler words, keep only relevant parts)
  const cleanCommand = extractCleanCommand(normalized, intent);

  return { safe: true, cleanCommand };
}

/**
 * Extract only the relevant command parts from input
 * "please open the dashboard for me" -> "open dashboard"
 */
function extractCleanCommand(normalized: string, intent: 'nav' | 'theme'): string {
  const fillerWords = [
    'cho', 'toi', 'giup', 'xin', 'vui long', 'lam on', 'di', 'cua', 'cai',
    'please', 'can', 'could', 'would', 'the', 'a', 'an', 'for', 'me', 'to', 'i', 'want'
  ];

  const relevantPatterns = intent === 'nav' ? ALL_NAV_PATTERNS : ALL_THEME_PATTERNS;
  
  const words = normalized.split(' ');
  const relevantWords = words.filter(word => {
    if (fillerWords.includes(word)) return false;
    if (word.length < 2) return false;
    
    // Keep if it matches any relevant pattern
    return relevantPatterns.some(p => {
      const pNorm = normalize(p);
      return pNorm.includes(word) || word.includes(pNorm) || pNorm === word;
    });
  });

  // If we filtered too much, return original (truncated)
  if (relevantWords.length === 0) {
    return normalized.slice(0, 50);
  }

  return relevantWords.join(' ');
}

// ============================================================================
// CONSTANTS
// ============================================================================

const SCREEN_KEYWORDS: Record<string, string[]> = {
  home: ['home', 'trang chủ', 'chính', 'dashboard', 'tổng quan'],
  settings: ['settings', 'cài đặt', 'tài khoản', 'account', 'mật khẩu', 'password', 'profile', 'hồ sơ'],
  'equipment/catalog': ['thiết bị', 'máy móc', 'catalog', 'danh sách', 'qr', 'bàn giao'],
  'equipment/dashboard': ['thiết bị dashboard', 'biểu đồ thiết bị'],
  'reports/bed-usage': ['giường', 'bed', 'công suất'],
  'reports/examination-overview': ['khám', 'examination', 'bhyt', 'viện phí', 'doanh thu'],
  'reports/missing-medical-records': ['hsba', 'hồ sơ bệnh án', 'medical records'],
  'reports/cls-level3': ['cls', 'tầng 3', 'lầu 3', 'level3'],
  'reports/cls-level6': ['cls', 'tầng 6', 'lầu 6', 'level6'],
  'reports/specialty-cls': ['cls chuyên khoa', 'specialty'],
};

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

  // Settings
  private readonly MAX_CTX = 4096;
  private readonly MAX_HISTORY = 3;
  private readonly MAX_OUTPUT = 150;
  private readonly TOOL_BUDGET = 200;
  private readonly CHARS_PER_TOKEN = 2.5;
  private readonly SESSION_TIMEOUT = 15 * 60 * 1000;
  private readonly THEME_COOLDOWN = 1000;
  private readonly UI_DEBOUNCE = 30;
  private readonly MAX_RETRIES = 2;
  private readonly RETRY_DELAY = 800;
  private readonly TIMEOUT = 60000;
  private readonly MAX_INPUT = 300;
  private readonly MAX_OUTPUT_CHARS = 1000;
  private readonly RATE_LIMIT = 15;
  private readonly RATE_WINDOW = 60_000;
  private readonly RATE_COOLDOWN = 10_000;

  // Typing simulation
  private readonly TYPING_BASE_DELAY = 400;
  private readonly TYPING_MAX_DELAY = 1000;

  // Lower temperature for deterministic tool calling
  private readonly SAMPLING = {
    temperature: 0.1,
    top_p: 0.8,
    top_k: 10,
    repeat_penalty: 1.2,
  };

  private readonly DEBUG = false;

  // Signals
  public readonly isOpen = signal(false);
  public readonly isModelLoading = signal(false);
  public readonly isGenerating = signal(false);
  public readonly isTyping = signal(false);
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
      await this.respondWithTyping(rateCheck.msg!);
      return;
    }

    // Add user message immediately
    this.messages.update((m) => [...m, this.createMsg('user', input)]);
    this.resetSessionTimer();
    this.abort();

    // Classify using whitelist
    const result = classify(input);

    // Direct response or blocked
    if (result.type === 'direct' || result.type === 'blocked') {
      await this.respondWithTyping(result.response!);
      return;
    }

    // Navigation disambiguation (only for nav intent)
    if (result.intent === 'nav') {
      const disambig = this.checkDisambiguation(input);
      if (disambig) {
        await this.respondWithTyping(disambig);
        return;
      }
    }

    // Pass to LLM with cleaned command
    this.messages.update((m) => [...m, this.createMsg('assistant', '', 0)]);
    this.isGenerating.set(true);

    try {
      // Use extracted clean command if available, otherwise original input
      const commandToSend = result.extractedCommand || input;
      await this.retry(() => this.stream(commandToSend, result.intent));
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
    this.isTyping.set(false);
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
  // TYPING SIMULATION
  // ============================================================================

  private async respondWithTyping(response: string): Promise<void> {
    this.isTyping.set(true);

    const delay = Math.min(
      this.TYPING_BASE_DELAY + response.length * 1.5,
      this.TYPING_MAX_DELAY
    );
    await this.delay(delay);

    this.messages.update((m) => [...m, this.createMsg('assistant', response)]);
    this.isTyping.set(false);
  }

  // ============================================================================
  // RATE LIMITING
  // ============================================================================

  private checkRate(): { ok: boolean; msg?: string } {
    const now = Date.now();

    if (now < this.rateCooldownUntil) {
      const sec = Math.ceil((this.rateCooldownUntil - now) / 1000);
      return { ok: false, msg: `Hệ thống đang bận. Vui lòng thử lại sau ${sec} giây.` };
    }

    this.msgTimestamps = this.msgTimestamps.filter((t) => now - t < this.RATE_WINDOW);

    if (this.msgTimestamps.length >= this.RATE_LIMIT) {
      this.rateCooldownUntil = now + this.RATE_COOLDOWN;
      return { ok: false, msg: 'Bạn đang gửi tin nhắn quá nhanh. Vui lòng đợi giây lát.' };
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
  // STREAMING
  // ============================================================================

  private async stream(userMsg: string, strictIntent?: 'nav' | 'theme'): Promise<void> {
    this.abortCtrl = new AbortController();
    const { signal } = this.abortCtrl;

    // In strict mode: no history context (prevents context manipulation attacks)
    const context = strictIntent ? [] : this.prepareContext(userMsg);
    const prompt = this.buildPrompt();
    const tools = this.buildTools();
    const maxTokens = 80;

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

      await this.processStream(res.body, signal, strictIntent);
    } finally {
      clearTimeout(timeout);
    }
  }

  private async processStream(
    body: ReadableStream<Uint8Array>, 
    signal: AbortSignal, 
    strictIntent?: 'nav' | 'theme'
  ): Promise<void> {
    return this.ngZone.runOutsideAngular(async () => {
      const reader = body.getReader();
      const decoder = new TextDecoder();
      let content = '';
      let toolCalls: ToolCall[] = [];
      let buffer = '';
      
      // In strict mode, suppress conversational text output
      const suppressText = !!strictIntent;

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

              const tools = this.parseTools(json);
              for (const t of tools) {
                if (!toolCalls.some((tc) => tc.name === t.name)) toolCalls.push(t);
              }

              // Only update UI with text if NOT in strict mode
              if (!suppressText && content.trim() && !toolCalls.length) {
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

        // Fallback: extract tool from text output
        if (!toolCalls.length) {
          const extracted = this.extractToolFromText(content);
          if (extracted) toolCalls.push(extracted);
        }

        if (toolCalls.length) {
          await this.ngZone.run(() => this.execTools(toolCalls));
        } else {
          // If strict intent but no tool called, fail safely
          if (strictIntent) {
            this.streamUpdate$.next({
              content: 'Không thể thực hiện yêu cầu. Vui lòng thử lại với lệnh rõ ràng hơn.',
              tokenEstimate: 0,
            });
          } else {
            this.streamUpdate$.next({
              content: this.sanitizeOut(content),
              tokenEstimate: this.tokens(content),
            });
          }
        }
      }
    });
  }

  // ============================================================================
  // TOOL PARSING
  // ============================================================================

  private parseTools(json: Record<string, unknown>): ToolCall[] {
    const results: ToolCall[] = [];

    try {
      const msg = (json['message'] ?? json) as Record<string, unknown>;

      const toolCalls = msg['tool_calls'] ?? json['tool_calls'];
      if (Array.isArray(toolCalls)) {
        for (const tc of toolCalls) {
          const parsed = this.parseSingleToolCall(tc as Record<string, unknown>);
          if (parsed) results.push(parsed);
        }
      }

      const funcCall = msg['function_call'] ?? json['function_call'];
      if (funcCall && typeof funcCall === 'object') {
        const fc = funcCall as Record<string, unknown>;
        const name = this.mapToolName(fc['name'] as string);
        if (name) {
          results.push({ name, arguments: this.parseArgs(fc['arguments'] ?? fc['args']) });
        }
      }
    } catch (e) {
      if (this.DEBUG) console.error('[LLM] parseTools error:', e);
    }

    return results;
  }

  private parseSingleToolCall(call: Record<string, unknown>): ToolCall | null {
    try {
      if (call['function'] && typeof call['function'] === 'object') {
        const fn = call['function'] as Record<string, unknown>;
        const name = this.mapToolName(fn['name'] as string);
        if (name) {
          return { name, arguments: this.parseArgs(fn['arguments'] ?? fn['args'] ?? fn['parameters']) };
        }
      }

      if (call['name'] && typeof call['name'] === 'string') {
        const name = this.mapToolName(call['name']);
        if (name) {
          return { name, arguments: this.parseArgs(call['arguments'] ?? call['args'] ?? call['input']) };
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

    if (typeof args === 'object' && args !== null && !Array.isArray(args)) {
      return args as Record<string, unknown>;
    }

    if (typeof args === 'string') {
      const trimmed = args.trim();
      if (trimmed.startsWith('{')) {
        try { return JSON.parse(trimmed); } catch { /* ignore */ }
      }
      return { k: trimmed };
    }

    return {};
  }

  private extractToolFromText(text: string): ToolCall | null {
    if (!text) return null;

    try {
      const navMatch = text.match(/\bnav\s+["']?(\S+)["']?/i);
      if (navMatch) {
        return { name: 'nav', arguments: { k: navMatch[1].replace(/['"]/g, '') } };
      }

      const themeMatch = text.match(/\btheme\s+(dark|light|toggle)/i);
      if (themeMatch) {
        return { name: 'theme', arguments: { m: themeMatch[1].toLowerCase() } };
      }

      const vnMatch = text.match(/(?:mở|chuyển|vào)\s+(?:trang\s+)?(\S+)/i);
      if (vnMatch) {
        const key = this.findRouteKey(vnMatch[1]);
        if (key) return { name: 'nav', arguments: { k: key } };
      }
    } catch { /* ignore */ }

    return null;
  }

  // ============================================================================
  // TOOL EXECUTION
  // ============================================================================

  private async execTools(calls: ToolCall[]): Promise<void> {
    for (const call of calls.slice(0, 2)) {
      if (!ALLOWED_TOOLS.includes(call.name as AllowedTool)) continue;

      try {
        const result = await this.execTool(call.name as AllowedTool, call.arguments);
        const msg = this.getConfirmation(call.name, result);
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

  private getConfirmation(name: string, result: ToolResult): string {
    if (!result.success) return result.error || 'Có lỗi xảy ra.';

    if (result.data === 'SAME') {
      return 'Bạn đang ở màn hình này rồi.';
    }

    if (name === 'nav') {
      return `Đang chuyển đến **${result.data}**...`;
    }

    if (name === 'theme') {
      return result.data === 'dark'
        ? 'Đã chuyển sang **giao diện tối**.'
        : 'Đã chuyển sang **giao diện sáng**.';
    }

    return 'Đã hoàn tất.';
  }

  private getToolErr(name: string): string {
    return name === 'nav'
      ? 'Không thể mở trang này. Có thể bạn chưa được cấp quyền.'
      : 'Không thể thay đổi giao diện. Vui lòng thử lại.';
  }

  // ============================================================================
  // NAVIGATION & THEME
  // ============================================================================

  private doNav(key: string): ToolResult {
    const currentPath = this.router.url.split('?')[0];

    if (this.isNavigating()) return { success: true, data: 'SAME' };

    const route = this.resolveRoute(key);
    if (!route) return { success: false, error: 'Không tìm thấy trang này.' };

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

    if (this.routeMap!.has(key)) return this.routeMap!.get(key)!;

    const cleanKey = key.replace(/^\/?(app\/)?/, '');
    if (this.routeMap!.has(cleanKey)) return this.routeMap!.get(cleanKey)!;

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
  // ROUTES
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
  // DISAMBIGUATION
  // ============================================================================

  private checkDisambiguation(msg: string): string | null {
    const normalized = normalize(msg);

    // Theme intent - let model handle
    const themePatterns = ['theme', 'giao dien', 'che do', 'sang', 'toi', 'dark', 'light'];
    if (themePatterns.some(p => normalized.includes(p))) return null;

    // Check for navigation intent
    const navPatterns = ['mo', 'xem', 'chuyen', 'vao', 'den', 'toi', 'open', 'go', 'show'];
    if (!navPatterns.some(p => normalized.includes(p))) return null;

    // Extract target
    let query = normalized;
    const removeWords = ['mo', 'xem', 'chuyen', 'vao', 'di', 'den', 'toi', 'navigate', 'open', 'go', 'show',
                         'trang', 'man hinh', 'screen', 'page', 'bao cao', 'report', 'cho toi', 'giup', 'cua', 'di'];
    removeWords.forEach((w) => (query = query.replace(new RegExp(`\\b${w}\\b`, 'g'), '')));
    query = query.trim();

    if (!query || query.length < 2) return null;

    const matches = this.findMatches(query);

    if (matches.length === 0) {
      const routes = this.getRoutes();
      const sample = routes.slice(0, 5).map((r) => `• ${r.title}`).join('\n');
      return `Không tìm thấy trang "${query}". Gợi ý:\n\n${sample}`;
    }

    if (matches.length === 1) return null;

    const opts = matches.slice(0, 5).map((m, i) => `${i + 1}. ${m.title}`).join('\n');
    return `Tìm thấy ${matches.length} trang phù hợp:\n\n${opts}\n\nBạn muốn mở trang số mấy?`;
  }

  private findMatches(query: string): RouteInfo[] {
    const words = query.split(' ').filter((w) => w.length > 1);
    return this.getRoutes().filter((r) => {
      const title = normalize(r.title);
      const key = r.key.toLowerCase();
      const kw = r.keywords?.map(k => normalize(k)) || [];
      return words.some((w) => title.includes(w) || key.includes(w) || kw.some((k) => k.includes(w)));
    });
  }

  // ============================================================================
  // CONTEXT & PROMPT
  // ============================================================================

  private prepareContext(newMsg: string): ChatMessage[] {
    const newTokens = this.tokens(newMsg);
    const available = this.MAX_CTX - this.promptTokens - this.TOOL_BUDGET - this.MAX_OUTPUT - newTokens - 50;

    const history = this.messages()
      .filter((m) => m.content.trim() && m.role !== 'system' && m.role !== 'tool')
      .map((m) => ({
        ...m,
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

    if (result.length && result[0].role === 'assistant') result.shift();

    this.contextUsage.set(
      Math.min(100, Math.round(((this.promptTokens + used + newTokens) / this.MAX_CTX) * 100))
    );

    return result;
  }

  private tokens(text: string): number {
    if (!text) return 0;
    return Math.ceil(text.length / this.CHARS_PER_TOKEN) + 2;
  }

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
    const routeStr = routes.slice(0, 10).map((r) => `${r.key}:${r.title}`).join('|');

    // Strict system prompt - tool calling only
    this.promptCache = `IT Bot HM Hospital.
TASK: nav screens + change theme ONLY.
STRICT: DO NOT chat. DO NOT explain. DO NOT answer questions.
TOOLS: nav(k=route_key) | theme(m=dark/light/toggle)
ROUTES: ${routeStr}
ACTION: Call tool immediately. No text response.`;

    this.promptTokens = this.tokens(this.promptCache);

    return this.promptCache;
  }

  private buildTools(): unknown[] {
    if (this.toolCache) return this.toolCache;

    const routeKeys = this.getRoutes().map((r) => r.key);

    this.toolCache = [
      {
        type: 'function',
        function: {
          name: 'nav',
          description: 'Navigate to screen',
          parameters: {
            type: 'object',
            properties: { k: { type: 'string', enum: routeKeys } },
            required: ['k'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'theme',
          description: 'Change theme',
          parameters: {
            type: 'object',
            properties: { m: { type: 'string', enum: ['light', 'dark', 'toggle'] } },
            required: ['m'],
          },
        },
      },
    ];

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
        arr[last] = { ...arr[last], content: 'Không thể thực hiện yêu cầu này.' };
      }
      return arr;
    });
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
    this.messages.update((m) => [
      ...m,
      this.createMsg('assistant', 'Xin chào. Tôi có thể hỗ trợ bạn điều hướng hệ thống hoặc thay đổi giao diện.'),
    ]);
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
          ? `Model "${this.MODEL}" không khả dụng.`
          : 'Hệ thống đang bận. Vui lòng thử lại.';
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