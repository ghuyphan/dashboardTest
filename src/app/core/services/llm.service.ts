import { Injectable, signal, inject, effect } from '@angular/core';
import { Router, Routes, Route } from '@angular/router';
import { AuthService } from './auth.service';
import { ThemeService } from './theme.service';
import { environment } from '../../../environments/environment.development';

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

const SCREEN_DESCRIPTIONS: Record<string, string> = {
  'home': 'Màn hình chính, xem thống kê tổng quan nhanh.',
  'settings': 'Cài đặt tài khoản, thay đổi mật khẩu và xem thông tin cá nhân.',
  'equipment/catalog': 'Quản lý danh sách máy móc, thêm/sửa/xóa thiết bị, in mã QR, biên bản bàn giao.',
  'equipment/dashboard': 'Dashboard thiết bị, biểu đồ thống kê tình trạng máy (hỏng, bảo trì, hoạt động).',
  'reports/bed-usage': 'Xem công suất giường bệnh, số lượng giường trống/đang dùng theo khoa.',
  'reports/examination-overview': 'Tổng quan khám chữa bệnh, thống kê lượt tiếp nhận, BHYT/Viện phí.',
  'reports/missing-medical-records': 'Báo cáo kiểm tra các bác sĩ chưa hoàn tất hồ sơ bệnh án (HSBA).',
  'reports/cls-level3': 'Báo cáo hoạt động Cận lâm sàng (CLS) khu vực Tầng 3.',
  'reports/cls-level6': 'Báo cáo hoạt động Cận lâm sàng (CLS) khu vực Tầng 6.',
  'reports/specialty-cls': 'Thống kê chỉ định CLS theo từng Chuyên khoa.'
};

@Injectable({
  providedIn: 'root',
})
export class LlmService {
  private readonly authService = inject(AuthService);
  private readonly themeService = inject(ThemeService);
  private readonly router = inject(Router);
  
  private readonly apiUrl = environment.llmUrl;
  private readonly MAX_HISTORY = 10;
  private readonly MODEL_NAME = 'gemma3:4b-it-qat';

  // --- Signals ---
  public isOpen = signal<boolean>(false);
  public isModelLoading = signal<boolean>(false);
  public isGenerating = signal<boolean>(false);
  public modelLoaded = signal<boolean>(false);
  public loadProgress = signal<string>('');
  public messages = signal<ChatMessage[]>([]);
  public isNavigating = signal<boolean>(false);

  constructor() {
    // Automatically reset chat state when user logs out
    effect(() => {
      if (!this.authService.isLoggedIn()) {
        this.resetChat();
        this.isOpen.set(false);
      }
    });
  }

  public toggleChat(): void {
    this.isOpen.update((v) => !v);
    if (this.isOpen() && !this.modelLoaded() && !this.isModelLoading()) {
      this.loadModel();
    }
  }

  /**
   * Checks server availability before enabling chat.
   * Uses a lightweight GET request to the base URL.
   */
  async loadModel(): Promise<void> {
    if (this.modelLoaded()) return;
    
    this.isModelLoading.set(true);
    this.loadProgress.set('Đang kết nối máy chủ...');

    try {
      const baseUrl = this.getBaseUrl();
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(baseUrl, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      // Accept 200 (OK) or 404 (Not Found) as proof of life from the server
      if (!response.ok && response.status !== 200 && response.status !== 404) {
         throw new Error(`Server unreachable: ${response.status}`);
      }

      // Small delay for better UX transition
      await new Promise(resolve => setTimeout(resolve, 1000));

      this.modelLoaded.set(true);
      this.loadProgress.set('Sẵn sàng');

      if (this.messages().length === 0) {
        this.addGreetingMessage();
      }
    } catch (error) {
      console.error('AI Server Connection Error:', error);
      this.loadProgress.set('Không tìm thấy máy chủ AI');
    } finally {
      this.isModelLoading.set(false);
    }
  }

  async sendMessage(content: string): Promise<void> {
    if (!content.trim()) return;
    
    // 1. Update UI with user message immediately
    this.updateMessages({ role: 'user', content });
    this.updateMessages({ role: 'assistant', content: '' }); // Placeholder
    this.isGenerating.set(true);

    let hasActionTriggered = false;

    try {
      // 2. Build context window
      const contextMessages = this.messages()
        .filter(m => !!m.content)
        .slice(-this.MAX_HISTORY);

      const systemPrompt = this.getDynamicSystemPrompt();

      // 3. Prepare request payload
      const payload = {
        model: this.MODEL_NAME,
        messages: [
          { role: 'system', content: systemPrompt },
          ...contextMessages,
        ],
        temperature: 0.1,
        top_p: 0.9,
        top_k: 40,
        repeat_penalty: 1.1,
        stream: true, 
      };

      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) throw new Error('Failed to connect to AI service');
      if (!response.body) throw new Error('No response body received');

      // 4. Process the stream
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullResponseText = '';

      while (true) {
        if (!this.isGenerating()) {
          reader.cancel();
          break;
        }
        
        const { done, value } = await reader.read();
        if (done) break;
        
        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n').filter(line => line.trim() !== '');

        for (const line of lines) {
          try {
            const jsonStr = line.startsWith('data: ') ? line.slice(6) : line;
            if (jsonStr === '[DONE]') continue;
            
            const json = JSON.parse(jsonStr);
            const token = json.message?.content || json.choices?.[0]?.delta?.content || json.response || '';
            
            if (token) {
              fullResponseText += token;
              
              // Check for commands (Navigation or Theme)
              const commandMatch = fullResponseText.match(/\[\[(NAVIGATE|THEME):(.*?)]\]/);
              
              if (commandMatch) {
                const [fullMatch, commandType, arg] = commandMatch;
                
                // Hide command from UI
                fullResponseText = fullResponseText.replace(fullMatch, '').trim();
                
                // Execute command (once per message)
                if (!hasActionTriggered) {
                   this.executeCommand(commandType, arg.trim());
                   hasActionTriggered = true;
                }
              }

              // Update the last assistant message in real-time
              this.messages.update(msgs => {
                const newMsgs = [...msgs];
                const lastIdx = newMsgs.length - 1;
                newMsgs[lastIdx] = { role: 'assistant', content: fullResponseText };
                return newMsgs;
              });
            }
            
            if (json.done) this.isGenerating.set(false);
          } catch (e) {
            // Ignore JSON parse errors for partial chunks
          }
        }
      }
    } catch (error) {
      console.error('AI Generation Error:', error);
      this.messages.update(msgs => {
        const newMsgs = [...msgs];
        const lastMsg = newMsgs[newMsgs.length - 1];
        lastMsg.content += '\n\n*(Hệ thống đang bận, vui lòng thử lại sau)*';
        return newMsgs;
      });
    } finally {
      this.isGenerating.set(false);
    }
  }

  /**
   * Helper to add messages to the signal state
   */
  private updateMessages(msg: ChatMessage): void {
    this.messages.update(current => [...current, msg]);
  }

  /**
   * Resets the chat history. If user is logged in, adds the greeting again.
   */
  public resetChat(): void {
    this.messages.set([]);
    if (this.modelLoaded() && this.authService.isLoggedIn()) {
        this.addGreetingMessage();
    }
  }

  /**
   * Executes parsed commands from the LLM
   */
  private executeCommand(type: string, arg: string): void {
    if (type === 'NAVIGATE') {
      this.triggerNavigation(arg);
    } else if (type === 'THEME') {
      this.triggerThemeAction(arg);
    }
  }

  private triggerNavigation(path: string): void {
    if (this.isNavigating() || this.router.url === path) return;

    this.isNavigating.set(true);
    
    // Artificial delay to show the "Warp" animation
    setTimeout(() => {
      this.router.navigateByUrl(path).then(() => {
        setTimeout(() => this.isNavigating.set(false), 800);
      });
    }, 1000);
  }

  private triggerThemeAction(action: string): void {
    const isDark = this.themeService.isDarkTheme();
    const mode = action.toLowerCase();

    if (mode === 'dark' && !isDark) {
      this.themeService.toggleTheme();
    } else if (mode === 'light' && isDark) {
      this.themeService.toggleTheme();
    } else if (mode === 'toggle') {
      this.themeService.toggleTheme();
    }
  }

  private addGreetingMessage(): void {
    const user = this.authService.currentUser();
    const name = user?.fullName || 'bạn';
    const greeting = `Chào ${name}. Tôi là Trợ lý IT Assistant. Bạn cần hỗ trợ tìm kiếm chức năng nào?`;
    this.updateMessages({ role: 'assistant', content: greeting });
  }
  
  private getDynamicSystemPrompt(): string {
    const currentUser = this.authService.currentUser();
    const accessibleRoutes = this.scanRoutes(this.router.config);
    const today = this.getFormattedDate();

    // Generate sitemap for context
    const sitemapText = accessibleRoutes.map(r => {
      const desc = this.getDescriptionForPath(r.purePath) || 'Chức năng hệ thống.';
      const permInfo = r.permission ? ` [Code: ${r.permission}]` : '';
      return `- Tên: "${r.title}"${permInfo} | URL: ${r.fullUrl} | Mô tả: ${desc}`;
    }).join('\n');
    
    return `
<role>
Bạn là Trợ lý IT Assistant của hệ thống nội bộ Hoàn Mỹ.
Người dùng hiện tại: ${currentUser?.fullName || 'Nặc danh'}.
Thời gian hiện tại: ${today}.
Phong cách trả lời: Ngắn gọn, chuyên nghiệp, đi thẳng vào vấn đề.
</role>

<context>
Danh sách các màn hình mà người dùng này ĐƯỢC PHÉP truy cập:
${sitemapText}
</context>

<rules>
1. **Điều hướng (Navigation):**
   - Nếu người dùng hỏi về chức năng có trong <context>, hãy hướng dẫn và đính kèm lệnh điều hướng ở cuối câu trả lời: \`[[NAVIGATE:/url]]\`.
   - Nếu người dùng nhắc đến **Mã Quyền** (ví dụ "KHTH.ChuaTaoHSBA"), hãy tìm mã đó trong <context> và điều hướng tương ứng.
   - **Đổi mật khẩu:** Luôn hướng dẫn vào trang Cài đặt. \`[[NAVIGATE:/app/settings]]\`
   - Ví dụ: "Xem công suất giường" -> "Đang mở màn hình công suất giường. [[NAVIGATE:/app/reports/bed-usage]]"

2. **Giao diện (Theme):**
   - Hỗ trợ đổi giao diện bằng lệnh:
     - Chế độ tối: \`[[THEME:dark]]\`
     - Chế độ sáng: \`[[THEME:light]]\`
     - Đảo ngược: \`[[THEME:toggle]]\`
   - Ví dụ: "Bật chế độ tối" -> "Đã chuyển sang giao diện tối. [[THEME:dark]]"

3. **Bảo mật (Security):**
   - Nếu người dùng hỏi về một chức năng KHÔNG có trong danh sách <context> (và không phải là yêu cầu đổi giao diện), hãy từ chối.
   - Trả lời: "Chức năng này không nằm trong quyền truy cập của bạn hoặc không tồn tại."
   - **TUYỆT ĐỐI KHÔNG** tự bịa ra đường dẫn URL không có trong context.

4. **Hỗ trợ kỹ thuật:**
   - Nếu gặp lỗi hệ thống, hướng dẫn liên hệ IT qua hotline: 1108 hoặc 1109.
</rules>
`.trim();
  }

  /**
   * Recursively scans the router configuration to build a list of accessible routes.
   */
  private scanRoutes(routes: Routes, parentPath: string = ''): { title: string; fullUrl: string; purePath: string, permission?: string }[] {
    let results: { title: string; fullUrl: string; purePath: string, permission?: string }[] = [];

    for (const route of routes) {
      if (route.redirectTo || route.path === '**') continue;

      const pathPart = route.path || '';
      const fullPath = parentPath ? `${parentPath}/${pathPart}` : `/${pathPart}`;
      
      // Clean path for description matching (remove /app/ prefix if exists)
      const purePath = fullPath.startsWith('/app/') ? fullPath.substring(5) : (fullPath.startsWith('/') ? fullPath.substring(1) : fullPath);

      if (!this.checkRoutePermission(route)) {
        continue;
      }

      if (route.data && route.data['title']) {
        const permission = route.data['permission'] as string | undefined;
        
        results.push({
          title: route.data['title'] as string,
          fullUrl: fullPath,
          purePath: purePath,
          permission: permission
        });
      }

      if (route.children) {
        results = results.concat(this.scanRoutes(route.children, fullPath));
      }
    }
    return results;
  }

  private checkRoutePermission(route: Route): boolean {
    // Public routes are always allowed
    if (!route.data || !route.data['permission']) {
      return true;
    }
    const requiredPerm = route.data['permission'] as string;
    const user = this.authService.currentUser();
    
    if (!user || !user.permissions) return false;
    
    // Check if user has any permission that starts with the required permission string
    return user.permissions.some(userPerm => userPerm.startsWith(requiredPerm));
  }

  private getDescriptionForPath(path: string): string | null {
    if (SCREEN_DESCRIPTIONS[path]) return SCREEN_DESCRIPTIONS[path];
    // Fuzzy match for paths with IDs (e.g. equipment/catalog/123)
    const key = Object.keys(SCREEN_DESCRIPTIONS).find(k => path.includes(k));
    return key ? SCREEN_DESCRIPTIONS[key] : null;
  }

  private getFormattedDate(): string {
    const now = new Date();
    return new Intl.DateTimeFormat('vi-VN', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(now);
  }

  private getBaseUrl(): string {
    try {
      const urlObj = new URL(this.apiUrl);
      return `${urlObj.protocol}//${urlObj.host}/`;
    } catch (e) {
      return this.apiUrl;
    }
  }
}