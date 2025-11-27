import { Injectable, signal } from '@angular/core';
import { CreateMLCEngine, MLCEngine, InitProgressCallback, InitProgressReport } from '@mlc-ai/web-llm';

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

@Injectable({
  providedIn: 'root'
})
export class LlmService {
  // We use Gemma-2b because it is lightweight (~1.5GB) and runs well in browsers.
  // You can switch this to 'Llama-3-8B-Instruct-q4f32_1-MLC' for a smarter but heavier model.
private selectedModel = 'gemma-2b-it-q4f32_1-MLC';
  
  private engine: MLCEngine | null = null;

  // --- Signals for Reactive UI State ---
  public isModelLoading = signal<boolean>(false);
  public isGenerating = signal<boolean>(false);
  public modelLoaded = signal<boolean>(false);
  public loadProgress = signal<string>('');
  public messages = signal<ChatMessage[]>([]);

  constructor() {}

  /**
   * Initializes the WebLLM engine. This downloads the model weights (~1.5GB) 
   * and caches them in the browser Cache Storage.
   */
async loadModel(): Promise<void> {
    if (this.engine) return; 

    this.isModelLoading.set(true);
    this.loadProgress.set('Đang khởi tạo WebGPU...');

    try {
      const initProgressCallback: InitProgressCallback = (report: InitProgressReport) => {
        this.loadProgress.set(report.text);
      };

      this.engine = await CreateMLCEngine(
        this.selectedModel,
        { initProgressCallback }
      );

      this.modelLoaded.set(true);
      this.loadProgress.set('Mô hình đã sẵn sàng!');
      
      this.messages.update(msgs => [
        ...msgs, 
        { role: 'assistant', content: 'Xin chào! Tôi là trợ lý AI chạy trực tiếp trên trình duyệt của bạn. Tôi có thể giúp gì cho bạn?' }
      ]);

    } catch (error: any) {
      console.error('WebLLM Load Error:', error);
      
      // Specific handling for QuotaExceededError
      if (error.name === 'QuotaExceededError' || error.message?.includes('Quota exceeded')) {
        this.loadProgress.set('Lỗi: Bộ nhớ trình duyệt đã đầy. Vui lòng xóa cache (Application > Clear site data) và thử lại.');
      } else {
        this.loadProgress.set('Lỗi: Không thể tải mô hình. Vui lòng kiểm tra WebGPU hoặc kết nối mạng.');
      }
    } finally {
      this.isModelLoading.set(false);
    }
  }

  /**
   * Sends a user message to the LLM and streams the response back.
   */
  async sendMessage(content: string): Promise<void> {
    if (!this.engine || !content.trim()) return;

    // 1. Add User Message to Chat
    const userMsg: ChatMessage = { role: 'user', content };
    this.messages.update(msgs => [...msgs, userMsg]);
    this.isGenerating.set(true);

    try {
      // 2. Create a placeholder for the Assistant's response
      const assistantMsg: ChatMessage = { role: 'assistant', content: '' };
      this.messages.update(msgs => [...msgs, assistantMsg]);

      // 3. Call the engine with streaming enabled
      const chunks = await this.engine.chat.completions.create({
        messages: this.messages().map(m => ({ role: m.role, content: m.content })), 
        stream: true,
        temperature: 0.7
      });

      let fullResponse = '';
      
      // 4. Process the stream chunk by chunk
      for await (const chunk of chunks) {
        const delta = chunk.choices[0]?.delta.content || '';
        fullResponse += delta;

        // Update the last message (Assistant's response) in real-time
        this.messages.update(msgs => {
          const newMsgs = [...msgs];
          newMsgs[newMsgs.length - 1] = { ...assistantMsg, content: fullResponse };
          return newMsgs;
        });
      }
      
    } catch (error) {
      console.error('Generation error:', error);
      this.messages.update(msgs => [...msgs, { role: 'system', content: 'Đã xảy ra lỗi khi tạo câu trả lời.' }]);
    } finally {
      this.isGenerating.set(false);
    }
  }

  resetChat(): void {
    this.messages.set([]);
    if (this.engine) {
        this.engine.resetChat();
    }
  }
}