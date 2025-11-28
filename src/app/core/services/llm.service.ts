import { Injectable, signal, inject } from '@angular/core';
import { Router, Routes } from '@angular/router';
import { AuthService } from './auth.service';
import { ThemeService } from './theme.service'; // [1] Import ThemeService
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
  private themeService = inject(ThemeService); // [2] Inject ThemeService
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
    
    const userMsg: ChatMessage = { role: 'user', content };
    this.messages.update((msgs) => [...msgs, userMsg]);
    
    const aiMsg: ChatMessage = { role: 'assistant', content: '' };
    this.messages.update((msgs) => [...msgs, aiMsg]);
    this.isGenerating.set(true);

    try {
      const recentMessages = this.messages()
        .filter((m) => m !== aiMsg)
        .slice(-this.MAX_HISTORY);

      const payload = {
        model: 'gemma3:4b-it-qat', 
        messages: [
          { role: 'system', content: this.getSystemPrompt() },
          ...recentMessages,
        ],
        temperature: 0.1, 
        stream: true, 
      };

      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) throw new Error('API Request Failed');
      if (!response.body) throw new Error('No response body');

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
                if (lastIdx >= 0 && msgs[lastIdx].role === 'assistant') {
                  const newMsgs = [...msgs];
                  newMsgs[lastIdx] = { ...newMsgs[lastIdx], content: fullContent };
                  return newMsgs;
                }
                return msgs;
              });
            }
            if (json.done) this.isGenerating.set(false);
          } catch (e) { }
        }
      }
    } catch (error) {
      console.error('AI Stream Error:', error);
      this.messages.update((msgs) => {
        const newMsgs = [...msgs];
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

  // --- REFINED SYSTEM PROMPT ---

  private getSystemPrompt(): string {
    const routeMap = this.extractRoutes(this.router.config);
    const siteMapString = routeMap.map(r => `- [${r.title}](${r.path})`).join('\n');

    // [3] Determine Dynamic Theme Instruction
    const isDark = this.themeService.isDarkTheme();
    const themeInstruction = isDark 
      ? 'Hiện tại đang là Chế độ Tối. Để chuyển sang Chế độ Sáng, bấm vào Avatar (góc phải trên) -> Chọn "Chế độ sáng".'
      : 'Hiện tại đang là Chế độ Sáng. Để chuyển sang Chế độ Tối, bấm vào Avatar (góc phải trên) -> Chọn "Chế độ tối".';

    return `
### ROLE
Bạn là "Homi" - Trợ lý ảo chuyên nghiệp của Hoàn Mỹ Portal.

### GLOSSARY (Từ điển thuật ngữ)
- **HSBA**: Hồ sơ bệnh án.
- **CLS**: Cận lâm sàng (Xét nghiệm, X-Quang, Siêu âm...).
- **OP / Ngoại trú**: Bệnh nhân khám và về trong ngày.
- **IP / Nội trú**: Bệnh nhân nằm viện.

### SYSTEM KNOWLEDGE (Kiến thức hệ thống)

1. **Điều Hướng (QUAN TRỌNG):**
   - Trả lời bằng Link Markdown: \`[Tên Màn Hình](/duong-dan)\`.
   - Dựa vào danh sách SITEMAP bên dưới để tìm link đúng.

2. **Giao Diện & Tiện Ích:**
   - **Đổi Giao Diện (Theme):** ${themeInstruction}
   - **Đổi Mật Khẩu:** Bấm vào Avatar -> Chọn [Cài đặt tài khoản](/app/settings).
   - **Thanh Footer:** Nút Lưu, In, Xuất Excel luôn nằm ở dưới cùng màn hình.

3. **Hỗ Trợ Kỹ Thuật:**
   - Hotline IT: **1108** hoặc **1109**.

### SITEMAP (Danh sách chức năng)
${siteMapString}

### EXAMPLES
User: "Mở báo cáo HSBA."
Homi: "Dạ, bạn có thể xem tại đây: [Chưa tạo HSBA (OP)](/app/reports/missing-medical-records)."

User: "Tôi muốn xem CLS."
Homi: "Hệ thống có các báo cáo sau:
- [Tầng 3 Khám và CLS](/app/reports/cls-level3)
- [Tầng 6 Khám và CLS](/app/reports/cls-level6)
- [Khám CLS theo chuyên khoa](/app/reports/specialty-cls)"

User: "Giao diện sáng quá, đau mắt."
Homi: "Bạn có thể chuyển sang chế độ tối bằng cách bấm vào Avatar -> Chọn **Chế độ tối**."
`.trim();
  }

  private extractRoutes(routes: Routes, parentPath: string = ''): { title: string; path: string }[] {
    let result: { title: string; path: string }[] = [];

    for (const route of routes) {
      if (route.redirectTo || route.path === '**') continue;

      let currentPath = parentPath;
      if (route.path) {
        currentPath = parentPath ? `${parentPath}/${route.path}` : `/${route.path}`;
      }

      if (route.data && route.data['title']) {
        result.push({
          title: route.data['title'] as string,
          path: currentPath
        });
      }

      if (route.children) {
        result = result.concat(this.extractRoutes(route.children, currentPath));
      }
    }

    return result;
  }
}