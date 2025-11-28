import { Injectable, signal, inject } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from './auth.service';
import { NavItem } from '../models/nav-item.model';
import { environment } from '../../../environments/environment.development';

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

@Injectable({
  providedIn: 'root',
})
export class LlmService {
  private authService = inject(AuthService);
  private readonly apiUrl = environment.llmUrl;
  private readonly MAX_HISTORY = 10;

  // --- Signals ---
  public isOpen = signal<boolean>(false);
  public isModelLoading = signal<boolean>(false);
  public isGenerating = signal<boolean>(false);
  public modelLoaded = signal<boolean>(false);
  public loadProgress = signal<string>('');
  public messages = signal<ChatMessage[]>([]);

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
    this.loadProgress.set('Đang kết nối trợ lý ảo...');

    // Simulate connection delay for better UX
    setTimeout(() => {
      this.modelLoaded.set(true);
      this.isModelLoading.set(false);
      this.loadProgress.set('Sẵn sàng');

      if (this.messages().length === 0) {
        this.messages.update((msgs) => [
          ...msgs,
          {
            role: 'assistant',
            content:
              'Xin chào! Tôi là Homi, trợ lý điều hướng của Hoàn Mỹ Portal. Bạn cần tìm chức năng nào hoặc muốn tôi hướng dẫn sử dụng phần nào của hệ thống?',
          },
        ]);
      }
    }, 500);
  }

  async sendMessage(content: string): Promise<void> {
    if (!content.trim()) return;
    
    // 1. Add User Message
    const userMsg: ChatMessage = { role: 'user', content };
    this.messages.update((msgs) => [...msgs, userMsg]);
    
    // 2. Prepare Assistant Message Placeholder
    const aiMsg: ChatMessage = { role: 'assistant', content: '' };
    this.messages.update((msgs) => [...msgs, aiMsg]);
    this.isGenerating.set(true);

    try {
      const recentMessages = this.messages()
        .filter((m) => m !== aiMsg)
        .slice(-this.MAX_HISTORY);

      // 3. Build Payload with "Instruct" System Prompt
      const payload = {
        model: 'gemma3:1b-it-qat', // Assuming this model supports instruct/chat format
        messages: [
          { role: 'system', content: this.getSystemPrompt() },
          ...recentMessages,
        ],
        temperature: 0.2, // Lower temperature for more precise navigation instructions
        stream: true, 
      };

      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) throw new Error('API Request Failed');
      if (!response.body) throw new Error('No response body');

      // 4. Stream Response
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullContent = '';

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
            const token = json.message?.content || json.choices?.[0]?.delta?.content || '';
            
            if (token) {
              fullContent += token;
              this.messages.update((msgs) => {
                const lastIdx = msgs.length - 1;
                if (lastIdx >= 0) {
                  const newMsgs = [...msgs];
                  newMsgs[lastIdx] = { ...newMsgs[lastIdx], content: fullContent };
                  return newMsgs;
                }
                return msgs;
              });
            }
            if (json.done) this.isGenerating.set(false);
          } catch (e) { /* Ignore parse errors in stream */ }
        }
      }
    } catch (error) {
      console.error('AI Stream Error:', error);
      this.messages.update((msgs) => {
        const newMsgs = [...msgs];
        newMsgs[newMsgs.length - 1] = {
          role: 'assistant',
          content: '⚠️ Xin lỗi, tôi đang gặp sự cố kết nối. Vui lòng thử lại sau.',
        };
        return newMsgs;
      });
    } finally {
      this.isGenerating.set(false);
    }
  }

  resetChat(): void {
    this.messages.set([]);
    this.loadModel();
  }

  // --- SYSTEM PROMPT GENERATION ---

  private getSystemPrompt(): string {
    const user = this.authService.currentUser();
    const siteMap = this.generateSiteMap(this.authService.navItems());

    return `
Bạn là "Homi" - Trợ lý ảo chuyên trách hướng dẫn sử dụng và điều hướng cho Hoàn Mỹ Portal.

THÔNG TIN NGƯỜI DÙNG:
- Tên: ${user?.fullName || 'Khách'}
- Vai trò: ${user?.roles.join(', ') || 'N/A'}

CẤU TRÚC HỆ THỐNG (SITEMAP):
${siteMap}

NHIỆM VỤ CỦA BẠN:
1. Hướng dẫn người dùng tìm kiếm chức năng trong menu dựa trên SITEMAP ở trên.
2. Giải thích ngắn gọn công dụng của các màn hình nếu được hỏi (dựa trên tên màn hình).
3. Nếu người dùng hỏi về dữ liệu cụ thể (doanh thu, số lượng...), hãy lịch sự từ chối và hướng dẫn họ đến màn hình báo cáo tương ứng để xem. BẠN KHÔNG CÓ QUYỀN TRUY CẬP DỮ LIỆU MÀN HÌNH.
4. Luôn trả lời bằng Tiếng Việt, ngắn gọn, súc tích và chuyên nghiệp.
5. Nếu chức năng nằm trong menu con, hãy chỉ dẫn rõ ràng: "Vào [Menu Cha] -> [Menu Con]".

VÍ DỤ TRẢ LỜI:
User: "Tôi muốn xem báo cáo doanh thu."
Homi: "Để xem báo cáo doanh thu, bạn vui lòng truy cập: Báo Cáo -> Tổng quan KCB hoặc các mục báo cáo tài chính liên quan trong menu bên trái."
`.trim();
  }

  private generateSiteMap(items: NavItem[], prefix = '- '): string {
    let map = '';
    for (const item of items) {
      map += `${prefix}${item.label} (Link: ${item.link || 'Menu'})\n`;
      if (item.children && item.children.length > 0) {
        map += this.generateSiteMap(item.children, `  ${prefix}`);
      }
    }
    return map;
  }
}