import { Injectable, signal, inject, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router, NavigationEnd, ActivatedRoute } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { filter, map } from 'rxjs/operators';
import { AuthService } from './auth.service';
import { environment } from '../../../environments/environment.development';

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  isNavigationEvent?: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class LlmService {
  private http = inject(HttpClient);
  private authService = inject(AuthService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  private readonly apiUrl = environment.llmUrl; // Đảm bảo URL là: http://localhost:11434/api/chat
  private readonly MAX_HISTORY = 10; 

  // --- Signals ---
  public isOpen = signal<boolean>(false); 
  public isModelLoading = signal<boolean>(false);
  public isGenerating = signal<boolean>(false);
  public modelLoaded = signal<boolean>(false);
  public loadProgress = signal<string>('');
  
  public messages = signal<ChatMessage[]>([]);
  public pageContext = signal<string>('');

  constructor() {
    this.trackNavigation();
  }

  /**
   * Toggle the chat window visibility.
   */
  public toggleChat(): void {
    this.isOpen.update(v => !v);
    
    if (this.isOpen() && !this.modelLoaded() && !this.isModelLoading()) {
      this.loadModel();
    }
  }

  /**
   * Automatically tracks route changes to update context and inject system events.
   */
  private trackNavigation(): void {
    this.router.events.pipe(
      filter(event => event instanceof NavigationEnd),
      map(() => {
        let child = this.route.root;
        while (child.firstChild) child = child.firstChild;
        return child.snapshot.data['title'] || this.router.url;
      })
    ).subscribe((screenName) => {
      this.pageContext.set('');

      if (this.messages().length > 0) {
        const navMessage: ChatMessage = {
          role: 'system',
          content: `Người dùng đã chuyển sang màn hình: "${screenName}".`,
          isNavigationEvent: true
        };
        this.messages.update(msgs => [...msgs, navMessage]);
      }
    });
  }

  setPageContext(data: string | object): void {
    if (typeof data === 'string') {
      this.pageContext.set(data);
    } else {
      try {
        const formatted = JSON.stringify(data, null, 2);
        this.pageContext.set(formatted);
      } catch (e) {
        this.pageContext.set('Lỗi: Không thể đọc dữ liệu màn hình.');
      }
    }
  }

  private getSystemPrompt(): string {
    const user = this.authService.currentUser();
    const userInfo = user 
      ? `User: ${user.fullName} (Role: ${user.roles.join(', ')})`
      : 'User: Khách';
    
    const contextData = this.pageContext();

    // [NEW] Calculate current time in Vietnamese format
    const now = new Date();
    const timeString = now.toLocaleString('vi-VN', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });

    return `
<instruction>
  Bạn là trợ lý AI của "Hoàn Mỹ Portal".
  QUY TẮC BẮT BUỘC:
  1. CHỈ TRẢ LỜI BẰNG TIẾNG VIỆT.
  2. Trả lời ngắn gọn, chuyên nghiệp.
  3. Sử dụng dữ liệu trong <current_screen_context> để trả lời. Nếu không có thông tin, hãy nói rõ.
</instruction>

<current_time>
  ${timeString}
</current_time>

<user_info>
  ${userInfo}
</user_info>

<current_screen_context>
  ${contextData ? contextData : '(Người dùng đang ở trang chủ hoặc chưa có dữ liệu cụ thể)'}
</current_screen_context>
    `.trim();
  }

  async loadModel(): Promise<void> {
    if (this.modelLoaded()) return;

    this.isModelLoading.set(true);
    this.loadProgress.set('Đang kết nối máy chủ AI...');

    try {
      // Giả lập delay kết nối (hoặc có thể gọi API check status thực tế)
      await new Promise(resolve => setTimeout(resolve, 800));
      
      this.modelLoaded.set(true);
      this.loadProgress.set('Đã kết nối!');
      
      if (this.messages().length === 0) {
        this.messages.update(msgs => [
          ...msgs, 
          { role: 'assistant', content: 'Xin chào! Tôi có thể giúp gì với dữ liệu trên màn hình này?' }
        ]);
      }
    } catch (error) {
      console.error('LLM Connection Error', error);
      this.loadProgress.set('Lỗi kết nối.');
    } finally {
      this.isModelLoading.set(false);
    }
  }

  async sendMessage(content: string): Promise<void> {
    if (!content.trim()) return;

    const userMsg: ChatMessage = { role: 'user', content };
    this.messages.update(msgs => [...msgs, userMsg]);
    this.isGenerating.set(true);

    try {
      const recentMessages = this.messages()
        .filter(m => !m.isNavigationEvent)
        .slice(-this.MAX_HISTORY);

      const payload = {
        model: "llama3.1:8b-instruct-q4_K_M", // [UPDATED] Sử dụng alias bạn đã tạo
        messages: [
          { role: 'system', content: this.getSystemPrompt() },
          ...recentMessages
        ],
        temperature: 0.3,
        stream: false
      };

      const response: any = await firstValueFrom(
        this.http.post(this.apiUrl, payload)
      );

      // [UPDATED] Xử lý response cho cả 2 trường hợp (Ollama native API và OpenAI compatible)
      // Ollama native trả về: response.message.content
      // OpenAI format trả về: response.choices[0].message.content
      const reply = response?.message?.content || 
                    response?.choices?.[0]?.message?.content || 
                    'Xin lỗi, tôi không có câu trả lời.';

      this.messages.update(msgs => [
        ...msgs, 
        { role: 'assistant', content: reply }
      ]);

    } catch (error) {
      console.error('AI Error:', error);
      this.messages.update(msgs => [
        ...msgs, 
        { role: 'system', content: '⚠️ Lỗi kết nối đến máy chủ AI.' }
      ]);
    } finally {
      this.isGenerating.set(false);
    }
  }

  resetChat(): void {
    this.messages.set([]);
    this.loadModel();
  }
}