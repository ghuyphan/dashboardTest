import {
  Injectable,
  signal,
  inject,
  effect,
  DestroyRef,
  NgZone,
} from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router, Routes, Route } from '@angular/router';
import { AuthService } from './auth.service';
import { ThemeService } from './theme.service';
import { environment } from '../../../environments/environment.development';
import { Subject, debounceTime, firstValueFrom } from 'rxjs';

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
// CONSTANTS
// ============================================================================

const ALLOWED_TOOLS = ['nav', 'theme'] as const;
type AllowedTool = (typeof ALLOWED_TOOLS)[number];

const IT_HOTLINE = '**1108** hoặc **1109**';

// ============================================================================
// SERVICE
// ============================================================================

@Injectable({ providedIn: 'root' })
export class LlmService {
  private readonly http = inject(HttpClient);
  private readonly authService = inject(AuthService);
  private readonly themeService = inject(ThemeService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly ngZone = inject(NgZone);

  // e.g. 'http://localhost:3000/api/llm'
  private readonly apiUrl = environment.llmUrl;

  // Configuration
  private readonly MAX_CTX = 4096;
  private readonly MAX_HISTORY = 3;
  private readonly MAX_OUTPUT = 200;
  private readonly TOOL_BUDGET = 150;
  private readonly CHARS_PER_TOKEN = 2.0;
  private readonly SESSION_TIMEOUT = 15 * 60 * 1000;
  private readonly THEME_COOLDOWN = 1000;
  private readonly UI_DEBOUNCE = 20;
  private readonly MAX_RETRIES = 1;
  private readonly RETRY_DELAY = 1000;
  private readonly TIMEOUT = 60000;
  private readonly MAX_INPUT = 500;

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
  private sessionId: string;

  // Cache
  private routeCache: RouteInfo[] | null = null;
  private routeMap: Map<string, RouteInfo> | null = null;
  private toolCache: unknown[] | null = null;

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
      this.toolCache = null;

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
  // HEALTH CHECK
  // ============================================================================

  private async checkHealth(): Promise<void> {
    // Replace API path with Health path safely for both relative and absolute URLs
    const healthUrl = this.apiUrl.replace('/api/llm', '/health');
    try {
      await firstValueFrom(this.http.get(healthUrl));
    } catch (e) {
      throw new Error('Server unreachable');
    }
  }

  // ============================================================================
  // SERVER STREAMING LOGIC
  // ============================================================================

  private async streamToServer(userMsg: string): Promise<void> {
    this.abortCtrl = new AbortController();
    const { signal } = this.abortCtrl;

    const context = this.prepareContext(userMsg);
    const tools = this.buildTools();
    const routes = this.getRoutes(); // 🚀 Automatically scans router config

    const metadata = {
      sessionId: this.sessionId,
      routes: routes.map((r) => ({
        key: r.key,
        title: r.title,
        keywords: r.keywords,
      })),
      currentPath: this.router.url.split('?')[0],
      currentTheme: this.themeService.isDarkTheme() ? 'dark' : 'light',
    };

    const payload = {
      messages: [
        ...context.map((m) => ({ role: m.role, content: m.content })),
        { role: 'user', content: userMsg },
      ],
      tools,
      metadata,
      stream: true,
    };

    if (this.DEBUG)
      console.log('[LLM] Request Payload:', JSON.stringify(payload, null, 2));

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
              if (this.DEBUG) console.log('[LLM] Chunk:', json);

              if (json.message?.content) {
                content += json.message.content;
              }

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

        if (buffer.trim()) {
          try {
            const json = JSON.parse(buffer);
            if (json.message?.content) content += json.message.content;
            const tools = this.parseTools(json);
            tools.forEach((t) => toolCalls.push(t));
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

  // ============================================================================
  // TOOLS & ROUTE SCANNING (UNIFIED)
  // ============================================================================

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

  private getRoutes(): RouteInfo[] {
    if (!this.routeCache) {
      // 🚀 Completely dynamic scanning of Router Config
      this.routeCache = this.scanRoutes(this.router.config);
      if (this.DEBUG) console.log('🚀 LLM Routes:', this.routeCache);
    }
    return this.routeCache;
  }

  private scanRoutes(routes: Routes, parentPath = ''): RouteInfo[] {
    const results: RouteInfo[] = [];

    for (const route of routes) {
      if (route.redirectTo || route.path === '**') continue;

      const path = route.path || '';
      // Ensure clean path concatenation
      const fullPath = parentPath
        ? parentPath.endsWith('/')
          ? `${parentPath}${path}`
          : `${parentPath}/${path}`
        : `/${path}`;

      // Check user permissions before exposing to AI
      if (!this.checkPerm(route)) continue;

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
    if (!perm) return true;
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
      if (call['function'] && typeof call['function'] === 'object') {
        const fn = call['function'] as Record<string, unknown>;
        const name = this.mapToolName(fn['name'] as string);
        if (name) {
          return {
            name,
            arguments: this.parseArgs(fn['arguments'] ?? fn['args'] ?? fn['parameters']),
          };
        }
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

  private prepareContext(newMsg: string): ChatMessage[] {
    const newTokens = this.tokens(newMsg);
    const available = this.MAX_CTX - 400 - this.TOOL_BUDGET - this.MAX_OUTPUT - newTokens - 50;

    const history = this.messages()
      .filter((m) => m.content.trim() && m.role !== 'system' && m.role !== 'tool')
      .map((m) => ({
        ...m,
        content: m.content.length > 120 ? m.content.substring(0, 120) + '...' : m.content,
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
      Math.min(100, Math.round(((400 + used + newTokens) / this.MAX_CTX) * 100))
    );
    return result;
  }

  private tokens(text: string): number {
    if (!text) return 0;
    return Math.ceil(text.length / this.CHARS_PER_TOKEN) + 2;
  }

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
      if (last >= 0 && arr[last].role === 'assistant' && !arr[last].content.trim()) {
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

  private getConfirmation(name: string, result: ToolResult): string {
    if (!result.success) return result.error || 'Có lỗi xảy ra.';
    if (result.data === 'SAME') return 'Bạn đang ở màn hình này rồi.';
    if (name === 'nav') return `Đang chuyển đến **${result.data}**...`;
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

  private generateSessionId(): string {
    return `${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

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

  private sanitize(content: string): string {
    if (!content) return '';
    let r = content.trim();
    if (r.length > this.MAX_INPUT) r = r.slice(0, this.MAX_INPUT);
    r = r.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
    r = r.replace(/[ \t]+/g, ' ').replace(/\n{2,}/g, '\n');
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
    if (r.length > 800) r = r.substring(0, 800) + '...';
    return r.replace(/\n{3,}/g, '\n\n').trim();
  }

  private handleErr(error: unknown): void {
    if (error instanceof DOMException && error.name === 'AbortError') return;
    console.error('[LLM] Error:', error);
    this.messages.update((msgs) => {
      const arr = [...msgs];
      const last = arr.length - 1;
      if (last >= 0 && arr[last].role === 'assistant') {
        const msg =
          error instanceof Error && error.message.includes('429')
            ? 'Hệ thống đang bận. Vui lòng thử lại sau.'
            : `Có lỗi xảy ra. Vui lòng liên hệ IT hotline ${IT_HOTLINE}.`;
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