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
  thinking?: string;
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
  thinking?: string;
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

interface ToolResult {
  success: boolean;
  data?: string;
  error?: string;
}

interface MessageClassification {
  type: 'greeting' | 'acknowledgment' | 'business_intent' | 'blocked_topic' | 'harmful' | 'unknown';
  confidence: number;
  blockedReason?: string;
  suggestedResponse?: string;
}

// ============================================================================
// CONFIGURATION CONSTANTS
// ============================================================================

/**
 * Screen descriptions with keywords for better matching
 */
const SCREEN_CONFIG: Record<string, { description: string; keywords: string[] }> = {
  home: {
    description: 'Trang chính, thống kê tổng quan',
    keywords: ['home', 'trang chủ', 'chính', 'dashboard', 'tổng quan'],
  },
  settings: {
    description: 'Cài đặt tài khoản, đổi mật khẩu',
    keywords: [
      'settings', 'cài đặt', 'tài khoản', 'account',
      'mật khẩu', 'pass', 'password', 'đổi pass', 'đổi mật khẩu',
      'change password', 'reset pass', 'quên pass',
      'thông tin', 'cá nhân', 'profile', 'hồ sơ',
    ],
  },
  'equipment/catalog': {
    description: 'Danh sách thiết bị, in QR, biên bản bàn giao',
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
    keywords: ['khám', 'examination', 'bhyt', 'viện phí', 'tổng quan', 'doanh thu'],
  },
  'reports/missing-medical-records': {
    description: 'Báo cáo bác sĩ chưa hoàn tất HSBA',
    keywords: ['hsba', 'hồ sơ', 'bác sĩ', 'medical records', 'thiếu'],
  },
  'reports/cls-level3': {
    description: 'Hoạt động CLS Tầng 3',
    keywords: ['cls', 'tầng 3', 'lầu 3', 'level 3', 'level3', 'cận lâm sàng'],
  },
  'reports/cls-level6': {
    description: 'Hoạt động CLS Tầng 6',
    keywords: ['cls', 'tầng 6', 'lầu 6', 'level 6', 'level6', 'cận lâm sàng'],
  },
  'reports/specialty-cls': {
    description: 'Thống kê CLS theo Chuyên khoa',
    keywords: ['cls', 'chuyên khoa', 'specialty', 'thống kê'],
  },
};

/**
 * Blocked off-topic patterns - outside hospital IT scope
 */
const BLOCKED_TOPIC_PATTERNS: RegExp[] = [
  // Programming/coding
  /viết\s*(code|script|chương trình|hàm|function)/i,
  /code\s*(python|java|javascript|c\+\+|sql|html)/i,
  /(fix|sửa|debug)\s*(code|bug|lỗi code)/i,
  /giải\s*(thuật toán|algorithm|bài tập|đề)/i,

  // Creative writing
  /viết\s*(thơ|bài hát|truyện|văn|luận|essay)/i,
  /sáng tác|compose|write\s*(poem|song|story)/i,

  // Translation
  /(dịch|translate)\s*.{0,30}\s*(sang|to|qua)\s*(tiếng|ngôn ngữ)/i,

  // Politics & religion
  /(chính trị|bầu cử|đảng phái|political)/i,
  /(tôn giáo|religion|phật|chúa|allah)/i,

  // Cooking
  /(nấu|làm|chế biến)\s*(ăn|món|bánh|cơm|phở)/i,
  /công thức\s*(nấu|làm)/i,
  /recipe|cooking/i,

  // Dating
  /(tình yêu|hẹn hò|dating|yêu đương)/i,
  /(cua|tán|flirt)\s*(gái|trai|crush)/i,

  // Finance & crypto
  /(giá|price)\s*(vàng|gold|bitcoin|coin|stock|chứng khoán)/i,
  /(đầu tư|invest|trading|crypto|forex|nft)/i,

  // Entertainment
  /(phim|movie|netflix|game|trò chơi)\s*(hay|nên xem|recommend)/i,
  /(nhạc|music|spotify|youtube)\s*(hay|nghe)/i,

  // General knowledge
  /(thủ đô|capital)\s*(của|of)/i,
  /(ai là|who is)\s*(tổng thống|president|thủ tướng)/i,
  /lịch sử\s*(thế giới|world)/i,

  // Math homework
  /giải\s*(phương trình|equation|toán|math)/i,
  /tính\s*(đạo hàm|tích phân|integral)/i,

  // Emotional engagement - redirect to work
  /^.{0,20}(chán|buồn|mệt|stress|bực|khó chịu|vui|happy|sad|tired|bored|boring).{0,15}$/i,
];

/**
 * Harmful/dangerous patterns - immediate block
 */
const HARMFUL_PATTERNS: RegExp[] = [
  // Self-harm & violence
  /(thuốc|cách)\s*(độc|chết|tự tử|suicide)/i,
  /cách\s*(giết|hại|đầu độc|murder)/i,
  /(tự|self)\s*(harm|hại|cắt|rạch)/i,

  // Hacking & exploits
  /\b(hack|crack|exploit|bypass)\s*(password|mật khẩu|system|hệ thống)/i,
  /(sql injection|xss|ddos|brute force)/i,
  /(phishing|ransomware|malware|virus)/i,

  // Unauthorized access
  /truy cập\s*(trái phép|admin|root|database)/i,
  /(password|mật khẩu)\s*(admin|root|database|server)/i,

  // Weapons & drugs
  /(làm|chế tạo)\s*(bom|thuốc nổ|explosive|weapon)/i,
  /(ma túy|drug|cocaine|heroin|meth)/i,

  // Data theft
  /(lấy|đánh cắp|steal)\s*(thông tin|data|dữ liệu)\s*(bệnh nhân|patient)/i,
  /leak\s*(data|database|thông tin)/i,
];

/**
 * Prompt injection patterns
 */
const INJECTION_PATTERNS: RegExp[] = [
  /ignore\s*(previous|above|all|prior)\s*(instructions?|prompts?|rules?)/i,
  /bỏ qua\s*(hướng dẫn|quy tắc|lệnh)/i,
  /disregard\s*(everything|all|the)/i,
  /system\s*prompt/i,
  /(show|print|display|reveal)\s*(your|the)\s*(prompt|instructions?)/i,
  /\bDAN\b/i,
  /\bjailbreak/i,
  /(pretend|act|behave)\s*(like|as)\s*(you are|a)/i,
  /giả vờ\s*(là|như|làm)/i,
  /you are now|bây giờ bạn là/i,
  /from now on|từ giờ/i,
  /\[INST\]|\[\/INST\]/i,
  /<<SYS>>|<<\/SYS>>/i,
  /<\|im_start\|>|<\|im_end\|>/i,
  /### (Human|Assistant|System):/i,
  /developer\s*mode/i,
  /enable\s*(debug|admin|god)\s*mode/i,
];

/**
 * Business-related keywords for intent detection
 */
const BUSINESS_KEYWORDS: string[] = [
  // Hospital terms
  'bệnh viện', 'khoa', 'phòng', 'bệnh nhân', 'patient', 'bác sĩ', 'doctor',
  'y tá', 'nurse', 'giường', 'bed', 'khám', 'examination', 'điều trị',
  // Reports & data
  'báo cáo', 'report', 'thống kê', 'statistic', 'dashboard', 'biểu đồ',
  'doanh thu', 'revenue', 'công suất', 'capacity',
  // Medical records
  'hsba', 'hồ sơ', 'bệnh án', 'medical record', 'bhyt', 'viện phí',
  // Equipment
  'thiết bị', 'equipment', 'máy móc', 'device', 'catalog', 'qr',
  // Navigation
  'màn hình', 'trang', 'mở', 'xem', 'chuyển', 'vào', 'đi tới', 'navigate',
  'open', 'show', 'go to',
  // Settings
  'cài đặt', 'settings', 'mật khẩu', 'password', 'đổi pass', 'tài khoản',
  // Theme
  'giao diện', 'theme', 'sáng', 'tối', 'dark', 'light', 'mode',
  // CLS
  'cls', 'cận lâm sàng', 'tầng 3', 'tầng 6', 'chuyên khoa',
];

/**
 * Allowed tool names whitelist
 */
const ALLOWED_TOOLS = ['navigate_to_screen', 'navigate', 'change_theme', 'toggle_theme'] as const;
type AllowedToolName = (typeof ALLOWED_TOOLS)[number];

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
  private readonly MODEL_NAME = 'qwen3-vl:4b-instruct';

  // ===== SESSION SETTINGS =====
  private readonly SESSION_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes
  private readonly THEME_COOLDOWN_MS = 1000;

  // ===== CONTEXT SETTINGS =====
  private readonly MAX_CONTEXT_TOKENS = 8192;
  private readonly MAX_HISTORY_MESSAGES = 6;
  private readonly MAX_OUTPUT_TOKENS = 2048;
  private readonly TOOL_BUDGET_TOKENS = 300;
  private readonly BUFFER_TOKENS = 100;
  private readonly AVG_CHARS_PER_TOKEN = 3.0;

  // ===== SAMPLING PARAMETERS =====
  private readonly SAMPLING_CONFIG = {
    temperature: 0.3, // Lower for more consistent, professional responses
    top_p: 0.85,
    top_k: 20,
    repeat_penalty: 1.15,
    presence_penalty: 0.1,
  };

  // ===== PERFORMANCE SETTINGS =====
  private readonly UI_UPDATE_DEBOUNCE_MS = 30;
  private readonly MAX_RETRIES = 2;
  private readonly RETRY_DELAY_MS = 800;
  private readonly CONNECT_TIMEOUT_MS = 30000;

  // ===== INPUT/OUTPUT LIMITS =====
  private readonly MAX_INPUT_LENGTH = 500;
  private readonly MAX_OUTPUT_LENGTH = 2000;
  private readonly MAX_TOOL_ARGS_LENGTH = 200;

  // ===== RATE LIMITING =====
  private readonly RATE_LIMIT_MAX_MESSAGES = 15;
  private readonly RATE_LIMIT_WINDOW_MS = 60_000;
  private readonly RATE_LIMIT_COOLDOWN_MS = 10_000;
  private messageTimestamps: number[] = [];
  private rateLimitCooldownUntil = 0;

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
  private cachedAllowedRoutes: RouteInfo[] | null = null;
  private cachedToolDefinitions: unknown[] | null = null;
  private cachedSystemPrompt = '';
  private systemPromptTokens = 0;
  private lastUserPermissionsHash = '';
  private routeEnumCache: string[] | null = null;

  // ===== DEBOUNCED UI UPDATES =====
  private readonly streamUpdate$ = new Subject<StreamUpdate>();

  constructor() {
    effect(() => {
      if (!this.authService.isLoggedIn()) {
        this.cleanup();
      }
    });

    this.streamUpdate$
      .pipe(debounceTime(this.UI_UPDATE_DEBOUNCE_MS), takeUntilDestroyed(this.destroyRef))
      .subscribe((update) => {
        this.ngZone.run(() => this.applyStreamUpdate(update));
      });

    this.destroyRef.onDestroy(() => this.cleanup());
  }

  // ============================================================================
  // PUBLIC API
  // ============================================================================

  /**
   * Toggle the chat panel
   */
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

  /**
   * Send a message to the assistant
   */
  public async sendMessage(content: string): Promise<void> {
    const sanitized = this.sanitizeInput(content);
    if (!sanitized) return;

    const rateLimitResult = this.checkRateLimit();
    if (!rateLimitResult.allowed) {
      this.addAssistantMessage(rateLimitResult.message!);
      return;
    }

    const classification = this.classifyUserIntent(sanitized);

    // Harmful content - immediate block
    if (classification.type === 'harmful') {
      console.warn('[LLM] Blocked harmful content');
      this.messages.update((msgs) => [
        ...msgs,
        this.createMessage('user', sanitized),
        this.createMessage('assistant', classification.suggestedResponse!),
      ]);
      return;
    }

    // Blocked topics - polite decline
    if (classification.type === 'blocked_topic') {
      this.messages.update((msgs) => [
        ...msgs,
        this.createMessage('user', sanitized),
        this.createMessage('assistant', classification.suggestedResponse!),
      ]);
      return;
    }

    // Simple greetings/acknowledgments - respond directly
    if (
      (classification.type === 'greeting' || classification.type === 'acknowledgment') &&
      classification.suggestedResponse
    ) {
      this.messages.update((msgs) => [
        ...msgs,
        this.createMessage('user', sanitized),
        this.createMessage('assistant', classification.suggestedResponse!),
      ]);
      return;
    }

    // Continue with LLM processing
    this.resetSessionTimeout();
    this.abortCurrentRequest();

    const newMsgTokens = this.estimateTokens(sanitized);

    this.messages.update((msgs) => [...msgs, this.createMessage('user', sanitized, newMsgTokens)]);

    // Check for ambiguous navigation
    const disambiguationMsg = this.checkAmbiguousNavigation(sanitized);
    if (disambiguationMsg) {
      this.messages.update((msgs) => [...msgs, this.createMessage('assistant', disambiguationMsg)]);
      return;
    }

    // Add placeholder for response
    this.messages.update((msgs) => [...msgs, this.createMessage('assistant', '', 0)]);

    this.isGenerating.set(true);

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

  /**
   * Stop current generation
   */
  public stopGeneration(): void {
    this.abortCurrentRequest();
    this.isGenerating.set(false);
  }

  /**
   * Reset chat to initial state
   */
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

  /**
   * Load/initialize the AI model
   */
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
      console.error('[LLM] Connection Error:', error);
      this.loadProgress.set('Không thể kết nối máy chủ AI');
    } finally {
      this.isModelLoading.set(false);
    }
  }

  // ============================================================================
  // INTENT CLASSIFICATION
  // ============================================================================

  /**
   * Classify user intent for routing
   */
  private classifyUserIntent(message: string): MessageClassification {
    const normalized = message.toLowerCase().trim();

    // Priority 1: Prompt injection
    if (this.matchesPatterns(normalized, INJECTION_PATTERNS)) {
      return {
        type: 'harmful',
        confidence: 1.0,
        blockedReason: 'prompt_injection',
        suggestedResponse: 'Yêu cầu không hợp lệ.',
      };
    }

    // Priority 2: Harmful content
    if (this.matchesPatterns(normalized, HARMFUL_PATTERNS)) {
      return {
        type: 'harmful',
        confidence: 1.0,
        blockedReason: 'harmful_content',
        suggestedResponse:
          'Không thể xử lý yêu cầu này. Nếu cần hỗ trợ khẩn cấp, vui lòng liên hệ IT Helpdesk (1108/1109).',
      };
    }

    // Priority 3: Blocked topics
    if (this.matchesPatterns(normalized, BLOCKED_TOPIC_PATTERNS)) {
      return {
        type: 'blocked_topic',
        confidence: 0.9,
        blockedReason: 'off_topic',
        suggestedResponse:
          'Nội dung này nằm ngoài phạm vi hỗ trợ. Tôi có thể giúp điều hướng hệ thống hoặc đổi giao diện. Cần hỗ trợ kỹ thuật khác vui lòng liên hệ IT Helpdesk (1108/1109).',
      };
    }

    // Priority 4: Simple greetings (short messages only)
    if (normalized.length < 50) {
      const greetingResponse = this.getGreetingResponse(normalized);
      if (greetingResponse) {
        return {
          type: 'greeting',
          confidence: 0.95,
          suggestedResponse: greetingResponse,
        };
      }

      const ackResponse = this.getAcknowledgmentResponse(normalized);
      if (ackResponse) {
        return {
          type: 'acknowledgment',
          confidence: 0.95,
          suggestedResponse: ackResponse,
        };
      }
    }

    // Priority 5: Business intent
    if (this.detectToolIntent(message) || this.hasBusinessKeywords(normalized)) {
      return {
        type: 'business_intent',
        confidence: 0.85,
      };
    }

    // Priority 6: Long messages without business keywords
    if (normalized.length > 150 && !this.hasBusinessKeywords(normalized)) {
      return {
        type: 'blocked_topic',
        confidence: 0.7,
        blockedReason: 'too_broad',
        suggestedResponse:
          'Câu hỏi này nằm ngoài phạm vi hỗ trợ. Tôi có thể giúp điều hướng các màn hình trong hệ thống. Bạn cần mở trang nào?',
      };
    }

    return { type: 'unknown', confidence: 0.5 };
  }

  /**
   * Get response for greetings - professional tone
   */
  private getGreetingResponse(normalized: string): string | null {
    // Greetings
    if (/^(xin\s*)?(chào|hello|hi|hey|ê|ơi|alo)(\s+bạn)?[!.?]*$/i.test(normalized)) {
      return 'Xin chào. Tôi có thể hỗ trợ gì?';
    }

    if (/^good\s*(morning|afternoon|evening)[!.?]*$/i.test(normalized)) {
      return 'Xin chào. Tôi có thể hỗ trợ gì?';
    }

    if (/^(chào buổi)\s*(sáng|chiều|tối)[!.?]*$/i.test(normalized)) {
      return 'Xin chào. Tôi có thể hỗ trợ gì?';
    }

    // Identity questions
    if (/^(bạn là ai|ai vậy|bạn tên gì)[?]*$/i.test(normalized)) {
      return 'Tôi là Trợ lý IT của Bệnh viện Hoàn Mỹ. Tôi hỗ trợ điều hướng hệ thống và đổi giao diện.';
    }

    // Capability questions
    if (/^(bạn (làm|giúp) (được )?gì|bạn có thể làm gì|help)[?]*$/i.test(normalized)) {
      return 'Tôi có thể hỗ trợ:\n• Điều hướng đến các màn hình (báo cáo, cài đặt, thiết bị...)\n• Đổi giao diện sáng/tối\n\nBạn cần gì?';
    }

    if (/^(hướng dẫn|chỉ|hướng)(\s+tôi|\s+mình)?[?]*$/i.test(normalized)) {
      return 'Tôi có thể hỗ trợ:\n• Điều hướng đến các màn hình (báo cáo, cài đặt, thiết bị...)\n• Đổi giao diện sáng/tối\n\nBạn cần gì?';
    }

    return null;
  }

  /**
   * Get response for acknowledgments - brief and professional
   */
  private getAcknowledgmentResponse(normalized: string): string | null {
    // Thanks
    if (/^(cảm ơn|cám ơn|thanks?|thank you|tks)[!.?]*$/i.test(normalized)) {
      return 'Không có gì. Cần hỗ trợ thêm cứ hỏi.';
    }

    // OK/Acknowledgment
    if (/^(ok|okay|oke|ô kê|được|vâng|dạ|ừ|rồi|hiểu rồi|đã hiểu|got it)[!.]*$/i.test(normalized)) {
      return 'Cần hỗ trợ gì thêm cứ hỏi.';
    }

    // Simple no
    if (/^(không|no|ko|k|nope|không cần|no need)[!.]*$/i.test(normalized)) {
      return 'Được rồi.';
    }

    // Farewells
    if (/^(tạm biệt|bye|goodbye|bai|gặp lại)[!.?]*$/i.test(normalized)) {
      return 'Tạm biệt.';
    }

    return null;
  }

  /**
   * Check if text matches any patterns
   */
  private matchesPatterns(text: string, patterns: RegExp[]): boolean {
    return patterns.some((pattern) => pattern.test(text));
  }

  /**
   * Check if text contains business keywords
   */
  private hasBusinessKeywords(text: string): boolean {
    const lowerText = text.toLowerCase();
    return BUSINESS_KEYWORDS.some((kw) => lowerText.includes(kw));
  }

  // ============================================================================
  // RATE LIMITING
  // ============================================================================

  /**
   * Check rate limit
   */
  private checkRateLimit(): { allowed: boolean; message?: string } {
    const now = Date.now();

    if (now < this.rateLimitCooldownUntil) {
      const remainingSeconds = Math.ceil((this.rateLimitCooldownUntil - now) / 1000);
      return {
        allowed: false,
        message: `Vui lòng chờ ${remainingSeconds} giây.`,
      };
    }

    this.messageTimestamps = this.messageTimestamps.filter(
      (ts) => now - ts < this.RATE_LIMIT_WINDOW_MS
    );

    if (this.messageTimestamps.length >= this.RATE_LIMIT_MAX_MESSAGES) {
      this.rateLimitCooldownUntil = now + this.RATE_LIMIT_COOLDOWN_MS;
      return {
        allowed: false,
        message: 'Đã đạt giới hạn tin nhắn. Vui lòng chờ một chút.',
      };
    }

    this.messageTimestamps.push(now);
    return { allowed: true };
  }

  // ============================================================================
  // INPUT/OUTPUT SANITIZATION
  // ============================================================================

  /**
   * Sanitize user input
   */
  private sanitizeInput(content: string): string {
    if (!content) return '';

    let result = content.trim();

    if (result.length > this.MAX_INPUT_LENGTH) {
      result = result.slice(0, this.MAX_INPUT_LENGTH);
    }

    // Remove control characters
    result = result.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

    // Normalize whitespace
    result = result.replace(/[ \t]+/g, ' ');
    result = result.replace(/\n{3,}/g, '\n\n');

    // Remove code blocks
    result = result.replace(/```[\s\S]*?```/g, '');

    // Remove HTML/XML tags
    result = result.replace(/<[^>]+>/g, '');

    // Remove instruction markers
    result = result
      .replace(/\[INST\]|\[\/INST\]/gi, '')
      .replace(/<<SYS>>|<<\/SYS>>/gi, '')
      .replace(/<\|im_start\|>|<\|im_end\|>/gi, '')
      .replace(/### (Human|Assistant|System):/gi, '');

    return result.trim();
  }

  /**
   * Sanitize model output
   */
  private sanitizeModelOutput(content: string): string {
    if (!content) return '';

    let result = content;

    // Remove leaked system prompt fragments
    const leakPatterns = [
      /QUY TẮC BẤT KHẢ XÂM PHẠM[\s\S]*?(?=\n\n|$)/gi,
      /HƯỚNG DẪN XỬ LÝ[\s\S]*?(?=\n\n|$)/gi,
      /DANH SÁCH MÀN HÌNH[\s\S]*$/gi,
      /\/no_think/gi,
      /BẮT BUỘC SỬ DỤNG[\s\S]*?(?=\n|$)/gi,
      /navigate_to_screen\s+[\/\w\-]+/gi,
      /change_theme\s+(dark|light|toggle)/gi,
    ];

    for (const pattern of leakPatterns) {
      result = result.replace(pattern, '');
    }

    // Remove external URLs
    result = result.replace(/https?:\/\/(?!localhost|127\.0\.0\.1)[^\s<>]+/gi, '');

    // Remove JSON tool call remnants
    result = result.replace(
      /\{\s*"name"\s*:\s*"[^"]+"\s*,\s*"(?:arguments|parameters)"\s*:\s*\{[^}]*\}\s*\}/gi,
      ''
    );

    if (result.length > this.MAX_OUTPUT_LENGTH) {
      result = result.substring(0, this.MAX_OUTPUT_LENGTH) + '...';
    }

    result = result.replace(/\n{3,}/g, '\n\n');

    return result.trim();
  }

  /**
   * Clean response for display
   */
  private cleanResponseForDisplay(text: string): string {
    if (!text) return '';

    let result = text;

    // Remove tool call blocks
    result = result.replace(/<tool_call>[\s\S]*?<\/tool_call>/gi, '');
    result = result.replace(
      /```json\s*\{[^`]*"name"\s*:[^`]*(?:"arguments"|"parameters")\s*:[^`]*\}\s*```/gi,
      ''
    );
    result = result.replace(/navigate_to_screen\s+[\/\w\-]+/gi, '');
    result = result.replace(/change_theme\s+(dark|light|toggle)/gi, '');
    result = result.replace(
      /\{\s*"name"\s*:\s*"[^"]+"\s*,\s*"(?:arguments|parameters)"\s*:\s*\{[^}]*\}\s*\}/gi,
      ''
    );

    // Remove thinking tags
    result = result.replace(/<think>[\s\S]*?<\/think>/gi, '');
    result = result.replace(/<think>[\s\S]*?$/gi, '');
    result = result.replace(/^[\s\S]*?<\/think>/gi, '');

    result = this.sanitizeModelOutput(result);

    return result.trim();
  }

  // ============================================================================
  // STREAMING LOGIC
  // ============================================================================

  /**
   * Stream response from LLM
   */
  private async streamResponse(userMessage: string): Promise<void> {
    this.currentAbortController = new AbortController();
    const { signal } = this.currentAbortController;

    const contextMessages = this.prepareContextWindow(userMessage);
    const systemPrompt = this.getDynamicSystemPrompt();

    const shouldEnableTools = this.detectToolIntent(userMessage);
    const tools = shouldEnableTools ? this.getToolDefinitions() : undefined;
    const outputTokens = this.getAdaptiveOutputTokens(userMessage, shouldEnableTools);

    const payload = {
      model: this.MODEL_NAME,
      messages: [
        { role: 'system', content: systemPrompt },
        ...contextMessages.map((m) => ({ role: m.role, content: m.content })),
        { role: 'user', content: userMessage },
      ],
      tools,
      stream: true,
      options: {
        ...this.SAMPLING_CONFIG,
        num_predict: outputTokens,
        num_ctx: this.MAX_CONTEXT_TOKENS,
        enable_thinking: false,
      },
    };

    const connectionTimeoutId = setTimeout(() => {
      this.currentAbortController?.abort();
    }, this.CONNECT_TIMEOUT_MS);

    try {
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
        console.log('[LLM] Request aborted');
        throw err;
      }
      throw err;
    } finally {
      clearTimeout(connectionTimeoutId);
    }
  }

  /**
   * Detect if message requires tool usage
   */
  private detectToolIntent(message: string): boolean {
    const normalized = message.toLowerCase();

    const navKeywords = [
      'mở',
      'xem',
      'chuyển',
      'vào',
      'đi tới',
      'đi đến',
      'navigate',
      'open',
      'go',
      'show',
      'hiển thị',
      'đưa tôi đến',
    ];

    const themeKeywords = [
      'theme',
      'giao diện',
      'màu',
      'sáng',
      'tối',
      'dark',
      'light',
      'mode',
      'bật',
      'tắt',
      'đổi',
      'change',
      'switch',
    ];

    const locationKeywords = ['ở đâu', 'chỗ nào', 'làm sao', 'như thế nào', 'cách', 'where', 'how'];

    const taskKeywords = [
      'password',
      'pass',
      'mật khẩu',
      'đổi pass',
      'đổi mật khẩu',
      'báo cáo',
      'report',
      'thống kê',
      'hsba',
      'khám',
      'bệnh nhân',
      'cài đặt',
      'settings',
      'thiết bị',
      'danh sách',
      'tài khoản',
      'account',
    ];

    if (navKeywords.some((kw) => normalized.includes(kw))) return true;
    if (themeKeywords.some((kw) => normalized.includes(kw))) return true;
    if (locationKeywords.some((kw) => normalized.includes(kw))) return true;
    if (taskKeywords.some((kw) => normalized.includes(kw))) return true;

    const screenKeywords = Object.values(SCREEN_CONFIG).flatMap((c) => c.keywords);
    const meaningfulKeywords = screenKeywords.filter((k) => k.length > 3);
    if (meaningfulKeywords.some((kw) => normalized.includes(kw))) return true;

    return false;
  }

  /**
   * Process streaming response
   */
  private async processStream(
    body: ReadableStream<Uint8Array>,
    signal: AbortSignal
  ): Promise<void> {
    return this.ngZone.runOutsideAngular(async () => {
      const reader = body.getReader();
      const decoder = new TextDecoder();

      let fullContent = '';
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

              if (json.message?.thinking && !json.message?.content) {
                continue;
              }

              if (json.message?.content) {
                const cleanPart = json.message.content
                  .replace(/<think>[\s\S]*?<\/think>/gi, '')
                  .replace(/<think>[\s\S]*?$/gi, '')
                  .replace(/^[\s\S]*?<\/think>/gi, '');

                if (cleanPart) {
                  fullContent += cleanPart;
                }
              }

              if (Array.isArray(json.message?.tool_calls)) {
                for (const tc of json.message.tool_calls) {
                  const isDuplicate = detectedToolCalls.some(
                    (existing) => existing.name === tc.function?.name
                  );

                  if (tc.function?.name && !isDuplicate) {
                    if (this.isValidToolName(tc.function.name)) {
                      detectedToolCalls.push({
                        name: tc.function.name,
                        arguments: tc.function.arguments || {},
                      });
                    }
                  }
                }
              }

              if (fullContent.trim()) {
                const displayContent = this.cleanResponseForDisplay(fullContent);

                this.streamUpdate$.next({
                  content: displayContent,
                  thinking: undefined,
                  tokenEstimate: this.estimateTokens(displayContent),
                  toolCalls: detectedToolCalls.length > 0 ? [...detectedToolCalls] : undefined,
                  isThinking: false,
                });
              }

              if (json.done === true) break;
            } catch {
              continue;
            }
          }
        }

        // Handle remaining buffer
        if (buffer.trim()) {
          try {
            const json = JSON.parse(buffer);
            if (json.message?.content) {
              const cleanPart = json.message.content
                .replace(/<think>[\s\S]*?<\/think>/gi, '')
                .replace(/<think>[\s\S]*?$/gi, '');
              if (cleanPart.trim()) {
                fullContent += cleanPart;
              }
            }
          } catch {
            // Ignore malformed
          }
        }
      } catch (streamError) {
        if (signal.aborted) return;
        console.error('[LLM] Stream error:', streamError);
        throw streamError;
      } finally {
        reader.releaseLock();

        // Fallback: extract text-based tool calls
        if (detectedToolCalls.length === 0) {
          const hasToolPattern =
            fullContent.includes('<tool_call>') ||
            /navigate_to_screen\s+/i.test(fullContent) ||
            /change_theme\s+(dark|light|toggle)/i.test(fullContent);

          if (hasToolPattern) {
            const textToolCall = this.extractToolCallFromText(fullContent);
            if (textToolCall && this.isValidToolName(textToolCall.name)) {
              detectedToolCalls.push(textToolCall);
            }
          }
        }

        // Execute tools
        if (detectedToolCalls.length > 0) {
          await this.ngZone.run(async () => {
            await this.executeToolCalls(detectedToolCalls);
          });
        }

        // Final UI update
        const finalContent = this.cleanResponseForDisplay(fullContent);
        this.streamUpdate$.next({
          content: finalContent,
          thinking: undefined,
          tokenEstimate: this.estimateTokens(finalContent),
          toolCalls: detectedToolCalls.length > 0 ? detectedToolCalls : undefined,
          isThinking: false,
        });
      }
    });
  }

  /**
   * Extract tool call from text format
   */
  private extractToolCallFromText(text: string): ToolCall | null {
    try {
      // Format 1: <tool_call>JSON</tool_call>
      const hermesMatch = text.match(
        /<tool_call>\s*(\{[\s\S]*?"name"[\s\S]*?"arguments"[\s\S]*?\})\s*<\/tool_call>/i
      );
      if (hermesMatch) {
        const parsed = JSON.parse(hermesMatch[1]);
        if (parsed.name && parsed.arguments) {
          return { name: parsed.name, arguments: parsed.arguments };
        }
      }

      // Format 2: Inline JSON
      const jsonMatch = text.match(
        /\{\s*"name"\s*:\s*"([^"]+)"\s*,\s*"(?:arguments|parameters)"\s*:\s*(\{[^}]*\})\s*\}/i
      );
      if (jsonMatch) {
        return { name: jsonMatch[1], arguments: JSON.parse(jsonMatch[2]) };
      }

      // Format 3: Plain text navigation
      const plainNavMatch = text.match(/navigate_to_screen\s+[\/]?(?:app[\/])?([^\s\n]+)/i);
      if (plainNavMatch) {
        let path = plainNavMatch[1].trim();
        if (!path.startsWith('/')) {
          path = '/app/' + path;
        }
        return { name: 'navigate_to_screen', arguments: { path } };
      }

      // Format 4: Plain text theme
      const plainThemeMatch = text.match(/change_theme\s+(dark|light|toggle)/i);
      if (plainThemeMatch) {
        return { name: 'change_theme', arguments: { mode: plainThemeMatch[1].toLowerCase() } };
      }
    } catch (e) {
      console.warn('[LLM] Tool call parse error:', e);
    }
    return null;
  }

  // ============================================================================
  // TOOL EXECUTION
  // ============================================================================

  /**
   * Validate tool name
   */
  private isValidToolName(name: string): name is AllowedToolName {
    return ALLOWED_TOOLS.includes(name as AllowedToolName);
  }

  /**
   * Validate tool arguments
   */
  private validateToolArguments(args: Record<string, unknown>): boolean {
    const argsStr = JSON.stringify(args);

    if (argsStr.length > this.MAX_TOOL_ARGS_LENGTH) {
      console.warn('[LLM] Tool arguments too long');
      return false;
    }

    const checkValue = (value: unknown): boolean => {
      if (typeof value === 'string') {
        if (/<script|javascript:|on\w+=/i.test(value)) return false;
        if (/\.\.\/|\.\.\\/.test(value)) return false;
      } else if (typeof value === 'object' && value !== null) {
        return Object.values(value).every(checkValue);
      }
      return true;
    };

    return Object.values(args).every(checkValue);
  }

  /**
   * Execute validated tool calls
   */
  private async executeToolCalls(toolCalls: ToolCall[]): Promise<void> {
    const limitedCalls = toolCalls.slice(0, 3);

    for (const call of limitedCalls) {
      if (!this.isValidToolName(call.name)) {
        console.warn('[LLM] Blocked invalid tool:', call.name);
        continue;
      }

      if (!this.validateToolArguments(call.arguments)) {
        console.warn('[LLM] Blocked invalid tool arguments');
        this.setLastAssistantMessage('Không thể thực hiện do tham số không hợp lệ.');
        continue;
      }

      try {
        const result = await this.executeTool(call.name, call.arguments);

        this.messages.update((msgs) => [
          ...msgs,
          this.createMessage(
            'tool',
            JSON.stringify({ success: result.success, message: result.data }),
            0,
            call.name
          ),
        ]);

        const confirmation = this.getToolConfirmation(call.name, call.arguments, result);
        if (confirmation) {
          this.setLastAssistantMessage(confirmation);
        }
      } catch (error) {
        console.error(`[LLM] Tool execution failed for ${call.name}:`, error);
        const errorMsg = this.getToolErrorMessage(call.name);

        this.messages.update((msgs) => [
          ...msgs,
          this.createMessage('tool', JSON.stringify({ error: errorMsg }), 0, call.name),
        ]);

        this.setLastAssistantMessage(errorMsg);
      }
    }
  }

  /**
   * Execute a single tool
   */
  private async executeTool(
    name: AllowedToolName,
    args: Record<string, unknown>
  ): Promise<ToolResult> {
    switch (name) {
      case 'navigate_to_screen':
      case 'navigate': {
        const path = (args['path'] || args['screen'] || args['url']) as string;
        if (!path || typeof path !== 'string') {
          return { success: false, error: 'Đường dẫn không hợp lệ' };
        }
        return this.triggerNavigation(path);
      }

      case 'change_theme':
      case 'toggle_theme': {
        const mode = (args['mode'] || args['theme'] || 'toggle') as string;
        return this.triggerThemeAction(mode);
      }

      default:
        return { success: false, error: 'Chức năng không hỗ trợ' };
    }
  }

  /**
   * Get confirmation message for tool execution - professional tone
   */
  private getToolConfirmation(
    name: string,
    args: Record<string, unknown>,
    result: ToolResult
  ): string {
    if (!result.success) {
      return result.error || 'Không thể thực hiện.';
    }

    switch (name) {
      case 'navigate_to_screen':
      case 'navigate': {
        const screenName = result.data || 'màn hình';
        const path = (args['path'] || '') as string;

        if (path.includes('settings')) {
          return `Đang mở **${screenName}**. Bạn có thể đổi mật khẩu tại đây.`;
        }
        return `Đang mở **${screenName}**...`;
      }

      case 'change_theme':
      case 'toggle_theme': {
        const currentMode = result.data || '';
        if (currentMode.includes('tối')) {
          return 'Đã chuyển sang giao diện tối.';
        }
        if (currentMode.includes('sáng')) {
          return 'Đã chuyển sang giao diện sáng.';
        }
        return 'Đã đổi giao diện.';
      }

      default:
        return '';
    }
  }

  /**
   * Get error message for failed tool
   */
  private getToolErrorMessage(name: string): string {
    switch (name) {
      case 'navigate_to_screen':
      case 'navigate':
        return 'Không thể mở trang này. Có thể bạn không có quyền truy cập.';

      case 'change_theme':
      case 'toggle_theme':
        return 'Không thể đổi giao diện. Vui lòng thử lại.';

      default:
        return 'Không thể thực hiện thao tác này.';
    }
  }

  /**
   * Set/replace last assistant message
   */
  private setLastAssistantMessage(text: string): void {
    this.messages.update((msgs) => {
      const newMsgs = [...msgs];

      let lastAssistantIdx = -1;
      for (let i = newMsgs.length - 1; i >= 0; i--) {
        if (newMsgs[i].role === 'assistant') {
          lastAssistantIdx = i;
          break;
        }
      }

      if (lastAssistantIdx >= 0) {
        newMsgs[lastAssistantIdx] = {
          ...newMsgs[lastAssistantIdx],
          content: text,
          toolCalls: newMsgs[lastAssistantIdx].toolCalls,
        };
      }
      return newMsgs;
    });
  }

  /**
   * Apply stream update to UI
   */
  private applyStreamUpdate(update: StreamUpdate): void {
    this.messages.update((msgs) => {
      const newMsgs = [...msgs];
      const lastIdx = newMsgs.length - 1;

      if (lastIdx >= 0 && newMsgs[lastIdx].role === 'assistant') {
        newMsgs[lastIdx] = {
          ...newMsgs[lastIdx],
          content: update.content,
          thinking: undefined,
          tokenEstimate: update.tokenEstimate,
          toolCalls: update.toolCalls,
          isThinking: update.isThinking,
        };
      }
      return newMsgs;
    });
  }

  /**
   * Clean up empty response placeholder
   */
  private cleanupEmptyResponse(): void {
    this.messages.update((msgs) => {
      const newMsgs = [...msgs];
      const lastIdx = newMsgs.length - 1;

      if (lastIdx >= 0 && newMsgs[lastIdx].role === 'assistant') {
        const content = newMsgs[lastIdx].content.trim();
        const thinking = newMsgs[lastIdx].thinking?.trim();

        if (!content && !thinking) {
          const hasToolCalls =
            newMsgs[lastIdx].toolCalls && newMsgs[lastIdx].toolCalls!.length > 0;

          if (!hasToolCalls) {
            newMsgs[lastIdx] = {
              ...newMsgs[lastIdx],
              content: 'Có lỗi xảy ra. Vui lòng thử lại.',
            };
          }
        }
      }
      return newMsgs;
    });
  }

  // ============================================================================
  // NAVIGATION & THEME
  // ============================================================================

  /**
   * Navigate to a screen
   */
  private triggerNavigation(path: string): ToolResult {
    if (this.isNavigating() || this.router.url === path) {
      return { success: true, data: 'Trang hiện tại' };
    }

    const allowedRoutes = this.getAllowedRoutes();
    const route = allowedRoutes.find(
      (r) =>
        r.fullUrl === path ||
        r.purePath === path ||
        path.endsWith(r.purePath) ||
        r.fullUrl.endsWith(path)
    );

    if (!route) {
      console.warn('[LLM] Navigation blocked:', path);
      return { success: false, error: 'Không có quyền truy cập trang này.' };
    }

    this.isNavigating.set(true);
    const targetUrl = route.fullUrl;

    setTimeout(() => {
      this.router.navigateByUrl(targetUrl).finally(() => {
        setTimeout(() => this.isNavigating.set(false), 500);
      });
    }, 800);

    return { success: true, data: route.title };
  }

  /**
   * Change theme
   */
  private triggerThemeAction(action: string): ToolResult {
    const now = Date.now();
    if (now - this.lastThemeChange < this.THEME_COOLDOWN_MS) {
      const currentMode = this.themeService.isDarkTheme() ? 'Giao diện tối' : 'Giao diện sáng';
      return { success: true, data: currentMode };
    }
    this.lastThemeChange = now;

    const isDark = this.themeService.isDarkTheme();
    const mode = action.toLowerCase();

    if ((mode === 'dark' && !isDark) || (mode === 'light' && isDark) || mode === 'toggle') {
      this.themeService.toggleTheme();
    }

    const newMode = this.themeService.isDarkTheme() ? 'Giao diện tối' : 'Giao diện sáng';
    return { success: true, data: newMode };
  }

  // ============================================================================
  // ROUTES & PERMISSIONS
  // ============================================================================

  /**
   * Get allowed routes for user
   */
  private getAllowedRoutes(): RouteInfo[] {
    if (!this.cachedAllowedRoutes) {
      this.cachedAllowedRoutes = this.scanRoutes(this.router.config);
    }
    return this.cachedAllowedRoutes;
  }

  /**
   * Recursively scan routes
   */
  private scanRoutes(routes: Routes, parentPath = ''): RouteInfo[] {
    const results: RouteInfo[] = [];

    for (const route of routes) {
      if (route.redirectTo || route.path === '**') continue;

      const pathPart = route.path || '';
      const fullPath = parentPath ? `${parentPath}/${pathPart}` : `/${pathPart}`;
      const purePath = fullPath.startsWith('/app/') ? fullPath.substring(5) : fullPath.substring(1);

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

  /**
   * Check route permission
   */
  private checkRoutePermission(route: Route): boolean {
    const requiredPerm = route.data?.['permission'] as string | undefined;
    if (!requiredPerm) return true;

    const user = this.authService.currentUser();
    return user?.permissions?.some((p) => p.startsWith(requiredPerm)) ?? false;
  }

  // ============================================================================
  // DISAMBIGUATION
  // ============================================================================

  /**
   * Check for ambiguous navigation
   */
  private checkAmbiguousNavigation(userMessage: string): string | null {
    const lowerMsg = userMessage.toLowerCase().trim();

    const navKeywords = ['mở', 'chuyển', 'đi', 'vào', 'xem', 'open', 'go', 'navigate', 'show'];
    const hasNavKeyword = navKeywords.some((kw) => lowerMsg.includes(kw));

    if (!hasNavKeyword) return null;

    let query = lowerMsg;
    navKeywords.forEach((kw) => {
      query = query.replace(new RegExp(kw, 'g'), '').trim();
    });
    query = query
      .replace(/trang|màn hình|screen|page|báo cáo|report|cho tôi|giúp|đến/g, '')
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
      .map((m, i) => `${i + 1}. ${m.title}${m.description ? ` - ${m.description}` : ''}`)
      .join('\n');

    return `Tìm thấy ${matches.length} màn hình phù hợp:\n\n${options}\n\nBạn cần mở màn hình nào?`;
  }

  /**
   * Find matching screens
   */
  private findMatchingScreens(query: string): RouteInfo[] {
    const normalizedQuery = query.toLowerCase().trim();
    const queryWords = normalizedQuery.split(/\s+/).filter((w) => w.length > 1);
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
  // CONTEXT MANAGEMENT
  // ============================================================================

  /**
   * Prepare context window with history
   */
  private prepareContextWindow(newUserMessage: string): ChatMessage[] {
    const newMsgTokens = this.estimateTokens(newUserMessage);

    const availableForHistory =
      this.MAX_CONTEXT_TOKENS -
      this.systemPromptTokens -
      this.TOOL_BUDGET_TOKENS -
      this.MAX_OUTPUT_TOKENS -
      newMsgTokens -
      this.BUFFER_TOKENS;

    const history = this.messages()
      .filter((m) => m.content.trim() && m.role !== 'system' && m.role !== 'tool')
      .map((m) => {
        if (m.role === 'assistant') {
          const cleaned = this.cleanResponseForDisplay(m.content);
          return { ...m, content: this.truncateForHistory(cleaned, 150) };
        }
        return { ...m, content: this.truncateForHistory(m.content, 200) };
      })
      .filter((m) => m.content.trim());

    const result: ChatMessage[] = [];
    let usedTokens = 0;
    const maxHistoryMessages = Math.min(this.MAX_HISTORY_MESSAGES, 4);

    for (let i = history.length - 1; i >= 0 && result.length < maxHistoryMessages; i--) {
      const msg = history[i];
      const msgTokens = this.estimateTokens(msg.content);

      if (usedTokens + msgTokens > availableForHistory) break;

      usedTokens += msgTokens;
      result.unshift({ ...msg, tokenEstimate: msgTokens });
    }

    if (result.length > 0 && result[0].role === 'assistant') {
      result.shift();
    }

    const totalUsed = this.systemPromptTokens + this.TOOL_BUDGET_TOKENS + usedTokens + newMsgTokens;
    const usagePercent = Math.round((totalUsed / this.MAX_CONTEXT_TOKENS) * 100);
    this.contextUsage.set(Math.min(usagePercent, 100));

    return result;
  }

  /**
   * Truncate text for history
   */
  private truncateForHistory(text: string, maxChars: number): string {
    if (!text || text.length <= maxChars) return text;

    const truncated = text.substring(0, maxChars);
    const lastSpace = truncated.lastIndexOf(' ');
    if (lastSpace > maxChars * 0.7) {
      return truncated.substring(0, lastSpace) + '...';
    }
    return truncated + '...';
  }

  /**
   * Estimate token count
   */
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

  /**
   * Get adaptive output token limit
   */
  private getAdaptiveOutputTokens(message: string, hasToolIntent: boolean): number {
    const msgLen = message.length;

    if (hasToolIntent) return 256;
    if (msgLen < 30) return 128;
    if (msgLen < 100) return 512;

    return Math.min(this.MAX_OUTPUT_TOKENS, 1024);
  }

  // ============================================================================
  // SYSTEM PROMPT
  // ============================================================================

  /**
   * Generate dynamic system prompt - concise and professional
   */
  private getDynamicSystemPrompt(): string {
    const currentUser = this.authService.currentUser();
    const permissionsHash = JSON.stringify(currentUser?.permissions || []);

    if (permissionsHash !== this.lastUserPermissionsHash) {
      this.cachedSystemPrompt = '';
      this.cachedAllowedRoutes = null;
      this.cachedToolDefinitions = null;
      this.routeEnumCache = null;
      this.lastUserPermissionsHash = permissionsHash;
    }

    if (this.cachedSystemPrompt) {
      return this.cachedSystemPrompt;
    }

    const allowedRoutes = this.getAllowedRoutes();

    const routeList = allowedRoutes
      .slice(0, 10)
      .map((r) => `${r.purePath}:${r.title}`)
      .join('|');

    const prompt = `Trợ lý IT Bệnh viện Hoàn Mỹ.
PHẠM VI: Chỉ điều hướng màn hình + đổi theme. Không reset pass/sửa máy/truy cập DB.
HÀNH ĐỘNG: Dùng navigate_to_screen (đổi pass→settings) hoặc change_theme.
NGOÀI PHẠM VI: "Liên hệ IT Helpdesk 1108/1109"
ROUTES: ${routeList}
Trả lời ngắn gọn, chuyên nghiệp./no_think`;

    this.cachedSystemPrompt = prompt;
    this.systemPromptTokens = this.estimateTokens(prompt);

    return prompt;
  }

  // ============================================================================
  // TOOL DEFINITIONS
  // ============================================================================

  /**
   * Get tool definitions
   */
  private getToolDefinitions(): unknown[] {
    if (this.cachedToolDefinitions) {
      return this.cachedToolDefinitions;
    }

    const routeEnums = this.getRouteEnums();

    const tools = [
      {
        type: 'function',
        function: {
          name: 'navigate_to_screen',
          description: 'Mở màn hình/trang',
          parameters: {
            type: 'object',
            properties: {
              path: { type: 'string', enum: routeEnums },
            },
            required: ['path'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'change_theme',
          description: 'Đổi giao diện sáng/tối',
          parameters: {
            type: 'object',
            properties: {
              mode: { type: 'string', enum: ['light', 'dark', 'toggle'] },
            },
            required: ['mode'],
          },
        },
      },
    ];

    this.cachedToolDefinitions = tools;
    return tools;
  }

  /**
   * Get route enums
   */
  private getRouteEnums(): string[] {
    if (this.routeEnumCache) {
      return this.routeEnumCache;
    }

    this.routeEnumCache = this.getAllowedRoutes().map((r) => r.fullUrl);
    return this.routeEnumCache;
  }

  // ============================================================================
  // RETRY LOGIC
  // ============================================================================

  /**
   * Execute with retry
   */
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
          console.log(`[LLM] Retry attempt ${attempt + 1}/${this.MAX_RETRIES}`);
          await this.delay(this.RETRY_DELAY_MS * (attempt + 1));
        }
      }
    }

    throw lastError;
  }

  // ============================================================================
  // UTILITIES
  // ============================================================================

  /**
   * Add assistant message
   */
  private addAssistantMessage(content: string): void {
    this.messages.update((msgs) => [...msgs, this.createMessage('assistant', content)]);
  }

  /**
   * Create chat message
   */
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

  /**
   * Check server health
   */
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

  /**
   * Get base URL
   */
  private getBaseUrl(): string {
    try {
      const urlObj = new URL(this.apiUrl);
      return `${urlObj.protocol}//${urlObj.host}/`;
    } catch {
      return this.apiUrl;
    }
  }

  /**
   * Add greeting message - professional tone
   */
  private addGreetingMessage(): void {
    this.messages.update((msgs) => [
      ...msgs,
      this.createMessage(
        'assistant',
        'Xin chào. Tôi là Trợ lý IT của Bệnh viện Hoàn Mỹ. Tôi có thể hỗ trợ điều hướng hệ thống hoặc đổi giao diện.'
      ),
    ]);
  }

  /**
   * Handle errors
   */
  private handleError(error: unknown): void {
    const isAbort = error instanceof DOMException && error.name === 'AbortError';

    if (!isAbort) {
      console.error('[LLM] Error:', {
        name: error instanceof Error ? error.name : 'Unknown',
        message: error instanceof Error ? error.message : String(error),
        model: this.MODEL_NAME,
      });

      this.messages.update((msgs) => {
        const newMsgs = [...msgs];
        const lastIdx = newMsgs.length - 1;

        if (lastIdx >= 0 && newMsgs[lastIdx].role === 'assistant') {
          const errorMessage =
            error instanceof Error && error.message.includes('404')
              ? `Model "${this.MODEL_NAME}" không khả dụng. Liên hệ IT Helpdesk.`
              : 'Hệ thống đang bận. Vui lòng thử lại sau.';

          newMsgs[lastIdx] = { ...newMsgs[lastIdx], content: errorMessage };
        }
        return newMsgs;
      });
    }
  }

  /**
   * Abort current request
   */
  private abortCurrentRequest(): void {
    if (this.currentAbortController) {
      this.currentAbortController.abort();
      this.currentAbortController = null;
    }
  }

  /**
   * Full cleanup
   */
  private cleanup(): void {
    this.abortCurrentRequest();
    this.clearSessionTimeout();
    this.resetChat();
    this.isOpen.set(false);
    this.modelLoaded.set(false);

    this.cachedSystemPrompt = '';
    this.cachedAllowedRoutes = null;
    this.cachedToolDefinitions = null;
    this.routeEnumCache = null;
  }

  /**
   * Reset session timeout
   */
  private resetSessionTimeout(): void {
    this.clearSessionTimeout();
    this.sessionTimeout = setTimeout(() => {
      this.resetChat();
      this.isOpen.set(false);
    }, this.SESSION_TIMEOUT_MS);
  }

  /**
   * Clear session timeout
   */
  private clearSessionTimeout(): void {
    if (this.sessionTimeout) {
      clearTimeout(this.sessionTimeout);
      this.sessionTimeout = undefined;
    }
  }

  /**
   * Delay helper
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Generate message ID
   */
  private generateMessageId(): string {
    return `msg_${Date.now()}_${++this.messageIdCounter}`;
  }
}