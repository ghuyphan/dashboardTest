import {
  Injectable,
  signal,
  computed,
  inject,
  NgZone,
  DestroyRef,
  effect,
} from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router, Routes, Route } from '@angular/router';
import { AuthService } from './auth.service';
import { ThemeService } from './theme.service';
import { firstValueFrom, Subject } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { debounceTime } from 'rxjs/operators';
import { environment } from '../../../environments/environment';

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

interface ToolCall {
  name: string;
  arguments: Record<string, unknown>;
}

interface ToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

type AllowedTool = 'nav' | 'theme';
const ALLOWED_TOOLS: AllowedTool[] = ['nav', 'theme'];

interface StreamUpdate {
  content: string;
  tokenEstimate: number;
}

@Injectable({
  providedIn: 'root',
})
export class LlmService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly authService = inject(AuthService);
  private readonly themeService = inject(ThemeService);
  private readonly ngZone = inject(NgZone);
  private readonly destroyRef = inject(DestroyRef);

  private readonly apiUrl = environment.llmUrl;
  private readonly TIMEOUT = 30000;
  private readonly MAX_HISTORY = 10;
  private readonly UI_DEBOUNCE = 16; // ~60fps
  private readonly THEME_COOLDOWN = 2000;
  private readonly DEBUG = !environment.production;

  // Signals
  public readonly isOpen = signal(false);
  public readonly isGenerating = signal(false);
  public readonly isTyping = signal(false); // UI typing effect
  public readonly isModelLoading = signal(false);
  public readonly modelLoaded = signal(false);
  public readonly loadProgress = signal('');
  public readonly messages = signal<ChatMessage[]>([]);
  public readonly isNavigating = signal(false);
  public readonly contextUsage = signal(0);
  public readonly itHotline = signal('**1108** hoặc **1109**');

  // State
  private sessionTimer?: ReturnType<typeof setTimeout>;
  private lastThemeChange = 0;
  private abortCtrl: AbortController | null = null;
  private msgCounter = 0;
  private sessionId: string;

  // Cache
  private routeCache: RouteInfo[] | null = null;
  private routeMap: Map<string, RouteInfo> | null = null;

  private readonly streamUpdate$ = new Subject<StreamUpdate>();

  constructor() {
    this.sessionId = this.generateSessionId();

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
      // Clear cache on open to ensure we have fresh permissions/routes
      this.routeCache = null;
      this.routeMap = null;

      if (!this.modelLoaded() && !this.isModelLoading()) this.loadModel();
    } else {
      this.clearSessionTimer();
    }
  }

  public async sendMessage(content: string): Promise<void> {
    const input = this.sanitize(content);
    if (!input) return;

    // UI Updates
    this.messages.update((m) => [...m, this.createMsg('user', input)]);
    this.resetSessionTimer();
    this.abort();

    // Prepare assistant placeholder
    this.messages.update((m) => [...m, this.createMsg('assistant', '', 0)]);
    this.isGenerating.set(true);

    try {
      await this.retry(() => this.streamToServer(input));
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
    this.sessionId = this.generateSessionId();

    if (this.modelLoaded() && this.authService.isLoggedIn()) {
      this.addGreeting();
    }
  }

  public async loadModel(): Promise<void> {
    if (this.modelLoaded() || this.isModelLoading()) return;

    this.isModelLoading.set(true);
    this.loadProgress.set('Đang kết nối...');

    const minDelay = this.delay(1000);

    try {
      await Promise.all([this.checkHealth(), minDelay]);

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

  // ============================================================================
  // HEALTH CHECK
  // ============================================================================

  private async checkHealth(): Promise<void> {
    // Replace API path with Health path safely for both relative and absolute URLs
    const healthUrl = this.apiUrl.replace('/api/llm', '/health');
    try {
      const res = await firstValueFrom(this.http.get<any>(healthUrl));
      if (res?.config?.hotline) {
        this.itHotline.set(res.config.hotline);
      }
    } catch (e) {
      throw new Error('Server unreachable');
    }
  }
  // ============================================================================
  // SERVER STREAMING LOGIC
  // ============================================================================

  private async streamToServer(input: string): Promise<void> {
    this.abortCtrl = new AbortController();
    const signal = this.abortCtrl.signal;

    const context = this.prepareContext(input);
    const clientRoutes = this.getRoutes().map((r) => ({
      key: r.key,
      title: r.title,
      keywords: r.keywords || [],
      fullUrl: r.fullUrl,
    }));

    const messages = context.map(m => ({ role: m.role, content: m.content }));

    const payload = {
      messages,
      metadata: {
        sessionId: this.sessionId,
        routes: clientRoutes,
        currentTheme: this.themeService.isDarkTheme() ? 'dark' : 'light',
      }
    };

    const timeout = setTimeout(() => this.abortCtrl?.abort(), this.TIMEOUT);

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
      if (!res.body) throw new Error('No body');

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

              // 1. Handle text content
              if (json.message?.content) {
                content += json.message.content;
              }

              // 2. Handle JSON_ACTION in text content
              const actionRegex = /JSON_ACTION:\s*(\{.*?\})/g;
              let match;
              while ((match = actionRegex.exec(content)) !== null) {
                try {
                  const actionJson = JSON.parse(match[1]);
                  const toolCall = this.parseSingleToolCall(actionJson);

                  if (toolCall && !toolCalls.some(tc => tc.name === toolCall.name && JSON.stringify(tc.arguments) === JSON.stringify(toolCall.arguments))) {
                    toolCalls.push(toolCall);
                  }
                } catch (e) {
                  // Invalid JSON in action, ignore
                }
              }

              // 3. Handle explicit tool_calls
              const tools = this.parseTools(json);
              for (const t of tools) {
                if (!toolCalls.some((tc) => tc.name === t.name)) {
                  toolCalls.push(t);
                }
              }

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

            const actionRegex = /JSON_ACTION:\s*(\{.*?\})/g;
            let match;
            while ((match = actionRegex.exec(content)) !== null) {
              try {
                const actionJson = JSON.parse(match[1]);
                const toolCall = this.parseSingleToolCall(actionJson);
                if (toolCall && !toolCalls.some(tc => tc.name === toolCall.name && JSON.stringify(tc.arguments) === JSON.stringify(toolCall.arguments))) {
                  toolCalls.push(toolCall);
                }
              } catch { }
            }
          } catch { /* ignore */ }
        }
      } finally {
        reader.releaseLock();

        if (toolCalls.length) {
          await this.ngZone.run(() => this.execTools(toolCalls));
        } else {
          const finalContent = this.sanitizeOut(content);
          this.streamUpdate$.next({
            content: finalContent || 'Xin lỗi, tôi không hiểu. Bạn có thể nói rõ hơn không?',
            tokenEstimate: this.tokens(content),
          });
        }
      }
    });
  }

  private getRoutes(): RouteInfo[] {
    if (this.routeCache) return this.routeCache;
    this.routeCache = this.scanRoutes(this.router.config);
    return this.routeCache;
  }

  private scanRoutes(routes: Routes, parentPath = ''): RouteInfo[] {
    const results: RouteInfo[] = [];

    for (const route of routes) {
      const path = route.path || '';
      // Ensure clean path concatenation
      const fullPath = parentPath
        ? parentPath.endsWith('/')
          ? `${parentPath}${path}`
          : `${parentPath}/${path}`
        : `/${path}`;

      // Check user permissions before exposing to AI
      if (!this.checkPerm(route)) {
        continue;
      }

      // Extract metadata from route data
      const title = route.data?.['title'] as string;
      const keywords = route.data?.['keywords'] as string[];

      if (title) {
        // Create a clean key for the LLM (remove 'app/' prefix if present)
        let key = fullPath.startsWith('/') ? fullPath.substring(1) : fullPath;
        key = key.replace(/^app\//, '');

        results.push({
          title,
          fullUrl: fullPath,
          key,
          keywords: keywords || [],
        });
      }

      // Recursively scan children
      if (route.children) {
        results.push(...this.scanRoutes(route.children, fullPath));
      }
    }
    return results;
  }

  private checkPerm(route: Route): boolean {
    const perm = route.data?.['permission'] as string | undefined;
    // [SECURITY] Fail-Closed: If no permission is defined, hide it by default.
    if (!perm) {
      const path = route.path ?? '';
      // Whitelist public routes that are safe to expose
      // 'app' and '' are container routes that must be allowed to scan children
      const whitelist = ['home', 'settings', 'profile', 'app', ''];
      if (whitelist.includes(path)) return true;
      return false;
    }
    const user = this.authService.currentUser();
    return user?.permissions?.some((p) => p.startsWith(perm)) ?? false;
  }

  private ensureRouteMap(): void {
    if (!this.routeMap) {
      this.routeMap = new Map();
      for (const r of this.getRoutes()) {
        this.routeMap.set(r.key, r);
      }
    }
  }

  private resolveRoute(key: string): RouteInfo | null {
    this.ensureRouteMap();
    // 1. Direct Match
    if (this.routeMap!.has(key)) return this.routeMap!.get(key)!;

    // 2. Clean Match (try removing prefixes)
    const cleanKey = key.replace(/^\/?(app\/)?/, '');
    if (this.routeMap!.has(cleanKey)) return this.routeMap!.get(cleanKey)!;

    // 3. Fuzzy Search (Fallback)
    const routes = this.getRoutes();
    const lower = key.toLowerCase();

    return (
      routes.find(
        (r) =>
          r.key.toLowerCase().includes(lower) ||
          r.fullUrl.toLowerCase().includes(lower) ||
          r.title.toLowerCase().includes(lower) ||
          r.keywords?.some((kw) => kw.includes(lower))
      ) || null
    );
  }

  // ============================================================================
  // TOOL PARSING & HELPERS
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
    } catch (e) {
      if (this.DEBUG) console.error('[LLM] parseTools error:', e);
    }
    return results;
  }

  private parseSingleToolCall(call: Record<string, unknown>): ToolCall | null {
    try {
      // Handle both native tool_call format and our custom JSON_ACTION format
      // Native: { function: { name: "...", arguments: "..." } }
      // Custom: { tool: "...", args: { ... } }

      let name: string | null = null;
      let args: unknown = null;

      if (call['function'] && typeof call['function'] === 'object') {
        const fn = call['function'] as Record<string, unknown>;
        name = this.mapToolName(fn['name'] as string);
        args = fn['arguments'] ?? fn['args'] ?? fn['parameters'];
      } else if (call['tool']) {
        name = this.mapToolName(call['tool'] as string);
        args = call['args'] ?? call['arguments'];
      }

      if (name) {
        return {
          name,
          arguments: this.parseArgs(args),
        };
      }
    } catch { /* ignore */ }
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
        } catch { /* ignore */ }
      }
      return { k: trimmed };
    }
    return {};
  }

  private mapToolName(name: string): string | null {
    if (!name) return null;
    const n = name.toLowerCase();
    if (n === 'nav' || n.includes('navigate')) return 'nav';
    if (n === 'theme' || n.includes('theme')) return 'theme';
    return null;
  }

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

  private async execTool(
    name: AllowedTool,
    args: Record<string, unknown>
  ): Promise<ToolResult> {
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

  private doNav(key: string): ToolResult {
    const currentPath = this.router.url.split('?')[0];
    if (this.isNavigating()) return { success: true, data: 'SAME' };

    const route = this.resolveRoute(key);
    if (!route) return { success: false, error: 'Không tìm thấy trang này.' };

    const targetPath = route.fullUrl;
    if (currentPath === targetPath) return { success: true, data: 'SAME' };

    this.isNavigating.set(true);
    setTimeout(() => {
      this.router.navigateByUrl(targetPath).finally(() => {
        setTimeout(() => this.isNavigating.set(false), 500);
      });
    }, 600);

    return { success: true, data: route.title };
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
  // UTILITIES
  // ============================================================================

  private prepareContext(input: string): ChatMessage[] {
    // We only send the last few messages to save context window
    const history = this.messages()
      .slice(-this.MAX_HISTORY)
      .filter((m) => !m.isError && m.content.trim());

    // Calculate rough usage
    const totalTokens = history.reduce((acc, m) => acc + this.tokens(m.content), 0);
    this.contextUsage.set(totalTokens);

    return history;
  }

  private tokens(str: string): number {
    return Math.ceil(str.length / 3.5);
  }

  private setLastMsg(content: string): void {
    this.messages.update((m) => {
      if (!m.length) return m;
      const last = { ...m[m.length - 1] };
      last.content = content;
      last.isStreaming = false;
      return [...m.slice(0, -1), last];
    });
  }

  private finalize(): void {
    this.messages.update((m) => {
      if (!m.length) return m;
      const last = { ...m[m.length - 1] };
      last.isStreaming = false;
      return [...m.slice(0, -1), last];
    });
  }

  private applyUpdate(update: StreamUpdate): void {
    this.messages.update((m) => {
      if (!m.length) return m;
      const last = { ...m[m.length - 1] };
      last.content = update.content;
      last.isStreaming = true;
      return [...m.slice(0, -1), last];
    });
  }

  private cleanupEmpty(): void {
    this.messages.update((m) =>
      m.filter((msg) => msg.content.trim() || msg.role !== 'assistant')
    );
  }

  private createMsg(
    role: 'user' | 'assistant',
    content: string,
    timestamp = Date.now()
  ): ChatMessage {
    return {
      id: Math.random().toString(36).substring(2, 9),
      role,
      content,
      timestamp,
      isStreaming: role === 'assistant',
    };
  }

  private addGreeting(): void {
    const greeting =
      'Xin chào! 👋 Tôi là trợ lý ảo IT. Tôi có thể giúp gì cho bạn hôm nay? ✨';
    this.messages.set([this.createMsg('assistant', greeting)]);
  }

  private getConfirmation(tool: string, result: ToolResult): string | null {
    if (!result.success) return null;
    if (result.data === 'SAME') return null;

    if (tool === 'nav') {
      if (result.data === 'Cài đặt tài khoản') {
        return `Đang mở trang **${result.data}**... Bạn có thể đổi mật khẩu ở phần **Đổi mật khẩu** phía dưới nhé. 👇`;
      }
      return `Đang mở trang **${result.data}**...`;
    }
    if (tool === 'theme') {
      const mode = result.data === 'dark' ? 'Tối' : 'Sáng';
      return `Đã chuyển sang giao diện **${mode}**.`;
    }
    return null;
  }

  private getToolErr(tool: string): string {
    if (tool === 'nav') return 'Xin lỗi, tôi không tìm thấy trang bạn yêu cầu.';
    return 'Xin lỗi, tôi không thể thực hiện yêu cầu này. 😅';
  }

  private generateSessionId(): string {
    return Math.random().toString(36).substring(2, 15);
  }

  private async retry<T>(fn: () => Promise<T>, retries = 1): Promise<T> {
    try {
      return await fn();
    } catch (e) {
      if (retries > 0) {
        await this.delay(1000);
        return this.retry(fn, retries - 1);
      }
      throw e;
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private sanitize(str: string): string {
    return str.replace(/<[^>]*>/g, '').trim();
  }

  private sanitizeOut(str: string): string {
    // Remove JSON_ACTION artifacts from output
    return str.replace(/JSON_ACTION:\s*\{.*?\}/g, '').trim();
  }

  private handleErr(e: unknown): void {
    console.error('[LLM] Error:', e);
    const msg =
      e instanceof Error && e.message.includes('Rate limit')
        ? 'Hệ thống đang bận, vui lòng thử lại sau giây lát.'
        : 'Đã có lỗi xảy ra. Vui lòng thử lại.';

    this.messages.update((m) => {
      const last = m[m.length - 1];
      if (last?.role === 'assistant') {
        return [
          ...m.slice(0, -1),
          { ...last, content: msg, isError: true, isStreaming: false },
        ];
      }
      return [...m, { role: 'assistant', content: msg, timestamp: Date.now(), isError: true, id: Math.random().toString(36).substring(2, 9) }];
    });
  }

  private abort(): void {
    if (this.abortCtrl) {
      this.abortCtrl.abort();
      this.abortCtrl = null;
    }
  }

  private cleanup(): void {
    this.abort();
    this.clearSessionTimer();
  }

  private resetSessionTimer(): void {
    this.clearSessionTimer();
    this.sessionTimer = setTimeout(() => {
      if (this.messages().length > 0) {
        this.resetChat();
      }
    }, 1000 * 60 * 15); // 15 min inactivity
  }

  private clearSessionTimer(): void {
    if (this.sessionTimer) {
      clearTimeout(this.sessionTimer);
      this.sessionTimer = undefined;
    }
  }
}