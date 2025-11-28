import { Injectable, signal, inject } from '@angular/core';
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
  'settings': 'Thay đổi mật khẩu và xem thông tin tài khoản cá nhân.',
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
  private authService = inject(AuthService);
  private themeService = inject(ThemeService);
  private router = inject(Router);
  
  private readonly apiUrl = environment.llmUrl;
  private readonly MAX_HISTORY = 10;

  // --- Signals ---
  public isOpen = signal<boolean>(false);
  public isModelLoading = signal<boolean>(false);
  public isGenerating = signal<boolean>(false);
  public modelLoaded = signal<boolean>(false);
  public loadProgress = signal<string>('');
  public messages = signal<ChatMessage[]>([]);
  public isNavigating = signal<boolean>(false);

  constructor() {}

  public toggleChat(): void {
    this.isOpen.update((v) => !v);
    if (this.isOpen() && !this.modelLoaded() && !this.isModelLoading()) {
      this.loadModel();
    }
  }

  async loadModel(): Promise<void> {
    if (this.modelLoaded()) return;
    
    this.isModelLoading.set(true);
    this.loadProgress.set('Đang kết nối máy chủ AI...');

    try {
      // Real Ping to wake up the model
      // Using 'gemma:2b' (approx 2B params) for faster init as requested
      const payload = {
        model: 'gemma3:1b-it-qat', 
        messages: [{ role: 'user', content: 'ping' }],
        stream: false 
      };

      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`Init failed with status: ${response.status}`);
      }

      this.modelLoaded.set(true);
      this.loadProgress.set('Sẵn sàng');

      if (this.messages().length === 0) {
        const user = this.authService.currentUser();
        const greeting = `Chào bạn ${user?.fullName || ''}. Tôi là Homi, trợ lý ảo của hệ thống. Bạn cần tôi giúp tìm chức năng nào không?`;
          
        this.messages.update((msgs) => [
          ...msgs,
          { role: 'assistant', content: greeting },
        ]);
      }
    } catch (error) {
      console.error('AI Model Init Error:', error);
      this.loadProgress.set('Kết nối thất bại');
      // Optional: Set modelLoaded to true anyway to allow retries in chat, or keep false to show error state
    } finally {
      this.isModelLoading.set(false);
    }
  }

  async sendMessage(content: string): Promise<void> {
    if (!content.trim()) return;
    
    // 1. Add User Message
    this.messages.update((msgs) => [...msgs, { role: 'user', content }]);
    
    // 2. Prepare AI Placeholder
    this.messages.update((msgs) => [...msgs, { role: 'assistant', content: '' }]);
    this.isGenerating.set(true);

    let hasNavigated = false;

    try {
      // 3. Prepare Context
      const recentMessages = this.messages()
        .filter((m) => !!m.content) // Filter out empty placeholders but keep assistant messages
        .slice(-this.MAX_HISTORY);

      const systemPrompt = this.getDynamicSystemPrompt();

      // 4. Call API
      const payload = {
        model: 'gemma3:4b-it-qat', // Main model for logic
        messages: [
          { role: 'system', content: systemPrompt },
          ...recentMessages,
        ],
        temperature: 0.1,
        top_p: 0.9,
        stream: true, 
      };

      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) throw new Error('Kết nối AI thất bại');

      // 5. Handle Stream
      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response body');

      const decoder = new TextDecoder();
      let fullText = '';

      while (true) {
        if (!this.isGenerating()) {
          reader.cancel();
          break;
        }
        const { done, value } = await reader.read();
        if (done) break;
        
        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n').filter((line) => line.trim() !== '');

        for (const line of lines) {
          try {
            const jsonStr = line.startsWith('data: ') ? line.slice(6) : line;
            if (jsonStr === '[DONE]') continue;
            
            const json = JSON.parse(jsonStr);
            const token = json.message?.content || json.choices?.[0]?.delta?.content || json.response || '';
            
            if (token) {
              fullText += token;
              
              // --- NAVIGATION HANDLING ---
              const navMatch = fullText.match(/\[\[NAVIGATE:(.*?)\]\]/);
              if (navMatch) {
                const path = navMatch[1];
                fullText = fullText.replace(navMatch[0], '').trim();
                
                // Only trigger once per message
                if (!hasNavigated) {
                   this.triggerNavigation(path);
                   hasNavigated = true;
                }
              }
              // ---------------------------

              this.messages.update((msgs: ChatMessage[]) => {
                const newMsgs = [...msgs];
                const lastIdx = newMsgs.length - 1;
                newMsgs[lastIdx] = { role: 'assistant', content: fullText };
                return newMsgs;
              });
            }
            
            if (json.done) this.isGenerating.set(false);
          } catch (e) { }
        }
      }
    } catch (error) {
      console.error('AI Error:', error);
      this.messages.update((msgs) => {
        const newMsgs = [...msgs];
        const lastMsg = newMsgs[newMsgs.length - 1];
        lastMsg.content += '\n\n*(Hệ thống đang bận, vui lòng thử lại sau)*';
        return newMsgs;
      });
    } finally {
      this.isGenerating.set(false);

      // [FIX] Cleanup Context on Navigation
      // If navigation occurred, remove the instruction and response from history 
      // after a delay so the user sees the action but history stays clean.
      if (hasNavigated) {
        setTimeout(() => {
          this.messages.update((msgs) => {
            // Remove the last 2 messages (User Command + AI Response)
            if (msgs.length >= 2) {
              return msgs.slice(0, msgs.length - 2);
            }
            return msgs;
          });
        }, 2000); // Wait 2s (animation time) before cleaning up
      }
    }
  }

  private triggerNavigation(path: string): void {
    if (this.isNavigating() || this.router.url === path) return;

    this.isNavigating.set(true);
    
    setTimeout(() => {
      this.router.navigateByUrl(path).then(() => {
        setTimeout(() => this.isNavigating.set(false), 800);
      });
    }, 1000);
  }

  resetChat(): void {
    this.messages.set([]);
    // Don't need to reload model if already loaded, just clear msgs
    if (!this.modelLoaded()) {
        this.loadModel();
    } else {
        // Re-add greeting
        const user = this.authService.currentUser();
        this.messages.set([{ 
            role: 'assistant', 
            content: `Chào bạn ${user?.fullName || ''}. Tôi là Homi, trợ lý ảo của hệ thống. Bạn cần tôi giúp tìm chức năng nào không?` 
        }]);
    }
  }
  
  private getDynamicSystemPrompt(): string {
    const currentUser = this.authService.currentUser();
    const accessibleRoutes = this.scanRoutes(this.router.config);

    const sitemapText = accessibleRoutes.map(r => {
      const desc = this.getDescriptionForPath(r.purePath) || 'Chức năng hệ thống.';
      return `- Tên màn hình: "${r.title}"\n  URL: ${r.fullUrl}\n  Mô tả: ${desc}`;
    }).join('\n\n');
    
    return `
<role>
Bạn là Homi, trợ lý ảo của hệ thống nội bộ Hoàn Mỹ.
Bạn đang trò chuyện với: ${currentUser?.fullName || 'Người dùng'}.
Xưng hô: Hãy dùng "tôi" (thay cho mình/em) và "bạn" (thay cho anh/chị).
Phong cách: Ngắn gọn, đi thẳng vào vấn đề, hỗ trợ nhiệt tình.
</role>

<context>
Dưới đây là danh sách các màn hình mà người dùng này ĐƯỢC PHÉP truy cập.
Bạn CHỈ ĐƯỢC phép điều hướng tới các đường dẫn trong danh sách này.

${sitemapText}
</context>

<rules>
1. **Điều hướng (Navigation):**
   - Nếu người dùng hỏi cách làm việc gì đó thuộc danh sách <context>, hãy hướng dẫn và đính kèm lệnh: \`[[NAVIGATE:/duong-dan]]\`.
   - Ví dụ: "Tôi muốn xem báo cáo giường" -> "Bạn có thể xem tại màn hình công suất giường. [[NAVIGATE:/app/reports/bed-usage]]"

2. **Bảo mật (Security):**
   - Nếu người dùng hỏi về một chức năng KHÔNG có trong danh sách <context>, nghĩa là họ KHÔNG CÓ QUYỀN.
   - Hãy trả lời: "Chức năng này không nằm trong quyền truy cập của bạn hoặc không tồn tại."
   - Tuyệt đối không bịa ra đường dẫn.

3. **Lỗi kỹ thuật:**
   - Nếu gặp vấn đề tài khoản/lỗi hệ thống, hướng dẫn gọi IT: 1108 / 1109.
</rules>
`.trim();
  }

  private scanRoutes(routes: Routes, parentPath: string = ''): { title: string; fullUrl: string; purePath: string }[] {
    let results: { title: string; fullUrl: string; purePath: string }[] = [];

    for (const route of routes) {
      if (route.redirectTo || route.path === '**') continue;

      const fullPath = parentPath ? `${parentPath}/${route.path}` : `/${route.path}`;
      const purePath = fullPath.startsWith('/app/') ? fullPath.substring(5) : (fullPath.startsWith('/') ? fullPath.substring(1) : fullPath);

      if (!this.checkRoutePermission(route)) {
        continue;
      }

      if (route.data && route.data['title']) {
        results.push({
          title: route.data['title'] as string,
          fullUrl: fullPath,
          purePath: purePath
        });
      }

      if (route.children) {
        results = results.concat(this.scanRoutes(route.children, fullPath));
      }
    }
    return results;
  }

  private checkRoutePermission(route: Route): boolean {
    if (!route.data || !route.data['permission']) {
      return true;
    }
    const requiredPerm = route.data['permission'] as string;
    const user = this.authService.currentUser();
    if (!user || !user.permissions) return false;
    return user.permissions.some(userPerm => userPerm.startsWith(requiredPerm));
  }

  private getDescriptionForPath(path: string): string | null {
    if (SCREEN_DESCRIPTIONS[path]) return SCREEN_DESCRIPTIONS[path];
    const key = Object.keys(SCREEN_DESCRIPTIONS).find(k => path.includes(k));
    return key ? SCREEN_DESCRIPTIONS[key] : null;
  }
}