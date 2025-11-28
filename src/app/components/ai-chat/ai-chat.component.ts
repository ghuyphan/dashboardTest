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
  private isNearBottom = true; 
  private scrollCleanup?: () => void;

  @ViewChild('scrollContainer') private scrollContainer!: ElementRef<HTMLDivElement>;

  constructor(private elementRef: ElementRef) {
    effect(() => {
      // Trigger scroll on message update
      const msgs = this.llmService.messages();
      if (this.isNearBottom) {
        requestAnimationFrame(() => this.scrollToBottom());
      }
    });
  }

  ngAfterViewInit(): void {
    this.setupEfficientScrollListener();
  }

  ngOnDestroy(): void {
    if (this.scrollCleanup) this.scrollCleanup();
  }

  private setupEfficientScrollListener(): void {
    if (!this.scrollContainer) return;
    const el = this.scrollContainer.nativeElement;
    
    this.ngZone.runOutsideAngular(() => {
      const handler = () => {
        const threshold = 50;
        const position = el.scrollTop + el.clientHeight;
        const height = el.scrollHeight;
        this.isNearBottom = position >= height - threshold;
      };
      el.addEventListener('scroll', handler, { passive: true });
      this.scrollCleanup = () => el.removeEventListener('scroll', handler);
    });
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    const isToggleButton = target.closest('.ai-fab') || target.closest('.ai-trigger-btn');
    if (this.llmService.isOpen() && !this.elementRef.nativeElement.contains(target) && !isToggleButton) {
      this.closeChat();
    }
  }

  closeChat(): void {
    this.llmService.isOpen.set(false);
  }

  handleMainButton(): void {
    if (this.llmService.isGenerating()) {
      this.llmService.isGenerating.set(false);
    } else {
      this.onSend();
    }
  }

  async onSend() {
    if (!this.userInput.trim()) return;
    const text = this.userInput;
    this.userInput = ''; 
    this.isNearBottom = true;
    this.scrollToBottom();
    await this.llmService.sendMessage(text);
  }

  shouldShowThinking(): boolean {
    if (!this.llmService.isGenerating()) return false;
    const msgs = this.llmService.messages();
    if (msgs.length === 0) return true;
    const lastMsg = msgs[msgs.length - 1];
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