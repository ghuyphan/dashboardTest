import { Injectable, signal, inject, computed } from '@angular/core';
import { Router, NavigationEnd, ActivatedRoute } from '@angular/router';
import { filter, map } from 'rxjs/operators';
import { AuthService } from './auth.service';
import { environment } from '../../../environments/environment.development';

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  isNavigationEvent?: boolean;
}

interface ContextSection {
  description?: string;
  data: any;
  timestamp: number;
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
  public useScreenContext = signal<boolean>(false);
  public messages = signal<ChatMessage[]>([]);
  
  private contextMap = signal<Map<string, ContextSection>>(new Map());
  
  // [NEW] Tracking system prompt changes
  private lastSystemPrompt = signal<string>('');
  private contextVersion = signal<number>(0); // Increments when context changes

  public aggregatedContext = computed(() => {
    const map = this.contextMap();
    if (map.size === 0) return '(Chưa có thông tin cụ thể trên màn hình)';

    let contextStr = '';
    const sortedEntries = Array.from(map.entries()).sort(([, a], [, b]) => a.timestamp - b.timestamp);

    sortedEntries.forEach(([key, val]) => {
      contextStr += `\n--- PHẦN: ${key} ${val.description ? `(${val.description})` : ''} ---\n`;
      const contextDate = new Date(val.timestamp);
      contextStr += `[Dữ liệu từ: ${contextDate.toLocaleString('vi-VN')}]\n`;
      contextStr += this.serializeData(val.data);
      contextStr += '\n';
    });
    return contextStr;
  });

  constructor() {
    this.trackNavigation();
  }

  public toggleChat(): void {
    this.isOpen.update((v) => !v);
    if (this.isOpen() && !this.modelLoaded() && !this.isModelLoading()) {
      this.loadModel();
    }
  }

  public toggleScreenContext(): void {
    this.useScreenContext.update(v => !v);
    // [NEW] Context setting changed, increment version
    this.contextVersion.update(v => v + 1);
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
        // [NEW] Only clear context and notify if there was previous context
        const hadContext = this.contextMap().size > 0;
        this.contextMap.set(new Map());
        
        if (hadContext) {
          this.contextVersion.update(v => v + 1);
          
          if (this.messages().length > 0) {
            const navMessage: ChatMessage = {
              role: 'system',
              content: `Người dùng đã chuyển sang màn hình: "${screenName}". Ngữ cảnh màn hình trước đã bị xóa.`,
              isNavigationEvent: true,
            };
            this.messages.update((msgs) => [...msgs, navMessage]);
          }
        }
      });
  }

  /**
   * Cập nhật một phần của ngữ cảnh màn hình.
   * @param key Tên duy nhất của phần dữ liệu (ví dụ: 'WidgetSummary', 'RawDataSample').
   * @param data Dữ liệu thô (string, object, hoặc array)
   * @param description Mô tả ngắn gọn về dữ liệu này
   */
  updateContextSection(key: string, data: any, description: string = '') {
    this.contextMap.update((currentMap) => {
      const newMap = new Map(currentMap);
      const existing = newMap.get(key);
      
      // [NEW] Only update if data actually changed
      const dataStr = JSON.stringify(data);
      const existingDataStr = existing ? JSON.stringify(existing.data) : '';
      
      if (dataStr !== existingDataStr) {
        newMap.set(key, { data, description, timestamp: Date.now() });
        this.contextVersion.update(v => v + 1);
      }
      
      return newMap;
    });
  }

  removeContextSection(key: string) {
    this.contextMap.update((currentMap) => {
      const newMap = new Map(currentMap);
      const hadKey = newMap.has(key);
      newMap.delete(key);
      
      if (hadKey) {
        this.contextVersion.update(v => v + 1);
      }
      
      return newMap;
    });
  }

  private serializeData(data: any): string {
    if (typeof data === 'string') return data;
    
    if (Array.isArray(data)) {
      const total = data.length;
      const sampleSize = 5;
      const sample = data.slice(0, sampleSize);
      return JSON.stringify({
        TotalRecords: total,
        SampleData: sample,
        Note: total > sampleSize ? `... và ${total - sampleSize} mục khác.` : 'Đây là toàn bộ danh sách.'
      }, null, 2);
    }

    try {
      return JSON.stringify(data, null, 2);
    } catch (e) {
      return 'Error parsing data';
    }
  }

  /** @deprecated Sử dụng updateContextSection('MainContent', data, 'Thông tin chính') thay thế. */
  setPageContext(data: string | object): void {
    this.updateContextSection('MainContent', data, 'Thông tin chính');
  }

  private getCurrentTimeInfo(): string {
    const now = new Date();
    const dateOptions: Intl.DateTimeFormatOptions = { 
      weekday: 'long', 
      year: 'numeric', 
      month: '2-digit', 
      day: '2-digit', 
      hour: '2-digit', 
      minute: '2-digit'
    };
    const fullDateTime = now.toLocaleString('vi-VN', dateOptions);
    
    const dayOfWeek = now.toLocaleDateString('vi-VN', { weekday: 'long' });
    const dayOfMonth = now.getDate();
    const month = now.getMonth() + 1;
    const year = now.getFullYear();
    const hour = now.getHours();
    
    const firstDayOfMonth = new Date(year, now.getMonth(), 1);
    const weekOfMonth = Math.ceil((dayOfMonth + firstDayOfMonth.getDay()) / 7);

    return `
Thời điểm hiện tại: ${fullDateTime}
- Ngày trong tuần: ${dayOfWeek}
- Ngày ${dayOfMonth} tháng ${month} năm ${year}
- Tuần thứ ${weekOfMonth} trong tháng
- Giờ: ${hour}:${now.getMinutes().toString().padStart(2, '0')}
    `.trim();
  }

  // [UPDATED] Generate system prompt và cache nếu không có thay đổi
  private getSystemPrompt(): string {
    const user = this.authService.currentUser();
    const userInfo = user
      ? `User: ${user.fullName} (Role: ${user.roles.join(', ')})`
      : 'User: Khách';

    // [NEW] Only include context if enabled AND there's actual context data
    const hasContext = this.useScreenContext() && this.contextMap().size > 0;
    const contextBlock = hasContext 
      ? `
<current_screen_context>
  ${this.aggregatedContext()}
</current_screen_context>`
      : '';

    const prompt = `
<instruction>
  Bạn là trợ lý AI chuyên nghiệp của "Hoàn Mỹ Portal".
  
  QUY TẮC ỨNG XỬ BẮT BUỘC:
  1. LUÔN trả lời bằng Tiếng Việt một cách trang trọng, lịch sự.
  
  2. XỬ LÝ CÂU HỎI THỜI GIAN:
     - KHI người dùng hỏi về "hôm nay", "tuần này", "tháng này", "năm nay": 
       Sử dụng thông tin <current_time> bên dưới để xác định chính xác thời điểm hiện tại.
     - KHI dữ liệu trong context có timestamp: So sánh với thời gian hiện tại để đảm bảo độ chính xác.
     - VÍ DỤ: Nếu hỏi "doanh thu hôm nay", hãy tìm dữ liệu có ngày khớp với ngày hiện tại trong <current_time>.
  
  3. XỬ LÝ DỮ LIỆU CONTEXT:${hasContext ? `
     - SỬ DỤNG dữ liệu trong <current_screen_context> để trả lời các câu hỏi về số liệu/trạng thái màn hình.
     - NẾU KHÔNG TÌM THẤY thông tin được hỏi trong context: 
       Trả lời rõ ràng: "Xin lỗi, tôi không thể tìm thấy thông tin này trên màn hình hiện tại."
     - Chú ý đến timestamp của từng phần dữ liệu (hiển thị ở đầu mỗi section).` : `
     - KHÔNG CÓ dữ liệu màn hình hiện tại. Nếu người dùng hỏi về số liệu hoặc thông tin cụ thể trên màn hình, 
       hãy cho họ biết: "Hiện tại tôi chưa có thông tin về màn hình này. Vui lòng bật 'Ngữ cảnh màn hình' hoặc điều hướng đến màn hình có dữ liệu."`}
  
  4. TUYỆT ĐỐI không bịa đặt hoặc suy luận dữ liệu không có trong context.
  
  5. Giữ thái độ chuyên nghiệp và hỗ trợ người dùng tối đa.
  
  6. Dữ liệu ngữ cảnh có thể là JSON. Hãy phân tích cấu trúc đó khi cần.
</instruction>

<current_time>
${this.getCurrentTimeInfo()}
</current_time>

<meta>
  ${userInfo}
  Context Version: ${this.contextVersion()}
</meta>
${contextBlock}
    `.trim();

    return prompt;
  }

  // [NEW] Check if system prompt needs to be regenerated
  private hasSystemPromptChanged(): boolean {
    const currentPrompt = this.getSystemPrompt();
    const changed = currentPrompt !== this.lastSystemPrompt();
    
    if (changed) {
      this.lastSystemPrompt.set(currentPrompt);
    }
    
    return changed;
  }

  async loadModel(): Promise<void> {
    if (this.modelLoaded()) return;
    this.isModelLoading.set(true);
    this.loadProgress.set('Đang kết nối đến hệ thống AI...');

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
              'Xin chào! Tôi là Homi. Tôi có thể hỗ trợ gì cho bạn?',
          },
        ]);
      }
    }, 200);
  }

  async sendMessage(content: string): Promise<void> {
    if (!content.trim()) return;
    const userMsg: ChatMessage = { role: 'user', content };
    this.messages.update((msgs) => [...msgs, userMsg]);
    
    // [NEW] Inject context change notification if system prompt changed
    if (this.hasSystemPromptChanged() && this.messages().length > 1) {
      const contextChangeMsg: ChatMessage = {
        role: 'system',
        content: 'Lưu ý: Ngữ cảnh màn hình đã được cập nhật.',
        isNavigationEvent: true,
      };
      this.messages.update((msgs) => [...msgs, contextChangeMsg]);
    }
    
    const aiMsg: ChatMessage = { role: 'assistant', content: '' };
    this.messages.update((msgs) => [...msgs, aiMsg]);
    this.isGenerating.set(true);

    try {
      const recentMessages = this.messages()
        .filter((m) => !m.isNavigationEvent && m !== aiMsg)
        .slice(-this.MAX_HISTORY);

      const payload = {
        model: 'llama3.2:3b',
        messages: [
          { role: 'system', content: this.getSystemPrompt() },
          ...recentMessages,
        ],
        temperature: 0.3,
        stream: true, 
      };

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
          } catch (e) {}
        }
      }
    } catch (error) {
      console.error('AI Stream Error:', error);
      this.messages.update((msgs) => {
        const newMsgs = [...msgs];
        newMsgs[newMsgs.length - 1] = {
          role: 'system',
          content: '⚠️ Rất tiếc, đã xảy ra sự cố kết nối hoặc lỗi máy chủ. Vui lòng thử lại sau.',
        };
        return newMsgs;
      });
    } finally {
      this.isGenerating.set(false);
    }
  }
  
  resetChat(): void {
    this.messages.set([]);
    this.contextVersion.set(0);
    this.lastSystemPrompt.set('');
    this.loadModel();
  }
}