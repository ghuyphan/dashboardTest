import { Injectable, signal, inject } from '@angular/core';
import { Router, Routes } from '@angular/router';
import { AuthService } from './auth.service';
import { ThemeService } from './theme.service';
import { environment } from '../../../environments/environment.development';

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

/**
 * KNOWLEDGE BASE: Ánh xạ URL -> Mô tả nghiệp vụ chi tiết.
 * Giúp AI hiểu "Thêm máy mới" = "Danh mục thiết bị".
 */
const ROUTE_DESCRIPTIONS: Record<string, string> = {
  '/app/home': 'Trang chủ, màn hình chính, dashboard tổng hợp thông tin.',
  '/app/settings': 'Cài đặt tài khoản, đổi mật khẩu, xem thông tin cá nhân.',
  
  // Module Thiết bị
  '/app/equipment/catalog': 'Quản lý danh sách thiết bị y tế. Chức năng: Thêm mới máy móc, Sửa thông tin, Xóa thiết bị, Tìm kiếm theo mã/tên, In mã QR, In biên bản bàn giao.',
  '/app/equipment/dashboard': 'Dashboard thiết bị, biểu đồ thống kê tình trạng máy (hỏng, bảo trì, hoạt động), xem nhanh các thiết bị cần chú ý hoặc sắp hết bảo hành.',
  
  // Module Báo cáo
  '/app/reports/bed-usage': 'Báo cáo công suất giường bệnh. Xem số lượng giường trống, giường đang sử dụng, chờ xuất viện theo từng khoa phòng.',
  '/app/reports/examination-overview': 'Tổng quan khám chữa bệnh (KCB). Thống kê số lượt tiếp nhận, bệnh nhân mới/cũ, BHYT/Viện phí theo ngày/tháng.',
  '/app/reports/missing-medical-records': 'Báo cáo hồ sơ bệnh án (HSBA) thiếu. Dành cho KHTH kiểm tra bác sĩ nào chưa tạo bệnh án, quên làm hồ sơ ngoại trú.',
  '/app/reports/cls-level3': 'Báo cáo hoạt động Cận lâm sàng (CLS) tại khu vực Tầng 3 (Xét nghiệm, X-Quang...).',
  '/app/reports/cls-level6': 'Báo cáo hoạt động Cận lâm sàng (CLS) tại khu vực Tầng 6.',
  '/app/reports/specialty-cls': 'Thống kê chỉ định Cận lâm sàng (CLS) theo từng Chuyên khoa. Xem tỷ lệ chỉ định của các khoa.'
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
  public isNavigating = signal<boolean>(false); // Trạng thái điều hướng

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
    this.loadProgress.set('Đang khởi động trợ lý ảo...');

    // Giả lập kết nối
    setTimeout(() => {
      this.modelLoaded.set(true);
      this.isModelLoading.set(false);
      this.loadProgress.set('Sẵn sàng');

      if (this.messages().length === 0) {
        const user = this.authService.currentUser();
        // Lời chào trung tính hơn
        const greeting = `Xin chào ${user?.fullName || 'bạn'}. Mình là Homi, trợ lý ảo của hệ thống. Bạn cần tìm chức năng hay báo cáo nào?`;
          
        this.messages.update((msgs) => [
          ...msgs,
          { role: 'assistant', content: greeting },
        ]);
      }
    }, 600);
  }

  async sendMessage(content: string): Promise<void> {
    if (!content.trim()) return;
    
    // 1. Add User Message
    this.messages.update((msgs) => [...msgs, { role: 'user', content }]);
    
    // 2. Prepare AI Placeholder
    this.messages.update((msgs) => [...msgs, { role: 'assistant', content: '' }]);
    this.isGenerating.set(true);

    try {
      // 3. Prepare Context & Prompt
      const recentMessages = this.messages()
        .filter((m) => m.content && m.role !== 'assistant') // Filter out empty current placeholder
        .slice(-this.MAX_HISTORY);

      const systemPrompt = this.getSystemPrompt();

      // 4. Call API
      const payload = {
        model: 'gemma3:4b-it-qat', 
        messages: [
          { role: 'system', content: systemPrompt },
          ...recentMessages,
        ],
        temperature: 0.1, // Giữ thấp để câu trả lời chính xác, ít "sáng tạo" lung tung
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
        // Xử lý format data: của các dòng stream (tùy server)
        const lines = chunk.split('\n').filter((line) => line.trim() !== '');

        for (const line of lines) {
          try {
            const jsonStr = line.startsWith('data: ') ? line.slice(6) : line;
            if (jsonStr === '[DONE]') continue;
            
            const json = JSON.parse(jsonStr);
            // Hỗ trợ nhiều format response khác nhau (Ollama, vLLM, etc)
            const token = json.message?.content || json.choices?.[0]?.delta?.content || json.response || '';
            
            if (token) {
              fullText += token;
              
              // --- LOGIC ĐIỀU HƯỚNG TỰ ĐỘNG ---
              // Regex bắt lệnh: [[NAVIGATE:/app/some/path]]
              const navMatch = fullText.match(/\[\[NAVIGATE:(.*?)\]\]/);
              
              if (navMatch) {
                const path = navMatch[1];
                // Xóa lệnh khỏi văn bản hiển thị để user không thấy code lạ
                fullText = fullText.replace(navMatch[0], '').trim();
                
                // Thực thi điều hướng (có animation)
                this.triggerNavigation(path);
              }
              // --------------------------------

              // Cập nhật UI
              this.messages.update((msgs) => {
                const newMsgs = [...msgs];
                const lastIdx = newMsgs.length - 1;
                newMsgs[lastIdx] = { role: 'assistant', content: fullText };
                return newMsgs;
              });
            }
            
            if (json.done) this.isGenerating.set(false);
          } catch (e) { 
            // Bỏ qua lỗi parse JSON từng chunk nhỏ
          }
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
    }
  }

  private triggerNavigation(path: string): void {
    // Debounce: Nếu đang điều hướng rồi thì thôi
    if (this.isNavigating() || this.router.url === path) return;

    this.isNavigating.set(true);
    
    // Delay để user kịp đọc tin nhắn "Mình đang mở..."
    setTimeout(() => {
      this.router.navigateByUrl(path).then(() => {
        // Tắt hiệu ứng sau khi chuyển trang xong
        setTimeout(() => this.isNavigating.set(false), 800);
      });
    }, 1000);
  }

  resetChat(): void {
    this.messages.set([]);
    this.loadModel(); 
  }

  // ========================================================================
  //  PROMPT ENGINEERING - TRÁI TIM CỦA HỆ THỐNG
  // ========================================================================
  
  private getSystemPrompt(): string {
    // 1. Lấy danh sách màn hình user ĐƯỢC PHÉP thấy (đã lọc permission)
    const allowedRoutes = this.extractAuthorizedRoutes(this.router.config);
    
    // 2. Tạo bản đồ chức năng (Context Map)
    const sitemapText = allowedRoutes.map(r => {
      const desc = ROUTE_DESCRIPTIONS[r.path] || 'Chức năng hệ thống.';
      return `- Tên: "${r.title}"\n  URL: ${r.path}\n  Nghiệp vụ: ${desc}`;
    }).join('\n\n');
    
    const currentUser = this.authService.currentUser();

    // 3. Prompt "Thông minh" với cấu trúc XML rõ ràng
    return `
<role>
Bạn là Homi, trợ lý ảo thông minh của hệ thống nội bộ Hoàn Mỹ.
Bạn đang trò chuyện với: ${currentUser?.fullName || 'Người dùng'} (Vai trò: ${currentUser?.roles?.join(', ') || 'N/A'}).
Phong cách: Chuyên nghiệp, ngắn gọn, hữu ích, xưng hô trung tính (bạn/mình hoặc anh/chị).
</role>

<context>
Dưới đây là danh sách các chức năng mà người dùng này CÓ QUYỀN truy cập.
Bạn CHỈ ĐƯỢC phép điều hướng hoặc gợi ý các đường dẫn có trong danh sách này.

${sitemapText}
</context>

<rules>
1. **Ưu tiên điều hướng (Navigation First):**
   - Nếu người dùng hỏi cách làm một việc gì đó (ví dụ: "Thêm máy mới", "Xem báo cáo giường"), hãy phân tích xem nó thuộc "Nghiệp vụ" nào trong <context>.
   - Nếu tìm thấy màn hình phù hợp, hãy trả lời xác nhận và ĐÍNH KÈM lệnh điều hướng đặc biệt ở cuối câu: \`[[NAVIGATE:/duong-dan]]\`.
   - Ví dụ User: "Tôi muốn thêm thiết bị".
   - Homi: "Để thêm thiết bị mới, bạn vào danh mục thiết bị nhé. [[NAVIGATE:/app/equipment/catalog]]"

2. **Xử lý khi không tìm thấy hoặc không có quyền:**
   - Nếu chức năng người dùng hỏi KHÔNG có trong <context> (do họ không có quyền hoặc hệ thống không có), hãy trả lời thật lòng:
   - "Chức năng này không nằm trong quyền truy cập của bạn hoặc chưa được hỗ trợ."
   - Đừng bịa ra đường dẫn ảo.

3. **Hỗ trợ kỹ thuật:**
   - Chỉ hướng dẫn liên hệ IT (hotline 1108) khi người dùng gặp lỗi đăng nhập, lỗi hệ thống, hoặc tài khoản bị khóa. Đừng dùng nó làm câu trả lời mặc định cho mọi thứ.

4. **Ngôn ngữ:** Tiếng Việt tự nhiên, không máy móc.
</rules>
`.trim();
  }

  /**
   * Hàm đệ quy lọc route dựa trên Permission của AuthService.
   * Nếu user không có quyền, route đó sẽ BIẾN MẤT khỏi nhận thức của AI.
   */
  private extractAuthorizedRoutes(routes: Routes, parentPath: string = ''): { title: string; path: string }[] {
    let result: { title: string; path: string }[] = [];

    for (const route of routes) {
      if (route.redirectTo || route.path === '**') continue;

      // Xây dựng full path
      let currentPath = parentPath;
      if (route.path) {
        currentPath = parentPath ? `${parentPath}/${route.path}` : `/${route.path}`;
      }

      // 1. Kiểm tra Permission (Chốt chặn quan trọng nhất)
      if (route.data && route.data['permission']) {
        const requiredPerm = route.data['permission'];
        if (!this.authService.hasPermission(requiredPerm)) {
          // User không có quyền -> Bỏ qua route này -> AI sẽ không biết nó tồn tại
          continue;
        }
      }

      // 2. Chỉ lấy các route là màn hình (có Title)
      if (route.data && route.data['title']) {
        result.push({
          title: route.data['title'] as string,
          path: currentPath
        });
      }

      // 3. Đệ quy lấy route con
      if (route.children) {
        result = result.concat(this.extractAuthorizedRoutes(route.children, currentPath));
      }
    }
    return result;
  }
}