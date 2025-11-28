import { Injectable, signal, inject } from '@angular/core';
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

    setTimeout(() => {
      this.modelLoaded.set(true);
      this.isModelLoading.set(false);
      this.loadProgress.set('Sẵn sàng');

      if (this.messages().length === 0) {
        this.messages.update((msgs) => [
          ...msgs,
          {
            role: 'assistant',
            content: 'Xin chào! Tôi là Homi. Bạn cần tìm chức năng nào hoặc muốn tôi hướng dẫn sử dụng phần nào của hệ thống?',
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
    
    // 2. Add Assistant Placeholder (Empty initially)
    const aiMsg: ChatMessage = { role: 'assistant', content: '' };
    this.messages.update((msgs) => [...msgs, aiMsg]);
    this.isGenerating.set(true);

    try {
      const recentMessages = this.messages()
        .filter((m) => m !== aiMsg) // Don't send the empty placeholder
        .slice(-this.MAX_HISTORY);

      // 3. Optimised Prompt for Gemma 3 Instruct
      const payload = {
        model: 'gemma3:1b-it-qat', 
        messages: [
          { role: 'system', content: this.getSystemPrompt() },
          ...recentMessages,
        ],
        temperature: 0.2, // Low temp for precise navigation instructions
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
                // Only update if the last message is actually the assistant's placeholder
                if (lastIdx >= 0 && msgs[lastIdx].role === 'assistant') {
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
        // Replace placeholder with error if it failed mid-stream or at start
        newMsgs[newMsgs.length - 1] = {
          role: 'assistant',
          content: newMsgs[newMsgs.length - 1].content + '\n\n⚠️ *Xin lỗi, tôi đang gặp sự cố kết nối.*',
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

  // --- PROMPT ENGINEERING ---

  private getSystemPrompt(): string {
    const user = this.authService.currentUser();
    const siteMap = this.generateSiteMap(this.authService.navItems());

    return `
### ROLE
Bạn là "Homi" - Trợ lý ảo chuyên nghiệp của Hoàn Mỹ Portal. Nhiệm vụ của bạn là hỗ trợ người dùng điều hướng hệ thống và giải thích chức năng.

### USER INFO
- Tên: ${user?.fullName || 'Người dùng'}
- Vai trò: ${user?.roles.join(', ') || 'N/A'}

### SYSTEM NAVIGATION (SITEMAP)
Dưới đây là danh sách DUY NHẤT các chức năng và đường dẫn (URL) có sẵn trong hệ thống này:
${siteMap}

### INSTRUCTIONS
1. **Điều hướng:** Khi người dùng hỏi về một chức năng, hãy kiểm tra kỹ SITEMAP ở trên.
   - Nếu chức năng CÓ trong Sitemap: Cung cấp link Markdown: \`[Tên Chức Năng](/duong-dan)\`.
   - Nếu chức năng KHÔNG có trong Sitemap: Hãy trả lời thật thà là bạn không tìm thấy chức năng đó trong menu của họ.
   - **TUYỆT ĐỐI KHÔNG** tự bịa ra đường dẫn không có trong Sitemap (ví dụ: không được bịa ra /finance, /billing nếu không có).

2. **Định dạng:** Sử dụng **Markdown** để làm câu trả lời dễ đọc (in đậm, danh sách bullet point).

3. **Giới hạn:** - KHÔNG bịa ra dữ liệu thực tế (doanh thu, số lượng).
   - Trả lời ngắn gọn, súc tích bằng Tiếng Việt.

### EXAMPLE INTERACTION
User: "Tôi muốn xem báo cáo giường bệnh."
Homi: "Bạn có thể xem chi tiết tại màn hình [Công suất giường bệnh](/app/reports/bed-usage)."

User: "Tôi muốn xem bảng lương."
Homi: "Xin lỗi, tôi không tìm thấy chức năng xem bảng lương trong menu hệ thống của bạn."
`.trim();
  }

  private generateSiteMap(items: NavItem[], prefix = '- '): string {
    let map = '';
    for (const item of items) {
      const linkInfo = item.link ? `(Link: ${item.link})` : '(Menu cha)';
      map += `${prefix}${item.label} ${linkInfo}\n`;
      if (item.children && item.children.length > 0) {
        map += this.generateSiteMap(item.children, `  ${prefix}`);
      }
    }
    return map;
  }
}