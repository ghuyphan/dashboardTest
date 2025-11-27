import { Injectable, signal, inject, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AuthService } from './auth.service';

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

@Injectable({
  providedIn: 'root'
})
export class LlmService {
  private http = inject(HttpClient);
  private authService = inject(AuthService);
  private router = inject(Router);

  // [CONFIGURATION] Points to Ollama's standard API endpoint
  private readonly apiUrl = 'http://localhost:11434/v1/chat/completions';
  
  // --- Signals ---
  public isModelLoading = signal<boolean>(false);
  public isGenerating = signal<boolean>(false);
  public modelLoaded = signal<boolean>(false); 
  public loadProgress = signal<string>('');
  public messages = signal<ChatMessage[]>([]);

  constructor() {}

  /**
   * Builds a dynamic system prompt containing app context.
   */
  private getSystemPrompt(): string {
    const user = this.authService.currentUser();
    const userName = user?.fullName || 'Người dùng';
    const userRole = user?.roles?.join(', ') || 'Nhân viên';
    const currentUrl = this.router.url;

    return `
      QUAN TRỌNG: Bạn là trợ lý AI thông minh của 'Cổng thông tin Hoàn Mỹ'.
      - Luôn luôn trả lời bằng Tiếng Việt.
      - Người dùng hiện tại: ${userName} (Chức vụ: ${userRole}).
      - Người dùng đang đứng ở trang: ${currentUrl}.
      - Hãy trả lời ngắn gọn, chuyên nghiệp và hữu ích.
    `.trim();
  }

  async loadModel(): Promise<void> {
    if (this.modelLoaded()) return;

    this.isModelLoading.set(true);
    this.loadProgress.set('Đang kết nối máy chủ AI...');

    try {
      // Simulate check
      await new Promise(resolve => setTimeout(resolve, 800));

      this.modelLoaded.set(true);
      this.loadProgress.set('Đã kết nối!');
      
      // Add initial greeting if empty
      if (this.messages().length === 0) {
        const user = this.authService.currentUser();
        const greeting = user 
          ? `Xin chào ${user.fullName}! Tôi có thể giúp gì cho bạn hôm nay?` 
          : 'Xin chào! Tôi là trợ lý AI trực tuyến. Tôi có thể giúp gì cho bạn?';

        this.messages.update(msgs => [
          ...msgs, 
          { role: 'assistant', content: greeting }
        ]);
      }

    } catch (error) {
      console.error('Connection Error', error);
      this.loadProgress.set('Lỗi: Không thể kết nối máy chủ.');
    } finally {
      this.isModelLoading.set(false);
    }
  }

  async sendMessage(content: string): Promise<void> {
    if (!content.trim()) return;

    // 1. Add User Message
    const userMsg: ChatMessage = { role: 'user', content };
    this.messages.update(msgs => [...msgs, userMsg]);
    
    // 2. Set Loading State (UI will show "Đang suy nghĩ...")
    this.isGenerating.set(true);

    try {
      // 3. Prepare Payload with System Context
      const contextMessages: ChatMessage[] = [
        { role: 'system', content: this.getSystemPrompt() },
        ...this.messages().filter(m => m.role !== 'system')
      ];

      const payload = {
        model: "llama3", // Ensure this matches your Ollama model
        messages: contextMessages,
        temperature: 0.7,
        stream: false
      };

      const response: any = await firstValueFrom(
        this.http.post(this.apiUrl, payload)
      );

      const reply = response?.choices?.[0]?.message?.content 
                 || 'Xin lỗi, tôi không nhận được phản hồi.';

      // 4. Add Assistant Message
      this.messages.update(msgs => [
        ...msgs, 
        { role: 'assistant', content: reply }
      ]);

    } catch (error: any) {
      console.error('API Error:', error);
      this.messages.update(msgs => [
        ...msgs, 
        { role: 'system', content: 'Lỗi: Không thể kết nối đến máy chủ AI. Vui lòng kiểm tra lại Ollama.' }
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