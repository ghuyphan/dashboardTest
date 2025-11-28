import { Injectable, signal, inject, effect } from '@angular/core';
import { Router, Routes, Route } from '@angular/router';
import { AuthService } from './auth.service';
import { ThemeService } from './theme.service';
import { environment } from '../../../environments/environment.development';

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  tokenEstimate?: number; // Track token usage
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
  
  private readonly apiUrl = environment.llmUrl;
  private readonly MODEL_NAME = 'gemma3:4b-it-qat';
  private readonly SESSION_TIMEOUT = 15 * 60 * 1000;
  private readonly THEME_COOLDOWN = 1000;

  // ===== OPTIMIZED CONTEXT SETTINGS FOR GEMMA 3 4B =====
  private readonly MAX_CONTEXT_TOKENS = 6000;      // Safe limit for 8K context window
  private readonly MAX_HISTORY_MESSAGES = 6;       // Reduced from 10
  private readonly MAX_OUTPUT_TOKENS = 512;        // Limit response length
  private readonly SYSTEM_PROMPT_BUDGET = 1500;    // Reserve tokens for system prompt
  private readonly AVG_CHARS_PER_TOKEN = 3.5;      // Vietnamese ~3.5 chars/token

  // --- Signals ---
  public isOpen = signal<boolean>(false);
  public isModelLoading = signal<boolean>(false);
  public isGenerating = signal<boolean>(false);
  public modelLoaded = signal<boolean>(false);
  public loadProgress = signal<string>('');
  public messages = signal<ChatMessage[]>([]);
  public isNavigating = signal<boolean>(false);
  public contextUsage = signal<number>(0); // Track context usage percentage

  // --- Security State ---
  private sessionTimeout?: number;
  private lastThemeChange = 0;
  private _cachedAllowedPaths: string[] = [];
  private _cachedSystemPrompt: string = '';
  private _systemPromptTokens: number = 0;
  
  private get allowedPaths(): string[] {
    if (this._cachedAllowedPaths.length === 0) {
      this._cachedAllowedPaths = this.scanRoutes(this.router.config).map(r => r.fullUrl);
    }
    return this._cachedAllowedPaths;
  }

  constructor() {
    effect(() => {
      if (!this.authService.isLoggedIn()) {
        this.resetChat();
        this.isOpen.set(false);
        this.clearSessionTimeout();
      }
    });
  }

  // ===== TOKEN ESTIMATION =====
  
  /**
   * Estimate token count for Vietnamese text
   * Vietnamese uses more tokens per character than English
   */
  private estimateTokens(text: string): number {
    if (!text) return 0;
    // Vietnamese: ~3.5 chars per token (vs English ~4)
    // Add overhead for special tokens
    return Math.ceil(text.length / this.AVG_CHARS_PER_TOKEN) + 4;
  }

  /**
   * Calculate total tokens in message history
   */
  private calculateContextTokens(messages: ChatMessage[]): number {
    return messages.reduce((sum, msg) => {
      return sum + (msg.tokenEstimate || this.estimateTokens(msg.content));
    }, 0);
  }

  // ===== CONTEXT MANAGEMENT =====

  /**
   * Compress context when approaching token limits
   * Strategies: truncate old messages, summarize, or sliding window
   */
  private prepareContextWindow(newUserMessage: string): ChatMessage[] {
    const newMsgTokens = this.estimateTokens(newUserMessage);
    const availableForHistory = this.MAX_CONTEXT_TOKENS 
      - this._systemPromptTokens 
      - this.MAX_OUTPUT_TOKENS 
      - newMsgTokens
      - 100; // Safety buffer

    const history = this.messages().filter(m => m.content.trim());
    const result: ChatMessage[] = [];
    let usedTokens = 0;

    // Take messages from most recent, respecting token budget
    for (let i = history.length - 1; i >= 0; i--) {
      const msg = history[i];
      const msgTokens = msg.tokenEstimate || this.estimateTokens(msg.content);
      
      if (usedTokens + msgTokens > availableForHistory) {
        // If we can't fit more, check if we should summarize remaining
        if (result.length < 2 && i > 0) {
          // Add a summary placeholder for older context
          const summaryMsg: ChatMessage = {
            role: 'system',
            content: '[Lịch sử trước đó đã được lược bỏ để tiết kiệm bộ nhớ]',
            tokenEstimate: 20
          };
          result.unshift(summaryMsg);
        }
        break;
      }
      
      usedTokens += msgTokens;
      result.unshift({ ...msg, tokenEstimate: msgTokens });
      
      // Also respect message count limit
      if (result.length >= this.MAX_HISTORY_MESSAGES) break;
    }

    // Update context usage indicator
    const totalUsed = this._systemPromptTokens + usedTokens + newMsgTokens;
    this.contextUsage.set(Math.round((totalUsed / this.MAX_CONTEXT_TOKENS) * 100));

    return result;
  }

  /**
   * Truncate a message to fit within token budget
   */
  private truncateMessage(content: string, maxTokens: number): string {
    const currentTokens = this.estimateTokens(content);
    if (currentTokens <= maxTokens) return content;
    
    const targetChars = Math.floor(maxTokens * this.AVG_CHARS_PER_TOKEN);
    return content.substring(0, targetChars) + '... [đã cắt ngắn]';
  }

  // ===== OPTIMIZED SYSTEM PROMPT =====

  /**
   * Compact system prompt optimized for Gemma 3 4B
   * - Shorter instructions
   * - Clear structure without XML
   * - Fewer examples (model should generalize)
   */
  private getDynamicSystemPrompt(): string {
    // Return cached if user/routes haven't changed
    const currentUser = this.authService.currentUser();
    const routes = this.scanRoutes(this.router.config);
    
    // Compact sitemap - only essential info
    const sitemap = routes.map(r => {
      const desc = SCREEN_DESCRIPTIONS[r.purePath] || '';
      return `${r.title}: ${r.fullUrl}${desc ? ' - ' + desc : ''}`;
    }).join('\n');
    
    const prompt = `Bạn là IT Assistant hệ thống Hoàn Mỹ. Người dùng: ${currentUser?.fullName || 'Khách'}

CHỨC NĂNG CÓ THỂ TRUY CẬP:
${sitemap}

CÁCH DÙNG:
- Điều hướng: thêm [[NAVIGATE:/path]] cuối câu khi người dùng yêu cầu mở chức năng cụ thể
- Đổi theme: [[THEME:dark]], [[THEME:light]], hoặc [[THEME:toggle]]
- Nếu chức năng không có trong danh sách: từ chối lịch sự
- Hỗ trợ IT: gọi 1108/1109

CHỈ điều hướng khi được yêu cầu rõ ràng. Trả lời ngắn gọn, thân thiện.`;

    this._cachedSystemPrompt = prompt;
    this._systemPromptTokens = this.estimateTokens(prompt);
    
    return prompt;
  }

  // ===== MESSAGE HANDLING =====

  async sendMessage(content: string): Promise<void> {
    if (!content.trim()) return;
    
    this.resetSessionTimeout();
    
    // Sanitize input
    const sanitized = content.replace(/\[\[(NAVIGATE|THEME):.*?]\]/g, '').trim();
    if (!sanitized) return;
    
    // Estimate tokens for new message
    const newMsgTokens = this.estimateTokens(sanitized);
    
    // Add user message with token estimate
    this.messages.update(msgs => [...msgs, { 
      role: 'user', 
      content: sanitized,
      tokenEstimate: newMsgTokens 
    }]);
    
    // Add placeholder for assistant
    this.messages.update(msgs => [...msgs, { 
      role: 'assistant', 
      content: '',
      tokenEstimate: 0 
    }]);
    
    this.isGenerating.set(true);
    let hasActionTriggered = false;

    try {
      // Build optimized context window
      const contextMessages = this.prepareContextWindow(sanitized);
      const systemPrompt = this.getDynamicSystemPrompt();

      // Optimized parameters for Gemma 3 4B
      const payload = {
        model: this.MODEL_NAME,
        messages: [
          { role: 'system', content: systemPrompt },
          ...contextMessages.map(m => ({ role: m.role, content: m.content })),
          { role: 'user', content: sanitized }
        ],
        stream: true,
        options: {
          // Gemma 3 optimized settings
          temperature: 0.6,          // Lower = more focused
          top_p: 0.8,                // Nucleus sampling
          top_k: 25,                 // More deterministic
          repeat_penalty: 1.2,       // Reduce repetition
          num_predict: this.MAX_OUTPUT_TOKENS,  // Limit output
          num_ctx: this.MAX_CONTEXT_TOKENS,     // Context window
          
          // Additional Gemma optimizations
          mirostat: 0,               // Disable for faster inference
          num_thread: 4,             // Adjust based on hardware
          
          // Stop sequences to prevent runaway generation
          stop: ['\n\nUser:', '\n\nHuman:', '[[END]]', '</s>']
        }
      };

      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) throw new Error('AI service error');
      if (!response.body) throw new Error('No response body');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullResponseText = '';
      let tokenCount = 0;

      while (true) {
        if (!this.isGenerating()) {
          reader.cancel();
          break;
        }
        
        const { done, value } = await reader.read();
        if (done) break;
        
        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n').filter(line => line.trim());

        for (const line of lines) {
          try {
            const jsonStr = line.startsWith('data: ') ? line.slice(6) : line;
            if (jsonStr === '[DONE]') continue;
            
            const json = JSON.parse(jsonStr);
            const token = json.message?.content || json.choices?.[0]?.delta?.content || json.response || '';
            
            if (token) {
              fullResponseText += token;
              tokenCount++;
              
              // Check for commands
              const commandMatch = fullResponseText.match(/\[\[(NAVIGATE|THEME):(.*?)]\]/);
              
              if (commandMatch && !hasActionTriggered) {
                const [fullMatch, commandType, arg] = commandMatch;
                fullResponseText = fullResponseText.replace(fullMatch, '').trim();
                this.executeCommand(commandType, arg.trim());
                hasActionTriggered = true;
              }

              // Update UI
              this.messages.update(msgs => {
                const newMsgs = [...msgs];
                const lastIdx = newMsgs.length - 1;
                newMsgs[lastIdx] = { 
                  role: 'assistant', 
                  content: fullResponseText,
                  tokenEstimate: tokenCount
                };
                return newMsgs;
              });
            }
            
            if (json.done) this.isGenerating.set(false);
          } catch {
            // Ignore parse errors
          }
        }
      }

      // Final token estimate update
      this.messages.update(msgs => {
        const newMsgs = [...msgs];
        const lastIdx = newMsgs.length - 1;
        newMsgs[lastIdx].tokenEstimate = this.estimateTokens(fullResponseText);
        return newMsgs;
      });

    } catch (error) {
      console.error('AI Error:', error);
      this.messages.update(msgs => {
        const newMsgs = [...msgs];
        newMsgs[newMsgs.length - 1].content = 'Hệ thống đang bận, vui lòng thử lại.';
        return newMsgs;
      });
    } finally {
      this.isGenerating.set(false);
    }
  }

  // ===== CONTEXT COMPRESSION (Advanced) =====

  /**
   * Summarize old messages when context is full
   * This can be called manually or automatically
   */
  public async compressContext(): Promise<void> {
    const messages = this.messages();
    if (messages.length < 8) return; // Not enough to compress

    // Take first half of messages to summarize
    const toSummarize = messages.slice(0, Math.floor(messages.length / 2));
    const toKeep = messages.slice(Math.floor(messages.length / 2));

    const summaryPrompt = `Tóm tắt cuộc trò chuyện sau trong 2-3 câu ngắn:
${toSummarize.map(m => `${m.role}: ${m.content}`).join('\n')}`;

    try {
      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.MODEL_NAME,
          messages: [{ role: 'user', content: summaryPrompt }],
          stream: false,
          options: { num_predict: 100, temperature: 0.3 }
        }),
      });

      if (response.ok) {
        const data = await response.json();
        const summary = data.message?.content || data.response;
        
        if (summary) {
          const summaryMessage: ChatMessage = {
            role: 'system',
            content: `[Tóm tắt trước đó: ${summary}]`,
            tokenEstimate: this.estimateTokens(summary)
          };
          
          this.messages.set([summaryMessage, ...toKeep]);
        }
      }
    } catch {
      // Fallback: just truncate
      this.messages.set(toKeep);
    }
  }

  // ===== REST OF THE SERVICE (unchanged methods) =====

  public toggleChat(): void {
    this.isOpen.update((v) => !v);
    
    if (this.isOpen()) {
      this.resetSessionTimeout();
      if (!this.modelLoaded() && !this.isModelLoading()) {
        this.loadModel();
      }
    } else {
      this.clearSessionTimeout();
    }
  }

  async loadModel(): Promise<void> {
    if (this.modelLoaded()) return;
    
    this.isModelLoading.set(true);
    this.loadProgress.set('Đang kết nối...');

    try {
      const baseUrl = this.getBaseUrl();
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(baseUrl, {
        method: 'GET',
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok && response.status !== 404) {
        throw new Error(`Server unreachable`);
      }

      await new Promise(resolve => setTimeout(resolve, 500));

      this.modelLoaded.set(true);
      this.loadProgress.set('Sẵn sàng');

      // Pre-cache system prompt
      this.getDynamicSystemPrompt();

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

  public resetChat(): void {
    this.messages.set([]);
    this.contextUsage.set(0);
    if (this.modelLoaded() && this.authService.isLoggedIn()) {
      this.addGreetingMessage();
    }
  }

  private executeCommand(type: string, arg: string): void {
    if (type === 'NAVIGATE') {
      this.triggerNavigation(arg);
    } else if (type === 'THEME') {
      this.triggerThemeAction(arg);
    }
  }

  private triggerNavigation(path: string): void {
    if (this.isNavigating() || this.router.url === path) return;

    if (!this.allowedPaths.includes(path)) {
      console.warn('Navigation blocked:', path);
      return;
    }

    this.isNavigating.set(true);
    
    setTimeout(() => {
      this.router.navigateByUrl(path).then(() => {
        setTimeout(() => this.isNavigating.set(false), 800);
      });
    }, 1000);
  }

  private triggerThemeAction(action: string): void {
    const now = Date.now();
    if (now - this.lastThemeChange < this.THEME_COOLDOWN) return;
    this.lastThemeChange = now;

    const isDark = this.themeService.isDarkTheme();
    const mode = action.toLowerCase();

    if ((mode === 'dark' && !isDark) || (mode === 'light' && isDark) || mode === 'toggle') {
      this.themeService.toggleTheme();
    }
  }

  private addGreetingMessage(): void {
    const user = this.authService.currentUser();
    const name = user?.fullName || 'bạn';
    this.messages.update(msgs => [...msgs, {
      role: 'assistant',
      content: `Chào ${name}! Tôi là IT Assistant. Bạn cần hỗ trợ gì?`,
      tokenEstimate: 25
    }]);
  }

  private scanRoutes(routes: Routes, parentPath: string = ''): { title: string; fullUrl: string; purePath: string; permission?: string }[] {
    let results: { title: string; fullUrl: string; purePath: string; permission?: string }[] = [];

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
          purePath: purePath,
          permission: route.data['permission'] as string | undefined
        });
      }

      if (route.children) {
        results = results.concat(this.scanRoutes(route.children, fullPath));
      }
    }
    return results;
  }

  private checkRoutePermission(route: Route): boolean {
    if (!route.data?.['permission']) return true;
    
    const requiredPerm = route.data['permission'] as string;
    const user = this.authService.currentUser();
    
    if (!user?.permissions) return false;
    return user.permissions.some(p => p.startsWith(requiredPerm));
  }

  private getBaseUrl(): string {
    try {
      const urlObj = new URL(this.apiUrl);
      return `${urlObj.protocol}//${urlObj.host}/`;
    } catch {
      return this.apiUrl;
    }
  }

  private resetSessionTimeout(): void {
    this.clearSessionTimeout();
    this.sessionTimeout = window.setTimeout(() => {
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
}