import {
  Injectable,
  signal,
  inject,
  NgZone,
  DestroyRef,
  effect,
  computed,
} from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router, Routes, Route } from '@angular/router';
import { AuthService } from './auth.service';
import { ThemeService } from './theme.service';
import { firstValueFrom, Subject } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { debounceTime } from 'rxjs/operators';
import { environment } from '../../../environments/environment';

// ============================================================================
// TYPES
// ============================================================================

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  isStreaming?: boolean;
  isError?: boolean;
}

export interface RouteInfo {
  title: string;
  fullUrl: string;
  key: string;
  keywords?: string[];
}

export interface AnchorPosition {
  top: number;
  right: number;
}

interface ToolCall {
  name: 'nav' | 'theme';
  arguments: Record<string, unknown>;
}

interface StreamChunk {
  message?: {
    role?: string;
    content?: string;
    tool_calls?: Array<{
      function: { name: string; arguments: Record<string, unknown> };
    }>;
  };
  done?: boolean;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  TIMEOUT: 30000,
  MAX_HISTORY: 10,
  UI_DEBOUNCE: 16,
  THEME_COOLDOWN: 1000,
  MAX_INPUT_LENGTH: 500,
  TOGGLE_DEBOUNCE: 300,
  MESSAGE_DEBOUNCE: 300,
  SESSION_TIMEOUT: 30 * 60 * 1000,
  ROUTE_CACHE_TTL: 5 * 60 * 1000,
  NAV_DELAY: 200,
  RETRY_COUNT: 3,
  RETRY_DELAY: 1000,
} as const;

const GREETINGS = [
  'Xin chào! 👋 Tôi là trợ lý ảo IT. Tôi có thể giúp gì cho bạn hôm nay? ✨',
  'Chào bạn! 🤖 Tôi là trợ lý IT. Bạn cần hỗ trợ gì không? 🚀',
  'Dạ, chào bạn! 🌟 Tôi có thể giúp bạn điều hướng hoặc trả lời các câu hỏi IT ạ! 💻',
];

const HTML_TAG_REGEX = /<[^>]*>/g;

// ============================================================================
// SERVICE
// ============================================================================

@Injectable({ providedIn: 'root' })
export class LlmService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly authService = inject(AuthService);
  private readonly themeService = inject(ThemeService);
  private readonly ngZone = inject(NgZone);
  private readonly destroyRef = inject(DestroyRef);

  private readonly apiUrl = environment.llmUrl;
  private readonly debug = !environment.production;

  // ========================================
  // PUBLIC SIGNALS (Reactive State)
  // ========================================

  public readonly isOpen = signal(false);
  public readonly isGenerating = signal(false);
  public readonly isTyping = signal(false);
  public readonly isModelLoading = signal(false);
  public readonly modelLoaded = signal(false);
  public readonly loadProgress = signal('');
  public readonly messages = signal<ChatMessage[]>([]);
  public readonly isNavigating = signal(false);
  public readonly isOffline = signal(false);
  public readonly inputTruncated = signal(false);
  public readonly itHotline = signal('**1108** hoặc **1109**');

  private readonly _anchorPosition = signal<AnchorPosition | null>(null);
  public readonly anchorPosition = this._anchorPosition.asReadonly();

  // Computed
  public readonly contextUsage = computed(() =>
    this.messages().reduce((acc, m) => acc + Math.ceil(m.content.length / 3.5), 0)
  );

  // ========================================
  // PRIVATE STATE
  // ========================================

  private sessionId = this.generateId();
  private sessionTimer?: ReturnType<typeof setTimeout>;
  private lastThemeChange = 0;
  private lastToggleTime = 0;
  private lastMessageTime = 0;
  private abortCtrl: AbortController | null = null;

  // Route cache
  private routeCache: RouteInfo[] | null = null;
  private routeMap: Map<string, RouteInfo> | null = null;
  private routeCacheTime = 0;

  // Stream update subject (for debounced UI updates)
  private readonly streamUpdate$ = new Subject<string>();

  // Network handlers (stored for cleanup)
  private readonly onOnline = () =>
    this.ngZone.run(() => {
      this.isOffline.set(false);
      this.log('Network: Online');
    });

  private readonly onOffline = () =>
    this.ngZone.run(() => {
      this.isOffline.set(true);
      this.abort();
      this.log('Network: Offline');
    });

  // ========================================
  // CONSTRUCTOR
  // ========================================

  constructor() {
    // Cleanup on logout
    effect(() => {
      if (!this.authService.isLoggedIn()) this.cleanup();
    });

    // Debounced stream updates
    this.streamUpdate$
      .pipe(debounceTime(CONFIG.UI_DEBOUNCE), takeUntilDestroyed(this.destroyRef))
      .subscribe((content) =>
        this.ngZone.run(() => this.updateLastMessage(content, true))
      );

    // Network monitoring
    if (typeof window !== 'undefined') {
      window.addEventListener('online', this.onOnline);
      window.addEventListener('offline', this.onOffline);
      this.isOffline.set(!navigator.onLine);
    }

    // Cleanup on destroy
    this.destroyRef.onDestroy(() => {
      this.cleanup();
      if (typeof window !== 'undefined') {
        window.removeEventListener('online', this.onOnline);
        window.removeEventListener('offline', this.onOffline);
      }
    });
  }

  // ========================================
  // PUBLIC API
  // ========================================

  public setAnchorPosition(position: AnchorPosition): void {
    this._anchorPosition.set(position);
  }

  public toggleChat(): void {
    const now = Date.now();
    if (now - this.lastToggleTime < CONFIG.TOGGLE_DEBOUNCE) return;
    this.lastToggleTime = now;

    const willOpen = !this.isOpen();
    this.isOpen.set(willOpen);

    if (willOpen) {
      this.resetSessionTimer();
      this.inputTruncated.set(false);

      // Invalidate cache if TTL expired
      if (now - this.routeCacheTime > CONFIG.ROUTE_CACHE_TTL) {
        this.invalidateRouteCache();
      }

      // Load model if needed
      if (!this.modelLoaded() && !this.isModelLoading()) {
        this.loadModel();
      }
    } else {
      this.clearSessionTimer();
    }
  }

  public async sendMessage(content: string): Promise<void> {
    // Early guards
    if (this.isOffline()) {
      this.addMessage('assistant', 'Bạn đang offline. Vui lòng kiểm tra kết nối mạng. 📶');
      return;
    }

    if (this.isNavigating()) {
      this.log('Message blocked: navigation in progress');
      return;
    }

    const now = Date.now();
    if (now - this.lastMessageTime < CONFIG.MESSAGE_DEBOUNCE) return;
    this.lastMessageTime = now;

    // Sanitize & truncate
    let input = this.sanitize(content);
    if (!input) return;

    if (input.length > CONFIG.MAX_INPUT_LENGTH) {
      input = input.substring(0, CONFIG.MAX_INPUT_LENGTH);
      this.inputTruncated.set(true);
    } else {
      this.inputTruncated.set(false);
    }

    // Add user message & prepare assistant placeholder
    this.addMessage('user', input);
    this.addMessage('assistant', '');
    this.resetSessionTimer();
    this.abort();
    this.isGenerating.set(true);

    try {
      await this.retry(() => this.streamRequest(input));
    } catch (e) {
      this.handleError(e);
    } finally {
      this.finalize();
      this.isGenerating.set(false);
      this.abortCtrl = null;
      this.cleanupEmptyMessages();
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
    this.sessionId = this.generateId();

    if (this.modelLoaded() && this.authService.isLoggedIn()) {
      this.addGreeting();
    }
  }

  public async loadModel(): Promise<void> {
    if (this.modelLoaded() || this.isModelLoading()) return;

    this.isModelLoading.set(true);
    this.loadProgress.set('Đang kết nối...');

    try {
      const [healthRes] = await Promise.all([
        this.checkHealth(),
        this.delay(1000), // Min display time
      ]);

      if (healthRes?.config?.hotline) {
        this.itHotline.set(healthRes.config.hotline);
      }

      this.modelLoaded.set(true);
      this.loadProgress.set('Sẵn sàng');
      if (this.messages().length === 0) this.addGreeting();
    } catch (e) {
      console.error('[LLM] Connection Error:', e);
      this.loadProgress.set('Không thể kết nối máy chủ AI');
    } finally {
      this.isModelLoading.set(false);
    }
  }

  // ========================================
  // STREAMING REQUEST
  // ========================================

  private async streamRequest(input: string): Promise<void> {
    this.abortCtrl = new AbortController();
    const { signal } = this.abortCtrl;

    const payload = {
      messages: this.prepareContext(),
      metadata: {
        sessionId: this.sessionId,
        routes: this.getRoutes().map((r) => ({
          key: r.key,
          title: r.title,
          keywords: r.keywords || [],
          fullUrl: r.fullUrl,
        })),
        currentTheme: this.themeService.isDarkTheme() ? 'dark' : 'light',
        currentUrl: this.router.url.split('?')[0],
      },
    };

    const timeout = setTimeout(() => this.abortCtrl?.abort(), CONFIG.TIMEOUT);

    try {
      const res = await fetch(this.apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.authService.getAccessToken()}`,
        },
        body: JSON.stringify(payload),
        signal,
      });

      clearTimeout(timeout);

      if (res.status === 429) throw new Error('Rate limit exceeded');
      if (!res.ok) throw new Error(`API ${res.status}`);
      if (!res.body) throw new Error('No response body');

      await this.processStream(res.body, signal);
    } finally {
      clearTimeout(timeout);
    }
  }

  private async processStream(
    body: ReadableStream<Uint8Array>,
    signal: AbortSignal
  ): Promise<void> {
    return this.ngZone.runOutsideAngular(async () => {
      const reader = body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let content = '';
      let toolCalls: ToolCall[] = [];

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
              const chunk: StreamChunk = JSON.parse(line);

              // Accumulate content
              if (chunk.message?.content) {
                content += chunk.message.content;
                this.streamUpdate$.next(content);
              }

              // Collect tool calls
              if (chunk.message?.tool_calls) {
                for (const tc of chunk.message.tool_calls) {
                  const name = tc.function.name as 'nav' | 'theme';
                  if (name === 'nav' || name === 'theme') {
                    toolCalls.push({ name, arguments: tc.function.arguments });
                  }
                }
              }

              if (chunk.done) break;
            } catch {
              // Invalid JSON, skip
            }
          }
        }

        // Process remaining buffer
        if (buffer.trim()) {
          try {
            const chunk: StreamChunk = JSON.parse(buffer);
            if (chunk.message?.content) content += chunk.message.content;
          } catch {
            // Ignore
          }
        }
      } finally {
        reader.releaseLock();

        // Execute tools or display content
        if (toolCalls.length > 0) {
          await this.ngZone.run(() => this.executeTools(toolCalls));
        } else {
          const finalContent = content.trim() || 'Xin lỗi, tôi không hiểu. Bạn có thể nói rõ hơn không?';
          this.ngZone.run(() => this.updateLastMessage(finalContent, false));
        }
      }
    });
  }

  // ========================================
  // TOOL EXECUTION
  // ========================================

  private async executeTools(calls: ToolCall[]): Promise<void> {
    // Execute max 2 tools (safety limit)
    for (const call of calls.slice(0, 2)) {
      try {
        const result = await this.executeTool(call);
        const msg = this.getConfirmationMessage(call.name, result);
        if (msg) this.updateLastMessage(msg, false);

        // Add follow-up guide for settings navigation (password change)
        if (call.name === 'nav') {
          const data = result.data as string | { type?: string };
          if (typeof data === 'string' && data.includes('Cài đặt')) {
            await this.delay(500);
            this.addMessage('assistant', '🔐 Bạn kéo xuống phần **Đổi mật khẩu** để đổi nhé. Yêu cầu: 8-20 ký tự, có chữ hoa, chữ thường, số, và ký tự đặc biệt. Sau khi đổi xong, hệ thống sẽ tự động đăng xuất ạ.');
          }
        }
      } catch (e) {
        console.error(`[LLM] Tool error ${call.name}:`, e);
        this.updateLastMessage(this.getErrorMessage(call.name), false);
      }
    }
  }

  private async executeTool(
    call: ToolCall
  ): Promise<{ success: boolean; data?: unknown }> {
    switch (call.name) {
      case 'nav':
        return this.executeNav(call.arguments);
      case 'theme':
        return this.executeTheme(call.arguments);
      default:
        return { success: false };
    }
  }

  private executeNav(args: Record<string, unknown>): { success: boolean; data?: unknown } {
    const key = (args['k'] || args['key'] || args['path']) as string;
    if (!key) return { success: false };

    const currentPath = this.router.url.split('?')[0];
    if (this.isNavigating()) {
      return { success: true, data: { type: 'SAME', title: '' } };
    }

    const route = this.resolveRoute(key);
    if (!route) return { success: false };

    if (currentPath === route.fullUrl) {
      return { success: true, data: { type: 'SAME', title: route.title } };
    }

    this.isNavigating.set(true);
    setTimeout(() => {
      this.router.navigateByUrl(route.fullUrl).finally(() => {
        setTimeout(() => this.isNavigating.set(false), CONFIG.NAV_DELAY);
      });
    }, CONFIG.NAV_DELAY);

    return { success: true, data: route.title };
  }

  private executeTheme(args: Record<string, unknown>): { success: boolean; data?: string } {
    const now = Date.now();
    const isDark = this.themeService.isDarkTheme();

    if (now - this.lastThemeChange < CONFIG.THEME_COOLDOWN) {
      return { success: true, data: isDark ? 'dark' : 'light' };
    }
    this.lastThemeChange = now;

    const mode = ((args['m'] || args['mode'] || 'toggle') as string).toLowerCase();
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

  private getConfirmationMessage(
    tool: string,
    result: { success: boolean; data?: unknown }
  ): string | null {
    if (!result.success) return null;

    if (tool === 'nav') {
      const data = result.data as { type?: string; title?: string } | string;
      if (typeof data === 'object' && data?.type === 'SAME') {
        return `Bạn đang ở trang **${data.title || 'này'}** rồi nhé. 😊`;
      }
      return `Đang mở trang **${data}**...`;
    }

    if (tool === 'theme') {
      const mode = result.data === 'dark' ? 'Tối' : 'Sáng';
      return `Đã chuyển sang giao diện **${mode}**.`;
    }

    return null;
  }

  private getErrorMessage(tool: string): string {
    const errors: Record<string, string> = {
      nav: 'Xin lỗi, tôi không tìm thấy trang bạn yêu cầu.',
      theme: 'Xin lỗi, tôi không thể đổi giao diện lúc này.',
    };
    return errors[tool] || 'Đã có lỗi xảy ra.';
  }

  // ========================================
  // ROUTE MANAGEMENT
  // ========================================

  private getRoutes(): RouteInfo[] {
    if (this.routeCache) return this.routeCache;
    this.routeCache = this.scanRoutes(this.router.config);
    this.routeCacheTime = Date.now();
    return this.routeCache;
  }

  private invalidateRouteCache(): void {
    this.routeCache = null;
    this.routeMap = null;
    this.routeCacheTime = 0;
  }

  private scanRoutes(routes: Routes, parentPath = ''): RouteInfo[] {
    const results: RouteInfo[] = [];

    for (const route of routes) {
      const path = route.path || '';
      const fullPath = parentPath
        ? parentPath.endsWith('/')
          ? `${parentPath}${path}`
          : `${parentPath}/${path}`
        : `/${path}`;

      if (!this.checkPermission(route)) continue;

      const title = route.data?.['title'] as string;
      const keywords = route.data?.['keywords'] as string[];

      if (title) {
        let key = fullPath.startsWith('/') ? fullPath.substring(1) : fullPath;
        key = key.replace(/^app\//, '');

        results.push({
          title,
          fullUrl: fullPath,
          key,
          keywords: keywords || [],
        });
      }

      if (route.children) {
        results.push(...this.scanRoutes(route.children, fullPath));
      }
    }

    return results;
  }

  private checkPermission(route: Route): boolean {
    const perm = route.data?.['permission'] as string | undefined;
    if (!perm) {
      const whitelist = ['home', 'settings', 'profile', 'app', ''];
      return whitelist.includes(route.path ?? '');
    }
    const user = this.authService.currentUser();
    return user?.permissions?.some((p) => p.startsWith(perm)) ?? false;
  }

  private resolveRoute(key: string): RouteInfo | null {
    // Build map on first access
    if (!this.routeMap) {
      this.routeMap = new Map();
      for (const r of this.getRoutes()) {
        this.routeMap.set(r.key, r);
      }
    }

    // Direct match
    if (this.routeMap.has(key)) return this.routeMap.get(key)!;

    // Clean match
    const cleanKey = key.replace(/^\/?(app\/)?/, '');
    if (this.routeMap.has(cleanKey)) return this.routeMap.get(cleanKey)!;

    // Fuzzy search fallback
    const lower = key.toLowerCase();
    return (
      this.getRoutes().find(
        (r) =>
          r.key.toLowerCase().includes(lower) ||
          r.fullUrl.toLowerCase().includes(lower) ||
          r.title.toLowerCase().includes(lower) ||
          r.keywords?.some((kw) => kw.toLowerCase().includes(lower))
      ) || null
    );
  }

  // ========================================
  // HEALTH CHECK
  // ========================================

  private async checkHealth(): Promise<{ config?: { hotline?: string } } | null> {
    const healthUrl = this.apiUrl.replace('/api/llm', '/health');
    try {
      return await firstValueFrom(this.http.get<{ config?: { hotline?: string } }>(healthUrl));
    } catch {
      throw new Error('Server unreachable');
    }
  }

  // ========================================
  // MESSAGE HELPERS
  // ========================================

  private prepareContext(): Array<{ role: string; content: string }> {
    return this.messages()
      .slice(-CONFIG.MAX_HISTORY)
      .filter((m) => !m.isError && m.content.trim())
      .map((m) => ({ role: m.role, content: m.content }));
  }

  private addMessage(role: 'user' | 'assistant', content: string): void {
    this.messages.update((m) => [
      ...m,
      {
        id: this.generateId(),
        role,
        content,
        timestamp: Date.now(),
        isStreaming: role === 'assistant',
      },
    ]);
  }

  private updateLastMessage(content: string, isStreaming: boolean): void {
    this.messages.update((m) => {
      if (!m.length) return m;
      return [...m.slice(0, -1), { ...m[m.length - 1], content, isStreaming }];
    });
  }

  private finalize(): void {
    this.messages.update((m) => {
      if (!m.length) return m;
      return [...m.slice(0, -1), { ...m[m.length - 1], isStreaming: false }];
    });
  }

  private cleanupEmptyMessages(): void {
    this.messages.update((m) =>
      m.filter((msg) => msg.content.trim() || msg.role !== 'assistant')
    );
  }

  private addGreeting(): void {
    const greeting = GREETINGS[Math.floor(Math.random() * GREETINGS.length)];
    this.messages.set([
      {
        id: this.generateId(),
        role: 'assistant',
        content: greeting,
        timestamp: Date.now(),
        isStreaming: false,
      },
    ]);
  }

  // ========================================
  // UTILITIES
  // ========================================

  private sanitize(str: string): string {
    return str.replace(HTML_TAG_REGEX, '').trim();
  }

  private generateId(): string {
    return Math.random().toString(36).substring(2, 15);
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private log(...args: unknown[]): void {
    if (this.debug) console.log('[LLM]', ...args);
  }

  private abort(): void {
    this.abortCtrl?.abort();
    this.abortCtrl = null;
  }

  private cleanup(): void {
    this.clearSessionTimer();
    this.abort();
  }

  private resetSessionTimer(): void {
    this.clearSessionTimer();
    this.sessionTimer = setTimeout(() => this.resetChat(), CONFIG.SESSION_TIMEOUT);
  }

  private clearSessionTimer(): void {
    if (this.sessionTimer) {
      clearTimeout(this.sessionTimer);
      this.sessionTimer = undefined;
    }
  }

  private handleError(e: unknown): void {
    console.error('[LLM] Error:', e);
    this.messages.update((m) => {
      const last = m[m.length - 1];
      if (last?.role === 'assistant') {
        return [
          ...m.slice(0, -1),
          { ...last, content: 'Đã có lỗi xảy ra. Vui lòng thử lại.', isError: true, isStreaming: false },
        ];
      }
      return m;
    });
  }

  private async retry<T>(fn: () => Promise<T>): Promise<T> {
    let lastErr: unknown;
    for (let i = 0; i < CONFIG.RETRY_COUNT; i++) {
      try {
        return await fn();
      } catch (e) {
        lastErr = e;
        this.log(`Retry ${i + 1}/${CONFIG.RETRY_COUNT} failed:`, e);
        if (i < CONFIG.RETRY_COUNT - 1) {
          await this.delay(CONFIG.RETRY_DELAY * (i + 1));
        }
      }
    }
    throw lastErr;
  }
}