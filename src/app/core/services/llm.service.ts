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
  description?: string;
}

interface ToolResult {
  success: boolean;
  data?: string;
  error?: string;
}

// ============================================================================
// INTENT TYPES
// ============================================================================

type Intent = 'nav' | 'theme' | 'it_support' | 'general';

// ============================================================================
// KNOWLEDGE BASE
// ============================================================================

const IT_HOTLINE = '**1108** hoặc **1109**';

const IT_KNOWLEDGE = `
QUY TRÌNH HỖ TRỢ IT CƠ BẢN:

[MẬT KHẨU]
- Đổi mật khẩu: Vào Cài đặt, nhập mật khẩu cũ và mật khẩu mới
- Quên mật khẩu: Liên hệ IT hotline để yêu cầu reset mật khẩu
- Tài khoản bị khóa (sai 5 lần): Liên hệ IT hotline để mở khóa
- Lưu ý: KHÔNG chia sẻ mật khẩu cho bất kỳ ai

[MÁY IN]
- Không in được: Kiểm tra kết nối > Restart máy in > Báo IT
- Kẹt giấy: Tắt nguồn, mở nắp, nhẹ nhàng gỡ giấy
- In mờ/nhòe: Cần thay mực, báo IT

[MẠNG]
- Mất mạng: Kiểm tra dây cắm > Restart máy > Báo IT
- Chậm/lag: Đóng tab không dùng, restart trình duyệt

[HỆ THỐNG]
- Treo/đơ: Nhấn F5 refresh hoặc đăng xuất rồi đăng nhập lại
- Lỗi lưu: KHÔNG tắt máy, báo IT ngay
- Không load: Xóa cache (Ctrl+Shift+Delete)
`;

const FEATURE_DESCRIPTIONS: Record<string, string> = {
  home: 'Trang chủ: Hiển thị tổng quan và thông báo hệ thống.',
  settings: 'Cài đặt: Đổi mật khẩu, cập nhật thông tin cá nhân.',
  'equipment/catalog':
    'Danh mục thiết bị: Tra cứu, quét QR, theo dõi bàn giao thiết bị y tế.',
  'reports/bed-usage':
    'Báo cáo giường: Thống kê công suất sử dụng giường theo khoa/phòng.',
  'reports/examination-overview':
    'Báo cáo khám: Thống kê lượt khám, BHYT, viện phí, doanh thu.',
  'reports/missing-medical-records':
    'Báo cáo HSBA thiếu: Danh sách hồ sơ bệnh án chưa hoàn thiện.',
  'reports/cls-level3': 'Báo cáo CLS tầng 3: Thống kê xét nghiệm, CĐHA tầng 3.',
  'reports/cls-level6': 'Báo cáo CLS tầng 6: Thống kê xét nghiệm, CĐHA tầng 6.',
  'reports/specialty-cls':
    'Báo cáo CLS chuyên khoa: Thống kê theo từng chuyên khoa.',
};

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
  [/\bmk\b/g, 'mật khẩu'],
  [/\bpass\b/g, 'password'],
];

function normalize(text: string): string {
  let s = text.toLowerCase().trim();
  for (const [re, repl] of ABBREVIATIONS) {
    s = s.replace(re, repl);
  }
  s = s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  s = s.replace(/đ/g, 'd').replace(/Đ/g, 'D');
  return s.replace(/\s+/g, ' ').trim();
}

// ============================================================================
// LANGUAGE DETECTION
// ============================================================================

function detectLanguage(text: string): 'vi' | 'en' {
  if (
    /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/.test(
      text
    )
  ) {
    return 'vi';
  }

  const lower = text.toLowerCase();

  const vnWords =
    /\b(toi|ban|cua|nay|do|duoc|khong|co|la|va|cho|voi|den|xem|mo|chuyen|vao|giup|can|mat khau|quen|doi|bi khoa)\b/;
  if (vnWords.test(lower)) {
    return 'vi';
  }

  const enStarters =
    /^(please|can you|could you|i want|i need|how do i|what is|show me|help me|take me|i forgot|change my)/i;
  if (enStarters.test(lower)) {
    return 'en';
  }

  return 'vi';
}

// ============================================================================
// CLASSIFICATION - RELAXED APPROACH
// ============================================================================

interface ClassifyResult {
  type: 'direct' | 'llm' | 'blocked';
  response?: string;
  intent?: Intent;
  navTarget?: string; // Hint for navigation
  language: 'vi' | 'en';
}

// BLOCKLIST: Security & out-of-scope
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

  // === Harmful ===
  /(cach|thuoc|lam sao).*(tu tu|chet|giet|hai|doc)/i,
  /(hack|crack|bypass|exploit).*(password|system|admin|server|database)/i,
  /(sql injection|xss|ddos|malware|ransomware|trojan|phishing)/i,
  /(lam|che tao).*(bom|thuoc no|ma tuy|vu khi)/i,
  /(lay|danh cap|steal|extract).*thong tin.*(benh nhan|database|patient)/i,
  /truy cap\s*trai phep/i,
  /unauthorized\s*access/i,

  // === Clearly out-of-scope ===
  /viet\s*(code|script|tho|truyen|bai|van)/i,
  /code\s*(python|java|sql|js|javascript|html|css)/i,
  /(fix|sua|debug)\s*(code|bug)/i,
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
  /write\s*(a|me|the)?\s*(poem|story|essay|code|script|song)/i,
  /tell\s*(me)?\s*(a\s*)?(joke|story|about)/i,
  /create\s*(a|an|the)?\s*(image|picture|song|video)/i,
  /generate\s*(a|an)?\s*(random|new)/i,
  /translate\s*(this|to|from)/i,
  /summarize|paraphrase/i,
];

// QUICK RESPONSES: Greetings, thanks, etc.
interface QuickResponse {
  patterns: string[];
  response: string | string[];
}

const QUICK_RESPONSES: QuickResponse[] = [
  {
    patterns: ['xin chao', 'chao ban', 'hello', 'hi', 'hey', 'alo'],
    response: [
      'Xin chào! Tôi có thể hỗ trợ điều hướng, đổi giao diện, và hướng dẫn IT cơ bản. Bạn cần gì?',
      'Chào bạn! Tôi là trợ lý IT. Bạn cần hỗ trợ gì?',
    ],
  },
  {
    patterns: ['cam on', 'thank', 'thanks'],
    response: ['Không có gì!', 'Rất vui được hỗ trợ!'],
  },
  {
    patterns: ['ok', 'duoc roi', 'hieu roi', 'da hieu', 'got it'],
    response: 'Bạn cần hỗ trợ thêm gì không?',
  },
  {
    patterns: ['tam biet', 'bye', 'goodbye', 'chao nhe'],
    response: 'Tạm biệt! Hẹn gặp lại.',
  },
  {
    patterns: [
      'hotline',
      'so dien thoai',
      'lien he it',
      'gap nguoi',
      'khan cap',
      'urgent',
    ],
    response: `📞 **IT Hotline:** 1108 hoặc 1109\n\nĐội IT sẽ hỗ trợ bạn ngay!`,
  },
];

// PASSWORD patterns
const PASSWORD_FORGOT = [
  'quen mat khau',
  'forgot password',
  'khong nho mat khau',
  'quen pass',
  'quen mk',
];

const PASSWORD_LOCKED = [
  'bi khoa',
  'tai khoan khoa',
  'account locked',
  'locked out',
  'khong dang nhap duoc',
  'cannot login',
];

const PASSWORD_CHANGE = [
  'doi mat khau',
  'change password',
  'thay mat khau',
  'doi pass',
  'doi mk',
];

// INTENT DETECTION
function detectIntent(normalized: string, original: string): Intent {
  // Theme - check with original text for Vietnamese diacritics
  if (
    /\b(theme|giao dien|che do|dark|light|ban dem|ban ngay|night mode|day mode)\b/.test(
      normalized
    )
  ) {
    return 'theme';
  }

  // Theme with Vietnamese diacritics
  if (/sáng|tối|đổi màu|chuyển màu/i.test(original)) {
    return 'theme';
  }

  // Navigation
  if (
    /\b(mo|vao|den|xem|chuyen|open|go to|go|navigate|show|take me|man hinh|trang|menu)\b/.test(
      normalized
    )
  ) {
    return 'nav';
  }

  // Screen names → nav
  if (
    /\b(home|settings|cai dat|dashboard|equipment|thiet bi|report|bao cao|giuong|bed|kham|hsba|cls)\b/.test(
      normalized
    )
  ) {
    return 'nav';
  }

  // IT Support
  if (
    /\b(loi|error|khong duoc|bi loi|may in|printer|mang|network|internet|treo|lag|cham|refresh)\b/.test(
      normalized
    )
  ) {
    return 'it_support';
  }

  return 'general';
}

function classify(input: string): ClassifyResult {
  const raw = input.toLowerCase();
  const normalized = normalize(input);
  const language = detectLanguage(input);

  // =========================================
  // STEP 1: BLOCKLIST
  // =========================================
  for (const pattern of BLOCKLIST) {
    if (pattern.test(raw) || pattern.test(normalized)) {
      return {
        type: 'blocked',
        response:
          language === 'en'
            ? `This is outside my scope. I can help with navigation, theme, and basic IT support. For complex issues, contact IT hotline ${IT_HOTLINE}.`
            : `Nội dung này nằm ngoài phạm vi hỗ trợ. Tôi có thể giúp điều hướng, đổi giao diện và hỗ trợ IT cơ bản. Vấn đề phức tạp vui lòng liên hệ IT hotline ${IT_HOTLINE}.`,
        language,
      };
    }
  }

  // =========================================
  // STEP 2: PASSWORD
  // =========================================
  if (PASSWORD_FORGOT.some((p) => normalized.includes(p))) {
    return {
      type: 'direct',
      response:
        language === 'en'
          ? `**Forgot password?**\n\nPlease contact IT hotline ${IT_HOTLINE} to request a password reset.`
          : `**Quên mật khẩu?**\n\nVui lòng liên hệ IT hotline ${IT_HOTLINE} để yêu cầu reset mật khẩu.`,
      language,
    };
  }

  if (PASSWORD_LOCKED.some((p) => normalized.includes(p))) {
    return {
      type: 'direct',
      response:
        language === 'en'
          ? `**Account locked?**\n\nPlease contact IT hotline ${IT_HOTLINE} to unlock your account.`
          : `**Tài khoản bị khóa?**\n\nVui lòng liên hệ IT hotline ${IT_HOTLINE} để được mở khóa.`,
      language,
    };
  }

  if (PASSWORD_CHANGE.some((p) => normalized.includes(p))) {
    return {
      type: 'llm',
      intent: 'nav',
      navTarget: 'settings', // Hint: navigate to settings
      language,
    };
  }

  // =========================================
  // STEP 3: QUICK RESPONSES
  // =========================================
  for (const entry of QUICK_RESPONSES) {
    if (entry.patterns.some((p) => normalized.includes(p))) {
      const resp = Array.isArray(entry.response)
        ? entry.response[Math.floor(Math.random() * entry.response.length)]
        : entry.response;
      return { type: 'direct', response: resp, language };
    }
  }

  // =========================================
  // STEP 4: EVERYTHING ELSE → LLM
  // =========================================
  const intent = detectIntent(normalized, input);
  return { type: 'llm', intent, language };
}

// ============================================================================
// CONSTANTS
// ============================================================================

const SCREEN_KEYWORDS: Record<string, string[]> = {
  home: ['home', 'trang chủ', 'chính', 'dashboard', 'tổng quan'],
  settings: [
    'settings',
    'cài đặt',
    'tài khoản',
    'account',
    'profile',
    'hồ sơ',
    'đổi mật khẩu',
    'mat khau',
  ],
  'equipment/catalog': [
    'thiết bị',
    'máy móc',
    'catalog',
    'danh sách',
    'qr',
    'bàn giao',
  ],
  'equipment/dashboard': ['thiết bị dashboard', 'biểu đồ thiết bị'],
  'reports/bed-usage': ['giường', 'bed', 'công suất'],
  'reports/examination-overview': [
    'khám',
    'examination',
    'bhyt',
    'viện phí',
    'doanh thu',
  ],
  'reports/missing-medical-records': [
    'hsba',
    'hồ sơ bệnh án',
    'medical records',
  ],
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
  private readonly MODEL = 'qwen3:4b-instruct';

  // Settings
  private readonly MAX_CTX = 4096;
  private readonly MAX_HISTORY = 3;
  private readonly MAX_OUTPUT = 200;
  private readonly TOOL_BUDGET = 200;
  private readonly CHARS_PER_TOKEN = 2.5;
  private readonly SESSION_TIMEOUT = 15 * 60 * 1000;
  private readonly THEME_COOLDOWN = 1000;
  private readonly UI_DEBOUNCE = 30;
  private readonly MAX_RETRIES = 2;
  private readonly RETRY_DELAY = 800;
  private readonly TIMEOUT = 60000;
  private readonly MAX_INPUT = 300;
  private readonly MAX_OUTPUT_CHARS = 800;
  private readonly RATE_LIMIT = 15;
  private readonly RATE_WINDOW = 60_000;
  private readonly RATE_COOLDOWN = 10_000;

  // Sampling settings
  private readonly SAMPLING = {
    temperature: 0.3,
    top_p: 0.85,
    top_k: 20,
    repeat_penalty: 1.15,
  };

  private readonly TOOL_SAMPLING = {
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

    this.messages.update((m) => [...m, this.createMsg('user', input)]);
    this.resetSessionTimer();
    this.abort();

    // Classify
    const result = classify(input);

    // Direct response or blocked
    if (result.type === 'direct' || result.type === 'blocked') {
      await this.respondWithTyping(result.response!);
      return;
    }

    // =========================================
    // NAVIGATION: Check for route matches first
    // =========================================
    if (result.intent === 'nav') {
      const navResult = await this.handleNavigation(input, result);
      if (navResult.handled) return;
      // If not handled, continue to LLM
    }

    // =========================================
    // THEME: Let LLM handle
    // =========================================

    // Pass to LLM
    this.messages.update((m) => [...m, this.createMsg('assistant', '', 0)]);
    this.isGenerating.set(true);

    try {
      await this.retry(() =>
        this.stream(input, result.intent!, result.language)
      );
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
  // NAVIGATION HANDLING
  // ============================================================================

  private async handleNavigation(
    input: string,
    result: ClassifyResult
  ): Promise<{ handled: boolean }> {
    // Extract target from input or use hint
    const target = result.navTarget || this.extractNavTarget(input);
    if (!target) return { handled: false };

    const matches = this.findMatchingRoutes(target);

    // Single match → navigate directly
    if (matches.length === 1) {
      this.messages.update((m) => [...m, this.createMsg('assistant', '', 0)]);
      this.isGenerating.set(true);
      await this.delay(600);

      const navResult = this.doNav(matches[0].key);
      const msg = this.getNavMessage(navResult, matches[0], result.navTarget);

      this.updateLastMessageContent(msg);
      this.isGenerating.set(false);
      this.finalize();
      return { handled: true };
    }

    // Multiple matches → ask user to choose
    if (matches.length > 1) {
      const options = matches.map((m, i) => `${i + 1}. ${m.title}`).join('\n');
      await this.respondWithTyping(
        `Tìm thấy ${matches.length} màn hình phù hợp:\n\n${options}\n\nBạn muốn mở màn hình nào?`
      );
      return { handled: true };
    }

    // No matches → let LLM handle (might suggest alternatives)
    return { handled: false };
  }

  private extractNavTarget(input: string): string {
    const normalized = normalize(input);

    // Remove navigation verbs, keep the target
    const removeWords = [
      'mo',
      'vao',
      'den',
      'xem',
      'chuyen',
      'di',
      'toi',
      'open',
      'go',
      'to',
      'navigate',
      'show',
      'take',
      'me',
      'trang',
      'man hinh',
      'screen',
      'page',
      'cho',
      'giup',
      'can',
      'muon',
    ];

    let target = normalized;
    removeWords.forEach(
      (w) => (target = target.replace(new RegExp(`\\b${w}\\b`, 'g'), ''))
    );

    return target.replace(/\s+/g, ' ').trim();
  }

  private findMatchingRoutes(target: string): RouteInfo[] {
    if (!target || target.length < 2) return [];

    const routes = this.getRoutes();
    const words = target.split(' ').filter((w) => w.length > 1);

    if (words.length === 0) return [];

    return routes.filter((r) => {
      const title = normalize(r.title);
      const key = r.key.toLowerCase();
      const keywords = r.keywords?.map((k) => normalize(k)) || [];

      return words.some(
        (w) =>
          title.includes(w) ||
          key.includes(w) ||
          keywords.some((kw) => kw.includes(w) || w.includes(kw))
      );
    });
  }

  private getNavMessage(
    result: ToolResult,
    route: RouteInfo,
    navTarget?: string
  ): string {
    if (!result.success) return result.error || 'Có lỗi xảy ra.';

    // Special case: password change
    const isPasswordChange = navTarget === 'settings';

    if (result.data === 'SAME') {
      if (isPasswordChange) {
        return `Bạn đang ở màn hình **${route.title}** rồi. Nhập mật khẩu cũ và mật khẩu mới bên dưới để đổi.`;
      }
      return `Bạn đang ở màn hình **${route.title}** rồi.`;
    }

    if (isPasswordChange) {
      return `Đang chuyển đến **${route.title}**. Nhập mật khẩu cũ và mật khẩu mới để đổi.`;
    }

    return `Đang chuyển đến **${route.title}**...`;
  }

  // ============================================================================
  // TYPING SIMULATION
  // ============================================================================

  private async respondWithTyping(response: string): Promise<void> {
    this.isGenerating.set(true);
    this.messages.update((m) => [...m, this.createMsg('assistant', '', 0)]);

    const thinkingDelay = 600 + Math.random() * 600;
    await this.delay(thinkingDelay);

    const chunkSize = 4;
    let currentText = '';

    for (let i = 0; i < response.length; i += chunkSize) {
      if (!this.isGenerating()) break;

      const chunk = response.slice(i, i + chunkSize);
      currentText += chunk;
      this.updateLastMessageContent(currentText);

      await this.delay(10 + Math.random() * 20);
    }

    this.isGenerating.set(false);
    this.finalize();
  }

  private updateLastMessageContent(text: string): void {
    this.messages.update((msgs) => {
      const arr = [...msgs];
      const lastIndex = arr.length - 1;
      if (lastIndex >= 0 && arr[lastIndex].role === 'assistant') {
        arr[lastIndex] = {
          ...arr[lastIndex],
          content: text,
          tokenEstimate: this.tokens(text),
        };
      }
      return arr;
    });
  }

  // ============================================================================
  // RATE LIMITING
  // ============================================================================

  private checkRate(): { ok: boolean; msg?: string } {
    const now = Date.now();

    if (now < this.rateCooldownUntil) {
      const sec = Math.ceil((this.rateCooldownUntil - now) / 1000);
      return {
        ok: false,
        msg: `Hệ thống đang bận. Vui lòng thử lại sau ${sec} giây.`,
      };
    }

    this.msgTimestamps = this.msgTimestamps.filter(
      (t) => now - t < this.RATE_WINDOW
    );

    if (this.msgTimestamps.length >= this.RATE_LIMIT) {
      this.rateCooldownUntil = now + this.RATE_COOLDOWN;
      return {
        ok: false,
        msg: 'Bạn đang gửi tin nhắn quá nhanh. Vui lòng đợi giây lát.',
      };
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
    r = r.replace(
      /```[\s\S]*?```|<[^>]+>|\[INST\]|\[\/INST\]|<<SYS>>|<\|im_\w+\|>/gi,
      ''
    );
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
    if (r.length > this.MAX_OUTPUT_CHARS)
      r = r.substring(0, this.MAX_OUTPUT_CHARS) + '...';
    return r.replace(/\n{3,}/g, '\n\n').trim();
  }

  // ============================================================================
  // STREAMING
  // ============================================================================

  private async stream(
    userMsg: string,
    intent: Intent,
    language: 'vi' | 'en'
  ): Promise<void> {
    this.abortCtrl = new AbortController();
    const { signal } = this.abortCtrl;

    const isToolIntent = intent === 'nav' || intent === 'theme';
    const context = isToolIntent ? [] : this.prepareContext(userMsg);
    const prompt = this.buildPromptForIntent(intent, language);
    const tools = isToolIntent ? this.buildTools() : [];
    const sampling = isToolIntent ? this.TOOL_SAMPLING : this.SAMPLING;
    const maxTokens = isToolIntent ? 80 : 150;

    const payload = {
      model: this.MODEL,
      messages: [
        { role: 'system', content: prompt },
        ...context.map((m) => ({ role: m.role, content: m.content })),
        { role: 'user', content: userMsg },
      ],
      tools: tools.length > 0 ? tools : undefined,
      stream: true,
      options: {
        ...sampling,
        num_predict: maxTokens,
        num_ctx: this.MAX_CTX,
      },
    };

    if (this.DEBUG)
      console.log('[LLM] Request:', JSON.stringify(payload, null, 2));

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

      await this.processStream(res.body, signal, intent, language);
    } finally {
      clearTimeout(timeout);
    }
  }

  private async processStream(
    body: ReadableStream<Uint8Array>,
    signal: AbortSignal,
    intent: Intent,
    language: 'vi' | 'en'
  ): Promise<void> {
    return this.ngZone.runOutsideAngular(async () => {
      const reader = body.getReader();
      const decoder = new TextDecoder();
      let content = '';
      let toolCalls: ToolCall[] = [];
      let buffer = '';

      const isToolIntent = intent === 'nav' || intent === 'theme';
      const suppressText = isToolIntent;

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
                if (!toolCalls.some((tc) => tc.name === t.name))
                  toolCalls.push(t);
              }

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
              if (!toolCalls.some((tc) => tc.name === t.name))
                toolCalls.push(t);
            }
          } catch {
            /* ignore */
          }
        }
      } finally {
        reader.releaseLock();

        if (this.DEBUG) {
          console.log('[LLM] Final content:', content);
          console.log('[LLM] Tool calls:', toolCalls);
        }

        // Fallback: extract tool from text
        if (isToolIntent && !toolCalls.length) {
          const extracted = this.extractToolFromText(content);
          if (extracted) toolCalls.push(extracted);
        }

        if (toolCalls.length) {
          await this.ngZone.run(() => this.execTools(toolCalls));
        } else if (isToolIntent) {
          // For nav intent: suggest available screens
          const routes = this.getRoutes();
          const sample = routes
            .slice(0, 5)
            .map((r) => `• ${r.title}`)
            .join('\n');
          const fallbackMsg =
            language === 'en'
              ? `I'm not sure which screen you want. Available screens:\n\n${sample}`
              : `Tôi không chắc bạn muốn mở màn hình nào. Các màn hình có sẵn:\n\n${sample}`;
          this.streamUpdate$.next({ content: fallbackMsg, tokenEstimate: 0 });
        } else {
          let finalContent = this.sanitizeOut(content);
          if (finalContent.length < 10 || !finalContent.trim()) {
            finalContent =
              language === 'en'
                ? `I'm not sure how to help with that. For IT issues, contact hotline ${IT_HOTLINE}.`
                : `Tôi không chắc cách hỗ trợ vấn đề này. Liên hệ IT hotline ${IT_HOTLINE} nếu cần.`;
          }
          this.streamUpdate$.next({
            content: finalContent,
            tokenEstimate: this.tokens(content),
          });
        }
      }
    });
  }

  // ============================================================================
  // PROMPT BUILDING
  // ============================================================================

  private buildPromptForIntent(intent: Intent, language: 'vi' | 'en'): string {
    const langInstruction =
      language === 'en' ? 'Respond in English.' : 'Trả lời bằng tiếng Việt.';

    const routes = this.getRoutes();
    const routeStr = routes
      .slice(0, 12)
      .map((r) => `${r.key}:${r.title}`)
      .join('|');

    switch (intent) {
case 'nav':
case 'theme':
  return `IT Bot BV Hoàn Mỹ. /no_think
TASK: Navigation + Theme.
TOOLS: nav(k=route_key) | theme(m=dark/light/toggle)
ROUTES: ${routeStr}
// CHANGE THIS LINE BELOW:
RULE: YOU MUST USE THE 'nav' TOOL to change screens. DO NOT just say you opened it.
${langInstruction}`;

      case 'it_support':
        return `IT Bot BV Hoàn Mỹ. /no_think
ROLE: Hướng dẫn xử lý sự cố IT cơ bản.
${langInstruction}

${IT_KNOWLEDGE}

RULES:
- Trả lời ngắn gọn, thân thiện.
- Vấn đề phức tạp: Liên hệ IT hotline 1108 hoặc 1109.
- Không bịa đặt giải pháp.`;

      case 'general':
      default:
        const featureStr = Object.entries(FEATURE_DESCRIPTIONS)
          .map(([k, v]) => `${k}: ${v}`)
          .join('\n');

        return `IT Bot BV Hoàn Mỹ. /no_think
ROLE: Trợ lý IT thân thiện.
${langInstruction}

CAPABILITIES:
- Điều hướng màn hình (nav tool)
- Đổi giao diện sáng/tối (theme tool)
- Hướng dẫn IT cơ bản

SCREENS:
${featureStr}

TOOLS: nav(k=route_key) | theme(m=dark/light/toggle)
ROUTES: ${routeStr}

RULES:
- Trả lời ngắn gọn, thân thiện.
- Nếu user muốn mở màn hình hoặc đổi theme: dùng tool.
- Nếu không biết: "Vui lòng liên hệ IT hotline 1108/1109."
- Không bịa đặt thông tin.`;
    }
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
          const parsed = this.parseSingleToolCall(
            tc as Record<string, unknown>
          );
          if (parsed) results.push(parsed);
        }
      }

      const funcCall = msg['function_call'] ?? json['function_call'];
      if (funcCall && typeof funcCall === 'object') {
        const fc = funcCall as Record<string, unknown>;
        const name = this.mapToolName(fc['name'] as string);
        if (name) {
          results.push({
            name,
            arguments: this.parseArgs(fc['arguments'] ?? fc['args']),
          });
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
          return {
            name,
            arguments: this.parseArgs(
              fn['arguments'] ?? fn['args'] ?? fn['parameters']
            ),
          };
        }
      }

      if (call['name'] && typeof call['name'] === 'string') {
        const name = this.mapToolName(call['name']);
        if (name) {
          return {
            name,
            arguments: this.parseArgs(
              call['arguments'] ?? call['args'] ?? call['input']
            ),
          };
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
        try {
          return JSON.parse(trimmed);
        } catch {
          /* ignore */
        }
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
        return {
          name: 'nav',
          arguments: { k: navMatch[1].replace(/['"]/g, '') },
        };
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
    } catch {
      /* ignore */
    }

    return null;
  }

  // ============================================================================
  // TOOL EXECUTION
  // ============================================================================

  private async execTools(calls: ToolCall[]): Promise<void> {
    for (const call of calls.slice(0, 2)) {
      if (!ALLOWED_TOOLS.includes(call.name as AllowedTool)) continue;

      try {
        const result = await this.execTool(
          call.name as AllowedTool,
          call.arguments
        );
        const msg = this.getToolConfirmation(call.name, result);
        if (msg) this.setLastMsg(msg);
      } catch (e) {
        console.error(`[LLM] Tool error ${call.name}:`, e);
        this.setLastMsg(this.getToolErr(call.name));
      }
    }
  }

  private async execTool(
    name: AllowedTool,
    args: Record<string, unknown>
  ): Promise<ToolResult> {
    switch (name) {
      case 'nav': {
        const key = (args['k'] ||
          args['key'] ||
          args['path'] ||
          args['screen']) as string;
        if (!key) return { success: false, error: 'Đường dẫn không hợp lệ.' };
        return this.doNav(key);
      }
      case 'theme': {
        const mode = (args['m'] || args['mode'] || 'toggle') as string;
        return this.doTheme(mode);
      }
    }
  }

  private getToolConfirmation(name: string, result: ToolResult): string {
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
      ? `Không thể mở trang này. Vui lòng liên hệ IT hotline ${IT_HOTLINE}.`
      : `Không thể thay đổi giao diện. Vui lòng liên hệ IT hotline ${IT_HOTLINE}.`;
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

    return (
      routes.find(
        (r) =>
          r.key.includes(lower) ||
          r.fullUrl.includes(lower) ||
          r.title.toLowerCase().includes(lower) ||
          r.keywords?.some((kw) => kw.includes(lower))
      ) || null
    );
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
      const key = fullPath.startsWith('/app/')
        ? fullPath.substring(5)
        : fullPath.substring(1);

      if (!this.checkPerm(route)) continue;

      if (route.data?.['title']) {
        results.push({
          title: route.data['title'] as string,
          fullUrl: fullPath,
          key,
          keywords: SCREEN_KEYWORDS[key],
          description: FEATURE_DESCRIPTIONS[key],
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
  // CONTEXT
  // ============================================================================

  private prepareContext(newMsg: string): ChatMessage[] {
    const newTokens = this.tokens(newMsg);
    const available =
      this.MAX_CTX - 500 - this.TOOL_BUDGET - this.MAX_OUTPUT - newTokens - 50;

    const history = this.messages()
      .filter(
        (m) => m.content.trim() && m.role !== 'system' && m.role !== 'tool'
      )
      .map((m) => ({
        ...m,
        content:
          m.content.length > 150
            ? m.content.substring(0, 150) + '...'
            : m.content,
      }));

    const result: ChatMessage[] = [];
    let used = 0;

    for (
      let i = history.length - 1;
      i >= 0 && result.length < this.MAX_HISTORY;
      i--
    ) {
      const tokens = this.tokens(history[i].content);
      if (used + tokens > available) break;
      used += tokens;
      result.unshift(history[i]);
    }

    if (result.length && result[0].role === 'assistant') result.shift();

    this.contextUsage.set(
      Math.min(100, Math.round(((500 + used + newTokens) / this.MAX_CTX) * 100))
    );

    return result;
  }

  private tokens(text: string): number {
    if (!text) return 0;
    return Math.ceil(text.length / this.CHARS_PER_TOKEN) + 2;
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
            properties: {
              m: { type: 'string', enum: ['light', 'dark', 'toggle'] },
            },
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
        arr[last] = {
          ...arr[last],
          content: u.content,
          tokenEstimate: u.tokenEstimate,
        };
      }
      return arr;
    });
  }

  private cleanupEmpty(): void {
    this.messages.update((msgs) => {
      const arr = [...msgs];
      const last = arr.length - 1;
      if (
        last >= 0 &&
        arr[last].role === 'assistant' &&
        !arr[last].content.trim()
      ) {
        arr[last] = {
          ...arr[last],
          content: `Xin lỗi, tôi không hiểu. Bạn có thể nói rõ hơn không?`,
        };
      }
      return arr;
    });
  }

  private createMsg(
    role: ChatMessage['role'],
    content: string,
    tokenEstimate?: number
  ): ChatMessage {
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
      this.createMsg(
        'assistant',
        `Xin chào! Tôi là trợ lý IT của Bệnh viện Hoàn Mỹ. Bạn cần hỗ trợ gì?`
      ),
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
      const res = await fetch(`${url.protocol}//${url.host}/`, {
        method: 'GET',
        signal: ctrl.signal,
      });
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
        const msg =
          error instanceof Error && error.message.includes('404')
            ? `Model "${this.MODEL}" không khả dụng. Vui lòng liên hệ IT hotline ${IT_HOTLINE}.`
            : `Hệ thống đang bận. Vui lòng thử lại hoặc liên hệ IT hotline ${IT_HOTLINE}.`;
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