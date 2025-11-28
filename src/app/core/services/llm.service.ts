import { Injectable, signal, inject } from '@angular/core';
import { Router, Routes } from '@angular/router';
import { AuthService } from './auth.service';
import { ThemeService } from './theme.service';
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
            content: 'Xin chào! Tôi là Homi. Bạn cần tìm chức năng nào của hệ thống?',
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

      const systemPrompt = this.getSystemPrompt();

const payload = {
        model: 'gemma3:4b-it-qat', 
        messages: [
          { role: 'system', content: systemPrompt },
          ...recentMessages,
        ],
        temperature: 1.0, 
        top_p: 0.95,  
        top_k: 64,        
        repeat_penalty: 1.0, 
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
          content: newMsgs[newMsgs.length - 1].content + '\n\n⚠️ *Xin lỗi, tôi đang gặp sự cố kết nối với máy chủ AI.*',
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

  private getSystemPrompt(): string {
    const routeMap = this.extractRoutes(this.router.config);
    const siteMapString = routeMap.map(r => `- [${r.title}](${r.path})`).join('\n');
    const isDark = this.themeService.isDarkTheme();
    const currentUser = this.authService.currentUser();

    // Updated Prompt using XML tags (Recommended for Gemma/Gemini)
    return `
<role>
Bạn là "Homi", trợ lý ảo chuyên nghiệp của Hoàn Mỹ Portal.
Bạn trả lời ngắn gọn, chính xác, sử dụng tiếng Việt thân thiện.
</role>

<user_info>
- Tên: ${currentUser?.fullName || 'Người dùng'}
- Giao diện hiện tại: ${isDark ? 'Tối (Dark Mode)' : 'Sáng (Light Mode)'}
</user_info>

<knowledge_base>
1. **Điều Hướng:** Cung cấp link dạng Markdown: \`[Tên Màn Hình](/duong-dan)\`.
2. **Giao diện:** Người dùng có thể đổi chế độ Sáng/Tối bằng cách bấm vào Avatar góc phải -> Chọn "Chế độ sáng/tối".
3. **Đổi mật khẩu:** Bấm vào Avatar -> Chọn [Cài đặt tài khoản](/app/settings).
4. **Hỗ Trợ Kỹ Thuật:** Hotline IT là 1108 hoặc 1109.
</knowledge_base>

<sitemap>
${siteMapString}
</sitemap>

<instructions>
- Với lời chào đơn giản (xin chào, hi), chỉ trả lời thân thiện và hỏi người dùng cần hỗ trợ gì.
- Chỉ cung cấp danh sách chức năng trong <sitemap> KHI người dùng hỏi rõ ràng.
- Nếu người dùng hỏi cách đi đến một chức năng CỤ THỂ, cung cấp link Markdown tương ứng: \`[Tên](/đường-dẫn)\`.
- **QUAN TRỌNG:** Nếu câu hỏi của người dùng KHÔNG liên quan đến các chức năng trong <sitemap>, <knowledge_base> hoặc cách sử dụng phần mềm (ví dụ: hỏi về kiến thức y khoa chuyên sâu, thời tiết, tin tức, code, hoặc chuyện phếm), hãy trả lời chính xác câu này:
  "Vấn đề này nằm ngoài phạm vi hỗ trợ của tôi. Vui lòng liên hệ bộ phận IT qua hotline 1108 hoặc 1109 để được hỗ trợ."
- **TUYỆT ĐỐI KHÔNG** bịa đặt thông tin (hallucinate) hoặc trả lời những thứ không được quy định.
</instructions>
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