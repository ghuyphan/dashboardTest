import {
  Component,
  inject,
  ElementRef,
  effect,
  HostListener,
  ChangeDetectionStrategy,
  NgZone,
  AfterViewInit,
  OnDestroy,
  computed,
  viewChild
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { LlmService, ChatMessage } from '../../../core/services/llm.service';
import { MarkdownPipe } from '../../pipes/markdown.pipe';

@Component({
  selector: 'app-ai-chat',
  standalone: true,
  imports: [CommonModule, FormsModule, MarkdownPipe],
  templateUrl: './ai-chat.component.html',
  styleUrls: ['./ai-chat.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AiChatComponent implements AfterViewInit, OnDestroy {
  // --- Injections ---
  public readonly llmService = inject(LlmService);
  private readonly ngZone = inject(NgZone);
  private readonly router = inject(Router);
  private readonly elementRef = inject(ElementRef);

  // --- View Queries ---
  private scrollContainer = viewChild.required<ElementRef<HTMLDivElement>>('scrollContainer');
  private chatWindow = viewChild.required<ElementRef<HTMLDivElement>>('chatWindow');
  private chatInput = viewChild.required<ElementRef<HTMLInputElement>>('chatInput');

  // --- State ---
  public userInput = '';
  private isNearBottom = true;
  private scrollCleanup?: () => void;
  private contentCache = new Map<string, string>();
  private pushedState = false; // Track if we pushed a history state

  // --- Computed ---
  public hasUserMessages = computed(() => {
    return this.llmService.messages().some(m => m.role === 'user');
  });

  public isInputDisabled = computed(() => {
    return this.llmService.isGenerating() ||
      this.llmService.isNavigating() ||
      this.llmService.isOffline() ||
      (!this.llmService.modelLoaded() && !this.hasUserMessages());
  });

  // Get dynamic styles for positioning
  public getChatWindowStyle = computed(() => {
    const pos = this.llmService.anchorPosition();
    if (!pos) return {};

    return {
      top: `${pos.top}px`,
      right: `${pos.right}px`,
    };
  });

  constructor() {
    // 1. Auto-scroll effect
    effect(() => {
      const msgs = this.llmService.messages();
      if (msgs.length > 0 && this.isNearBottom) {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => this.scrollToBottom());
        });
      }
    });

    // 2. Setup scroll listener once view is ready
    effect(() => {
      const el = this.scrollContainer()?.nativeElement;
      if (el) {
        this.setupEfficientScrollListener(el);
      }
    });

    // 3. Auto-focus input when chat opens
    effect(() => {
      // Focus when chat is open AND input is ready (not disabled)
      if (this.llmService.isOpen() && !this.isInputDisabled()) {
        const inputEl = this.chatInput()?.nativeElement;
        if (inputEl) {
          // Small delay to ensure DOM is ready and transitions are handling
          setTimeout(() => inputEl.focus(), 100);
        }
      }
    });

    // 4. Handle Browser Back Button (Mobile Support)
    effect(() => {
      const isOpen = this.llmService.isOpen();

      if (isOpen) {
        // Chat Opened: Push state so 'Back' closes it
        history.pushState({ chatOpen: true }, '', location.href);
        this.pushedState = true;
      } else {
        // Chat Closed: If we pushed state, go back to remove it
        if (this.pushedState) {
          history.back();
          this.pushedState = false;
        }
      }
    });
  }

  ngAfterViewInit(): void {
    if (this.llmService.isOpen()) {
      this.scrollToBottom();
    }
  }

  ngOnDestroy(): void {
    this.scrollCleanup?.();
  }

  // ========================================================================
  // VIEW HELPERS
  // ========================================================================

  trackByMessage(index: number, msg: ChatMessage): string {
    return msg.id;
  }

  processContent(content: string): string {
    if (!content) return '';
    return content
      .replace(/<think>[\s\S]*?<\/think>/g, '')
      .replace(/JSON_ACTION:\s*\{[^}]*\}/g, '')
      .trim();
  }

  getPlaceholderText(): string {
    if (this.llmService.isOffline()) {
      return 'Đang offline - Kiểm tra kết nối mạng';
    }
    if (this.llmService.isNavigating()) {
      return 'Đang chuyển trang...';
    }
    if (this.llmService.inputTruncated()) {
      return 'Tin nhắn đã được rút gọn (tối đa 500 ký tự)';
    }
    return 'Bạn muốn tôi giúp gì hôm nay?';
  }

  shouldShowLoadingIndicator(): boolean {
    if (!this.llmService.isGenerating()) return false;

    const msgs = this.llmService.messages();
    if (msgs.length === 0) return true;

    const lastMsg = msgs[msgs.length - 1];
    return lastMsg.role === 'assistant' && !lastMsg.content;
  }

  // ========================================================================
  // ACTIONS
  // ========================================================================

  async onSend(): Promise<void> {
    if (this.llmService.isOffline()) return;
    if (this.llmService.isNavigating()) return;

    const text = this.userInput.trim();
    if (!text) return;

    const sanitizedText = text
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
      .substring(0, 500);

    if (!sanitizedText) return;

    this.userInput = '';
    this.isNearBottom = true;
    this.scrollToBottom();

    await this.llmService.sendMessage(sanitizedText);
  }

  handleMainButton(): void {
    if (this.llmService.isGenerating()) {
      this.llmService.stopGeneration();
    } else {
      this.onSend();
    }
  }

  closeChat(): void {
    this.llmService.toggleChat();
  }

  // ========================================================================
  // EVENTS & UTILS
  // ========================================================================

  @HostListener('document:keydown.escape', ['$event'])
  onEscape(event: KeyboardEvent): void {
    if (this.llmService.isOpen()) {
      this.closeChat();
    }
  }

  @HostListener('window:popstate', ['$event'])
  onPopState(event: PopStateEvent): void {
    if (this.llmService.isOpen()) {
      // The browser already went back, so we just need to update our internal state
      // preventing the effect from triggering another back()
      this.pushedState = false;
      this.closeChat();
    }
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    const isTrigger = target.closest('.ai-fab') || target.closest('.ai-trigger-btn');
    const isInside = this.elementRef.nativeElement.contains(target);

    if (this.llmService.isOpen() && !isInside && !isTrigger) {
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

  private setupEfficientScrollListener(el: HTMLElement): void {
    this.scrollCleanup?.();

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
    const el = this.scrollContainer()?.nativeElement;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }
}