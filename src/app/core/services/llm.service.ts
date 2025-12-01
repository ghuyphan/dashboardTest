import {
  Injectable,
  signal,
  inject,
  effect,
  DestroyRef,
  NgZone,
} from '@angular/core';
import { Router, Routes } from '@angular/router';
import { AuthService } from './auth.service';
import { ThemeService } from './theme.service';
import { environment } from '../../../environments/environment.development';

// ============================================================================
// INTERFACES
// ============================================================================

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp?: number;
}

interface RouteInfo {
  title: string;
  fullUrl: string;
  key: string; // Key dùng để đối chiếu với Proxy
  keywords?: string[];
}

// Cấu trúc phản hồi từ Proxy Server
interface ServerResponse {
  type?: 'text' | 'action';
  content?: string; // Dùng cho tin nhắn text (Quick reply, Blocklist)
  action?: 'nav' | 'theme'; // Dùng cho lệnh
  target?: string; // Đích đến cho nav
  mode?: string; // Mode cho theme
}

// ============================================================================
// CLIENT-SIDE ROUTE CONFIG
// (Logic mapping từ khóa sang màn hình thực tế)
// ============================================================================

const SCREEN_KEYWORDS: Record<string, string[]> = {
  home: ['home', 'trang chu', 'tong quan', 'main', 'dashboard'],
  settings: [
    'settings',
    'cai dat',
    'tai khoan',
    'mat khau',
    'password',
    'profile',
  ],
  'equipment/catalog': ['thiet bi', 'may moc', 'catalog', 'qr', 'ban giao'],
  'equipment/dashboard': ['thiet bi dashboard', 'bieu do thiet bi'],
  'reports/bed-usage': ['giuong', 'bed', 'cong suat'],
  'reports/examination-overview': ['kham', 'doanh thu', 'vien phi', 'bhyt'],
  'reports/missing-medical-records': ['hsba', 'ho so', 'benh an', 'thieu'],
  'reports/cls-level3': [
    'cls 3',
    'tang 3',
    'lau 3',
    'level 3',
    'xet nghiem 3',
    'cdha 3',
  ],
  'reports/cls-level6': [
    'cls 6',
    'tang 6',
    'lau 6',
    'level 6',
    'xet nghiem 6',
    'cdha 6',
  ],
  'reports/specialty-cls': ['chuyen khoa', 'specialty'],
};

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

  // URL trỏ tới Proxy Server (VD: http://localhost:3000/api/llm)
  private readonly apiUrl = environment.llmUrl;

  // Signals UI
  public readonly isOpen = signal(false);
  public readonly isGenerating = signal(false);
  public readonly messages = signal<ChatMessage[]>([]);
  public readonly isNavigating = signal(false);

  // State nội bộ
  private msgCounter = 0;
  private routeCache: RouteInfo[] | null = null;
  private abortCtrl: AbortController | null = null;
  private sessionTimer?: ReturnType<typeof setTimeout>;
  private readonly SESSION_TIMEOUT = 15 * 60 * 1000; // 15 phút

  constructor() {
    // Tự động dọn dẹp khi logout
    effect(() => {
      if (!this.authService.isLoggedIn()) this.cleanup();
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
      this.resetSessionTimer();
      if (this.messages().length === 0) this.addGreeting();
    } else {
      this.clearSessionTimer();
    }
  }

  public async sendMessage(content: string): Promise<void> {
    const input = content.trim();
    if (!input) return;

    this.resetSessionTimer();

    // 1. Thêm tin nhắn User
    this.messages.update((m) => [...m, this.createMsg('user', input)]);

    // 2. Thêm tin nhắn Assistant rỗng (placeholder để hiển thị loading/streaming)
    this.messages.update((m) => [...m, this.createMsg('assistant', '')]);
    this.isGenerating.set(true);

    this.abortCtrl = new AbortController();

    try {
      const token = this.authService.getAccessToken();
      if (!token) throw new Error('No auth token available');

      // 3. Chuẩn bị History (Lọc bỏ tin nhắn lỗi/system/placeholder cuối cùng)
      // Lấy tất cả tin nhắn trừ tin nhắn placeholder vừa thêm vào ở bước 2
      const historyContext = this.messages()
        .slice(0, -1)
        .filter((m) => m.role !== 'system')
        .slice(-6) // Chỉ lấy 6 tin nhắn gần nhất để tiết kiệm token
        .map((m) => ({ role: m.role, content: m.content }));

      // 4. Gửi request tới Proxy
      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          message: input,
          history: historyContext,
        }),
        signal: this.abortCtrl.signal,
      });

      if (!response.ok) {
        if (response.status === 401) throw new Error('Unauthorized');
        throw new Error(`Server Error ${response.status}`);
      }

      // 5. Xử lý phản hồi dựa trên Content-Type
      const contentType = response.headers.get('content-type');

      // TRƯỜNG HỢP A: JSON (Lệnh Action hoặc Text ngắn)
      if (contentType && contentType.includes('application/json')) {
        const data: ServerResponse = await response.json();
        await this.handleServerAction(data);
      }
      // TRƯỜNG HỢP B: Stream (LLM trả lời dài)
      else if (response.body) {
        await this.processStream(response.body);
      }
    } catch (e) {
      this.handleErr(e);
    } finally {
      this.isGenerating.set(false);
      this.abortCtrl = null;
      this.finalizeLastMsg(); // Đảm bảo tin nhắn cuối cùng sạch sẽ
    }
  }

  public stopGeneration(): void {
    this.abort();
    this.isGenerating.set(false);
    this.finalizeLastMsg();
  }

  public resetChat(): void {
    this.abort();
    this.messages.set([]);
    this.msgCounter = 0;
    if (this.isOpen() && this.authService.isLoggedIn()) {
      this.addGreeting();
    }
  }

  // ============================================================================
  // HANDLERS (Xử lý phản hồi)
  // ============================================================================

  private async handleServerAction(data: ServerResponse): Promise<void> {
    // 1. Nếu là Text
    if (data.type === 'text' && data.content) {
      await this.simulateTyping(data.content);
      return;
    }

    // 2. Nếu là Lệnh Navigation (ĐÃ SỬA)
    if (data.type === 'action' && data.action === 'nav') {
      const target = data.target || '';
      this.setLastMsg(`Đang tìm màn hình phù hợp...`);
      await new Promise((r) => setTimeout(r, 400));

      // Nhận về Title màn hình (string) hoặc null
      const matchedTitle = await this.clientSideNav(target);

      if (matchedTitle) {
        // Hiển thị tên màn hình chính thức (VD: "Báo cáo giường")
        this.setLastMsg(`Đang chuyển đến **${matchedTitle}**...`);
      } else {
        this.setLastMsg(
          `Xin lỗi, tôi không tìm thấy màn hình nào khớp với "${target}".`
        );
      }
      return;
    }

    // 3. Nếu là Lệnh Theme
    if (data.type === 'action' && data.action === 'theme') {
      const mode = data.mode || 'toggle';
      this.doTheme(mode);

      const isDark = this.themeService.isDarkTheme();
      this.setLastMsg(
        `Đã chuyển sang giao diện **${isDark ? 'Tối' : 'Sáng'}**.`
      );
      return;
    }
  }

  private async processStream(body: ReadableStream<Uint8Array>): Promise<void> {
    const reader = body.getReader();
    const decoder = new TextDecoder();

    let contentDisplay = ''; // Nội dung hiển thị lên UI
    let jsonBuffer = ''; // Buffer để ghép các mảnh JSON bị cắt rời

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        // Decode chunk hiện tại
        const chunk = decoder.decode(value, { stream: true });

        // NDJSON logic: Ghép vào buffer trước khi split
        jsonBuffer += chunk;
        const lines = jsonBuffer.split('\n');

        // Dòng cuối cùng có thể chưa trọn vẹn, giữ lại cho vòng lặp sau
        jsonBuffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const json = JSON.parse(line);

            // Lấy content từ Ollama response
            if (json.message?.content) {
              contentDisplay += json.message.content;
              // Update UI ngay lập tức
              this.ngZone.run(() => this.setLastMsg(contentDisplay));
            }
          } catch (e) {
            console.warn('Lỗi parse JSON stream chunk:', e);
            // Bỏ qua dòng lỗi, tiếp tục dòng sau
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  // ============================================================================
  // CLIENT ACTIONS (Nav/Theme/Routing)
  // ============================================================================

  private async clientSideNav(target: string): Promise<string | null> {
    if (this.isNavigating()) return null;

    const routes = this.getRoutes();
    const normalizedTarget = this.normalize(target);
    const targetWords = normalizedTarget.split(' ').filter((w) => w.length > 0);

    const match = routes.find((r) => {
      const title = this.normalize(r.title);
      const keywords = r.keywords?.map((k) => this.normalize(k)) || [];
      const key = r.key.toLowerCase();

      // Check số (3, 6...)
      const numberInTarget = normalizedTarget.match(/\b(\d+)\b/)?.[1];
      if (numberInTarget) {
        const routeHasNumber =
          key.includes(numberInTarget) ||
          keywords.some((k) => k.includes(numberInTarget));
        if (!routeHasNumber) return false;
      }

      return targetWords.some(
        (w) =>
          title.includes(w) ||
          key.includes(w) ||
          keywords.some((k) => k.includes(w))
      );
    });

    if (match) {
      if (this.router.url.includes(match.fullUrl)) {
        // Nếu đang ở trang đó rồi, vẫn trả về Title để Bot báo "Đang chuyển đến..." (hoặc bạn có thể báo "Bạn đang ở...")
        return match.title;
      }

      this.isNavigating.set(true);
      await this.router.navigateByUrl(match.fullUrl);
      setTimeout(() => this.isNavigating.set(false), 500);

      // TRẢ VỀ TITLE CHÍNH THỨC
      return match.title;
    }

    return null;
  }

  private doTheme(mode: string): void {
    const isDark = this.themeService.isDarkTheme();
    if (mode === 'dark' && !isDark) this.themeService.toggleTheme();
    else if (mode === 'light' && isDark) this.themeService.toggleTheme();
    else if (mode === 'toggle') this.themeService.toggleTheme();
  }

  // ============================================================================
  // ROUTE UTILS (Quét router config của Angular)
  // ============================================================================

  private getRoutes(): RouteInfo[] {
    if (!this.routeCache) {
      this.routeCache = this.scanRoutes(this.router.config);
    }
    return this.routeCache;
  }

  private scanRoutes(routes: Routes, parent = ''): RouteInfo[] {
    const results: RouteInfo[] = [];
    for (const route of routes) {
      if (route.redirectTo || route.path === '**') continue;

      const path = route.path || '';
      const fullPath = parent ? `${parent}/${path}` : `/${path}`;

      // Xóa tiền tố '/app/' để có key sạch (vd: "app/settings" -> "settings")
      const key = fullPath.replace(/^\/?(app\/)?/, '');

      if (route.data?.['title']) {
        results.push({
          title: route.data['title'] as string,
          fullUrl: fullPath,
          key,
          keywords: SCREEN_KEYWORDS[key], // Map từ khóa tĩnh vào route động
        });
      }
      if (route.children) {
        results.push(...this.scanRoutes(route.children, fullPath));
      }
    }
    return results;
  }

  // ============================================================================
  // UI HELPERS
  // ============================================================================

  private createMsg(role: ChatMessage['role'], content: string): ChatMessage {
    return {
      id: `m_${Date.now()}_${++this.msgCounter}`,
      role,
      content,
      timestamp: Date.now(),
    };
  }

  private setLastMsg(content: string): void {
    this.messages.update((msgs) => {
      const arr = [...msgs];
      const last = arr.length - 1;
      // Chỉ update nếu tin nhắn cuối cùng là assistant
      if (last >= 0 && arr[last].role === 'assistant') {
        arr[last] = { ...arr[last], content };
      }
      return arr;
    });
  }

  private finalizeLastMsg(): void {
    this.messages.update((msgs) => {
      const arr = [...msgs];
      const lastIdx = arr.length - 1;
      if (lastIdx >= 0 && arr[lastIdx].role === 'assistant') {
        let content = arr[lastIdx].content.trim();
        // Nếu stream lỗi hoặc rỗng, hiển thị thông báo mặc định
        if (!content)
          content = 'Xin lỗi, tôi không hiểu yêu cầu. Vui lòng thử lại.';
        arr[lastIdx] = { ...arr[lastIdx], content };
      }
      return arr;
    });
  }

  private addGreeting(): void {
    this.messages.update((m) => [
      ...m,
      this.createMsg(
        'assistant',
        'Xin chào! Tôi là trợ lý IT của Bệnh viện Hoàn Mỹ.'
      ),
    ]);
  }

  // Giả lập hiệu ứng gõ phím cho Text tĩnh (không phải stream)
  private async simulateTyping(text: string): Promise<void> {
    const chunkSize = 4;
    let current = '';

    // Reset tin nhắn cuối về rỗng để bắt đầu gõ
    this.setLastMsg('');

    for (let i = 0; i < text.length; i += chunkSize) {
      if (!this.isOpen()) break;
      current += text.slice(i, i + chunkSize);
      this.setLastMsg(current);
      // Random delay nhẹ cho giống người gõ
      await new Promise((r) => setTimeout(r, 15 + Math.random() * 15));
    }
  }

  private handleErr(error: unknown): void {
    if (error instanceof DOMException && error.name === 'AbortError') return;
    console.error('[LLM Service Error]', error);
    this.setLastMsg(
      'Hệ thống đang bận hoặc không thể kết nối. Vui lòng thử lại sau.'
    );
  }

  private normalize(text: string): string {
    return text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd');
  }

  private abort(): void {
    this.abortCtrl?.abort();
    this.abortCtrl = null;
  }

  private cleanup(): void {
    this.abort();
    this.clearSessionTimer();
    this.messages.set([]);
    this.isOpen.set(false);
    this.routeCache = null;
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
}
