import { Injectable, signal, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

@Injectable({
  providedIn: 'root'
})
export class LlmService {
  private http = inject(HttpClient);
  
  // [CONFIGURATION] Points to Ollama's standard API endpoint
  private readonly apiUrl = 'http://localhost:11434/v1/chat/completions';
  
  // --- Signals for Reactive UI State ---
  public isModelLoading = signal<boolean>(false);
  public isGenerating = signal<boolean>(false);
  public modelLoaded = signal<boolean>(false); 
  public loadProgress = signal<string>('');
  public messages = signal<ChatMessage[]>([]);

  constructor() {}

  /**
   * Simulates connection to the external server.
   * No heavy download required, just a quick ready check.
   */
  async loadModel(): Promise<void> {
    if (this.modelLoaded()) return;

    this.isModelLoading.set(true);
    this.loadProgress.set('Đang kết nối máy chủ AI...');

    try {
      // Simulate network delay (or perform a real health check ping here)
      await new Promise(resolve => setTimeout(resolve, 800));

      this.modelLoaded.set(true);
      this.loadProgress.set('Đã kết nối!');
      
      if (this.messages().length === 0) {
        this.messages.update(msgs => [
          ...msgs, 
          { role: 'assistant', content: 'Xin chào! Tôi là trợ lý AI trực tuyến (Llama 3). Tôi có thể giúp gì cho bạn?' }
        ]);
      }

    } catch (error) {
      console.error('Connection Error', error);
      this.loadProgress.set('Lỗi: Không thể kết nối máy chủ.');
    } finally {
      this.isModelLoading.set(false);
    }
  }

  /**
   * Sends a user message to the External API and updates the UI.
   */
  async sendMessage(content: string): Promise<void> {
    if (!content.trim()) return;

    // 1. Add User Message to UI
    const userMsg: ChatMessage = { role: 'user', content };
    this.messages.update(msgs => [...msgs, userMsg]);
    this.isGenerating.set(true);

    // 2. Prepare Payload *BEFORE* adding the placeholder to UI
    // This ensures we don't send the "..." message to the AI, which causes 400 Errors
    const apiMessages = this.messages()
      .filter(m => m.role !== 'system')
      .map(m => ({ role: m.role, content: m.content }));

    try {
      // 3. Create placeholder for Assistant response (Visual only)
      const assistantMsg: ChatMessage = { role: 'assistant', content: '...' };
      this.messages.update(msgs => [...msgs, assistantMsg]);

      // 4. Prepare Payload for Ollama
      const payload = {
        model: "llama3", // [IMPORTANT] Must match the model you ran (ollama run llama3)
        messages: apiMessages,
        temperature: 0.7,
        stream: false // Disable streaming for simple HTTP Client handling
      };

      // 5. Send Request to Server
      const response: any = await firstValueFrom(
        this.http.post(this.apiUrl, payload)
      );

      // 6. Extract Response Content
      const reply = response?.choices?.[0]?.message?.content 
                 || 'Không nhận được phản hồi từ máy chủ.';

      // 7. Update UI with actual response (Replace the "...")
      this.messages.update(msgs => {
        const newMsgs = [...msgs];
        newMsgs[newMsgs.length - 1] = { role: 'assistant', content: reply };
        return newMsgs;
      });

    } catch (error: any) {
      console.error('API Error:', error);
      
      // Remove placeholder and show error
      this.messages.update(msgs => {
        const newMsgs = [...msgs];
        newMsgs.pop(); // Remove "..."
        return [
          ...newMsgs, 
          { role: 'system', content: 'Lỗi: Không thể kết nối đến máy chủ AI (400/500). Hãy kiểm tra Ollama đã chạy chưa.' }
        ];
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