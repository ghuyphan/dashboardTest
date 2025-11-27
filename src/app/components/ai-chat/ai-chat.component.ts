import {
  Component,
  inject,
  ElementRef,
  ViewChild,
  effect,
  HostListener,
  ChangeDetectionStrategy,
  NgZone,
  AfterViewInit,
  OnDestroy
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LlmService } from '../../core/services/llm.service';

@Component({
  selector: 'app-ai-chat',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './ai-chat.component.html',
  styleUrls: ['./ai-chat.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AiChatComponent implements AfterViewInit, OnDestroy {
  public llmService = inject(LlmService);
  private ngZone = inject(NgZone);
  
  public userInput = '';
  
  // State to track auto-scrolling behavior
  private isNearBottom = true; 
  private scrollCleanup?: () => void;

  @ViewChild('scrollContainer') private scrollContainer!: ElementRef<HTMLDivElement>;

  constructor(private elementRef: ElementRef) {
    // [OPTIMIZATION 2] Effect runs only when signals change (efficient updates)
    effect(() => {
      const msgs = this.llmService.messages();
      
      // Only auto-scroll if we were already near the bottom
      if (this.isNearBottom) {
        // Use requestAnimationFrame for smoother visual updates during streaming
        requestAnimationFrame(() => this.scrollToBottom());
      }
    });
  }

  ngAfterViewInit(): void {
    this.setupEfficientScrollListener();
  }

  ngOnDestroy(): void {
    if (this.scrollCleanup) {
      this.scrollCleanup();
    }
  }

  /**
   * [OPTIMIZATION 3] Run scroll listener OUTSIDE Angular zone.
   * This prevents the 'scroll' event (which fires rapidly) from triggering
   * Angular's change detection, saving massive CPU during scrolling.
   */
  private setupEfficientScrollListener(): void {
    if (!this.scrollContainer) return;
    
    const el = this.scrollContainer.nativeElement;
    
    this.ngZone.runOutsideAngular(() => {
      const handler = () => {
        const threshold = 50; // pixels from bottom
        const position = el.scrollTop + el.clientHeight;
        const height = el.scrollHeight;
        
        // Update the flag directly without triggering CD
        this.isNearBottom = position >= height - threshold;
      };

      el.addEventListener('scroll', handler, { passive: true });
      this.scrollCleanup = () => el.removeEventListener('scroll', handler);
    });
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    // Simple check to close chat if clicking outside
    const target = event.target as HTMLElement;
    const isToggleButton = target.closest('.ai-fab') || target.closest('.ai-trigger-btn');

    if (this.llmService.isOpen() && !this.elementRef.nativeElement.contains(target) && !isToggleButton) {
      this.closeChat();
    }
  }

  toggleChat() {
    this.llmService.toggleChat();
    if (this.llmService.isOpen()) {
      // Small delay to allow DOM to render before scrolling
      setTimeout(() => this.scrollToBottom(), 100);
    }
  }

  closeChat(): void {
    this.llmService.isOpen.set(false);
  }

  handleMainButton(): void {
    if (this.llmService.isGenerating()) {
      this.onStop();
    } else {
      this.onSend();
    }
  }

  async onSend() {
    if (!this.userInput.trim()) return;
    const text = this.userInput;
    this.userInput = ''; 
    
    // Force scroll to bottom when user sends a message
    this.isNearBottom = true;
    this.scrollToBottom();
    
    await this.llmService.sendMessage(text);
  }

  onStop(): void {
    this.llmService.isGenerating.set(false);
  }

  shouldShowThinking(): boolean {
    // Only run logic if generating to save cycles
    if (!this.llmService.isGenerating()) return false;
    
    const msgs = this.llmService.messages();
    if (msgs.length === 0) return true;

    const lastMsg = msgs[msgs.length - 1];
    // Show thinking only if the AI hasn't produced text yet
    return !lastMsg.content;
  }

  private scrollToBottom(): void {
    try {
      if (this.scrollContainer) {
        const el = this.scrollContainer.nativeElement;
        el.scrollTop = el.scrollHeight;
      }
    } catch(err) { }
  }
}