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
  OnDestroy,
  TrackByFunction
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { DomSanitizer } from '@angular/platform-browser';
import { LlmService, ChatMessage } from '../../core/services/llm.service';
import { MarkdownPipe } from '../../shared/pipes/markdown.pipe';

@Component({
  selector: 'app-ai-chat',
  standalone: true,
  imports: [CommonModule, FormsModule, MarkdownPipe],
  templateUrl: './ai-chat.component.html',
  styleUrls: ['./ai-chat.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AiChatComponent implements AfterViewInit, OnDestroy {
  public readonly llmService = inject(LlmService);
  private readonly ngZone = inject(NgZone);
  private readonly router = inject(Router);
  private readonly sanitizer = inject(DomSanitizer);

  public userInput = '';
  private isNearBottom = true;
  private scrollCleanup?: () => void;

  @ViewChild('scrollContainer') private scrollContainer!: ElementRef<HTMLDivElement>;

  public readonly trackByMessage: TrackByFunction<ChatMessage> = (index, msg) => msg.id;

  constructor(private elementRef: ElementRef) {
    effect(() => {
      const msgs = this.llmService.messages();
      // Auto-scroll if new messages arrive and user was already at bottom
      if (this.isNearBottom && msgs.length > 0) {
        // Double RAF ensures rendering is complete before scrolling
        requestAnimationFrame(() => {
          requestAnimationFrame(() => this.scrollToBottom());
        });
      }
    });
  }

  ngAfterViewInit(): void {
    this.setupEfficientScrollListener();
  }

  ngOnDestroy(): void {
    this.scrollCleanup?.();
  }

  // ========================================================================
  // VIEW HELPERS
  // ========================================================================

  /**
   * Pre-processes content to handle <think> tags from models like Qwen/DeepSeek.
   * Replaces them with a styled div structure before Markdown parsing.
   */
  processContent(content: string): string {
    if (!content) return '';
    
    // Replace <think>...</think> with a styled container.
    // The inner content of <think> is preserved and will be rendered inside.
    let processed = content
      .replace(/<think>/g, '<div class="ai-thought-process"><div class="thought-label">Thinking Process:</div>')
      .replace(/<\/think>/g, '</div>');

    return processed;
  }

  shouldShowLoadingIndicator(): boolean {
    // Only show the "..." dots if we are generating BUT have no content yet
    // (Waiting for the first token)
    if (!this.llmService.isGenerating()) return false;
    
    const msgs = this.llmService.messages();
    if (msgs.length === 0) return true;

    const lastMsg = msgs[msgs.length - 1];
    return lastMsg.role === 'assistant' && !lastMsg.content;
  }

  getContextLevel(): 'low' | 'medium' | 'high' {
    const usage = this.llmService.contextUsage();
    if (usage >= 80) return 'high';
    if (usage >= 50) return 'medium';
    return 'low';
  }

  // ========================================================================
  // ACTIONS
  // ========================================================================

  async onSend(): Promise<void> {
    const text = this.userInput.trim();
    if (!text) return;

    this.userInput = '';
    this.isNearBottom = true;
    this.scrollToBottom();

    await this.llmService.sendMessage(text);
  }

  handleMainButton(): void {
    if (this.llmService.isGenerating()) {
      this.llmService.stopGeneration();
    } else {
      this.onSend();
    }
  }

  closeChat(): void {
    this.llmService.isOpen.set(false);
  }

  // ========================================================================
  // EVENTS & UTILS
  // ========================================================================

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    const isToggleButton = target.closest('.ai-fab') || target.closest('.ai-trigger-btn');
    // Only close if clicking outside AND chat is open
    if (this.llmService.isOpen() && !this.elementRef.nativeElement.contains(target) && !isToggleButton) {
      this.closeChat();
    }
  }

  @HostListener('click', ['$event'])
  onChatClick(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    const anchor = target.closest('a');
    if (anchor) {
      const href = anchor.getAttribute('href');
      if (href?.startsWith('/')) {
        event.preventDefault();
        this.router.navigateByUrl(href);
      }
    }
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

  private scrollToBottom(): void {
    try {
      if (this.scrollContainer) {
        const el = this.scrollContainer.nativeElement;
        el.scrollTop = el.scrollHeight;
      }
    } catch (err) { /* ignore */ }
  }
}