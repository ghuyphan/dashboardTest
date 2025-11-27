import { Injectable, signal, inject } from '@angular/core';
import { Router, NavigationEnd, ActivatedRoute } from '@angular/router';
import { filter, map } from 'rxjs/operators';
import { AuthService } from './auth.service';
import { environment } from '../../../environments/environment.development';

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  isNavigationEvent?: boolean;
}

@Injectable({
  providedIn: 'root',
})
export class LlmService {
  private authService = inject(AuthService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private readonly apiUrl = environment.llmUrl;
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

  public toggleChat(): void {
    this.isOpen.update((v) => !v);
    if (this.isOpen() && !this.modelLoaded() && !this.isModelLoading()) {
      this.loadModel();
    }
  }

  private trackNavigation(): void {
    this.router.events
      .pipe(
        filter((event) => event instanceof NavigationEnd),
        map(() => {
          let child = this.route.root;
          while (child.firstChild) child = child.firstChild;
          return child.snapshot.data['title'] || this.router.url;
        })
      )
      .subscribe((screenName) => {
        this.pageContext.set(''); // Clear context on nav
        if (this.messages().length > 0) {
          const navMessage: ChatMessage = {
            role: 'system',
            content: `Người dùng đã chuyển sang màn hình: "${screenName}".`,
            isNavigationEvent: true,
          };
          this.messages.update((msgs) => [...msgs, navMessage]);
        }
      });
  }

  setPageContext(data: string | object): void {
    if (typeof data === 'string') {
      this.pageContext.set(data);
    } else {
      try {
        this.pageContext.set(JSON.stringify(data, null, 2));
      } catch (e) {
        this.pageContext.set('Lỗi đọc dữ liệu màn hình.');
      }
    }
  }

  private getSystemPrompt(): string {
    const user = this.authService.currentUser();
    const userInfo = user
      ? `User: ${user.fullName} (Role: ${user.roles.join(', ')})`
      : 'User: Khách';

    const now = new Date();
    const timeString = now.toLocaleString('vi-VN');

    return `
<instruction>
  Bạn là trợ lý AI chuyên nghiệp của "Hoàn Mỹ Portal".
  QUY TẮC ỨNG XỬ:
  1. LUÔN trả lời bằng Tiếng Việt một cách trang trọng, lịch sự (sử dụng kính ngữ phù hợp).
  2. Cung cấp thông tin chính xác, ngắn gọn, và đi thẳng vào vấn đề.
  3. Dựa vào dữ liệu được cung cấp trong <current_screen_context> để đưa ra câu trả lời. Nếu không có thông tin, hãy thông báo rõ ràng.
  4. Giữ thái độ chuyên nghiệp và hỗ trợ người dùng tối đa.
</instruction>

<meta>
  Thời gian hiện tại: ${timeString}
  ${userInfo}
</meta>

<current_screen_context>
  ${this.pageContext() || '(Hiện chưa có dữ liệu ngữ cảnh cụ thể)'}
</current_screen_context>
    `.trim();
  }

  async loadModel(): Promise<void> {
    if (this.modelLoaded()) return;
    this.isModelLoading.set(true);
    this.loadProgress.set('Đang kết nối đến hệ thống AI...');

    // Simulate connection check (or ping API)
    setTimeout(() => {
      this.modelLoaded.set(true);
      this.isModelLoading.set(false);
      this.loadProgress.set('Hệ thống đã sẵn sàng');

      if (this.messages().length === 0) {
        this.messages.update((msgs) => [
          ...msgs,
          {
            role: 'assistant',
            content:
              'Xin chào! Tôi là Homi. Tôi có thể hỗ trợ gì cho bạn dựa trên thông tin hiện tại?',
          },
        ]);
      }
    }, 200);
  }

  async sendMessage(content: string): Promise<void> {
    if (!content.trim()) return;

    // 1. Add User Message
    const userMsg: ChatMessage = { role: 'user', content };
    this.messages.update((msgs) => [...msgs, userMsg]);

    // 2. Add Placeholder for AI Response
    const aiMsg: ChatMessage = { role: 'assistant', content: '' };
    this.messages.update((msgs) => [...msgs, aiMsg]);

    this.isGenerating.set(true);

    try {
      const recentMessages = this.messages()
        .filter((m) => !m.isNavigationEvent && m !== aiMsg)
        .slice(-this.MAX_HISTORY);

      const payload = {
        model: 'llama3.1:8b-instruct-q4_K_M',
        messages: [
          { role: 'system', content: this.getSystemPrompt() },
          ...recentMessages,
        ],
        temperature: 0.3,
        stream: true, 
      };

      // 3. Use FETCH instead of HttpClient to handle stream
      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok || !response.body) {
        throw new Error(`Lỗi kết nối máy chủ: ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullContent = '';

      while (true) {
        // Check if user clicked "Stop"
        if (!this.isGenerating()) {
          reader.cancel();
          break;
        }

        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });

        // Parse NDJSON (Newline Delimited JSON)
        const lines = chunk.split('\n').filter((line) => line.trim() !== '');

        for (const line of lines) {
          try {
            // Handle both Ollama Native and OpenAI-compatible formats
            // OpenAI format starts with "data: "
            const jsonStr = line.startsWith('data: ') ? line.slice(6) : line;
            if (jsonStr === '[DONE]') continue;

            const json = JSON.parse(jsonStr);

            // Extract content token
            // 1. Native Ollama: json.message.content
            // 2. OpenAI Format: json.choices[0].delta.content
            const token =
              json.message?.content || json.choices?.[0]?.delta?.content || '';

            if (token) {
              fullContent += token;

              // Update the UI Signal efficiently
              this.messages.update((msgs) => {
                // We modify the LAST message in the array (our placeholder)
                const lastIdx = msgs.length - 1;
                if (lastIdx >= 0) {
                  // Create new array ref to trigger change detection,
                  // but spread existing items for performance
                  const newMsgs = [...msgs];
                  newMsgs[lastIdx] = {
                    ...newMsgs[lastIdx],
                    content: fullContent,
                  };
                  return newMsgs;
                }
                return msgs;
              });
            }

            if (json.done) {
              this.isGenerating.set(false);
            }
          } catch (e) {
            // Ignore parse errors for partial chunks
          }
        }
      }
    } catch (error) {
      console.error('AI Stream Error:', error);
      this.messages.update((msgs) => {
        const newMsgs = [...msgs];
        // Replace the empty placeholder with error message
        newMsgs[newMsgs.length - 1] = {
          role: 'system',
          content:
            '⚠️ Rất tiếc, đã xảy ra sự cố kết nối hoặc lỗi máy chủ. Vui lòng thử lại sau.',
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
}