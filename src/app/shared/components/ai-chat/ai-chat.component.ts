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
  // The scroll container is now always present (no loading screen), so we can require it
  private scrollContainer = viewChild.required<ElementRef<HTMLDivElement>>('scrollContainer');

  // --- State ---
  public userInput = '';
  private isNearBottom = true;
  private scrollCleanup?: () => void;

  // --- Computed ---
  public hasUserMessages = computed(() => {
    return this.llmService.messages().some(m => m.role === 'user');
  });

  constructor() {
    // 1. Auto-scroll effect
    effect(() => {
      const msgs = this.llmService.messages();
      // Dependency on msgs.length ensures this runs when chat updates
      if (msgs.length > 0 && this.isNearBottom) {
        // Double RAF to ensure DOM paint is complete before scrolling
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
  }

  ngAfterViewInit(): void {
    // Scroll to bottom on initial open
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

  // Handle specific model tokens if they leak through (sanity check)
  processContent(content: string): string {
    if (!content) return '';
    return content
      .replace(/<think>[\s\S]*?<\/think>/g, '') // Hide thinking process in UI for cleanliness
      .trim();
  }

  shouldShowLoadingIndicator(): boolean {
    if (!this.llmService.isGenerating()) return false;

    const msgs = this.llmService.messages();
    if (msgs.length === 0) return true;

    const lastMsg = msgs[msgs.length - 1];
    // Show dots if assistant is generating but hasn't received text chunk yet
    return lastMsg.role === 'assistant' && !lastMsg.content;
  }

  // ========================================================================
  // ACTIONS
  // ========================================================================

  async onSend(): Promise<void> {
    const text = this.userInput.trim();
    if (!text) return;

    this.userInput = '';
    this.isNearBottom = true; // Force scroll to bottom on new message
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
    this.llmService.toggleChat();
  }

  // ========================================================================
  // EVENTS & UTILS
  // ========================================================================

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    // Check if click is inside chat or on a trigger button
    const isTrigger = target.closest('.ai-fab') || target.closest('.ai-trigger-btn');
    const isInside = this.elementRef.nativeElement.contains(target);

    if (this.llmService.isOpen() && !isInside && !isTrigger) {
      this.closeChat();
    }
  }

  // Intercept links in markdown to handle internal Angular routing
  @HostListener('click', ['$event'])
  onChatClick(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    const anchor = target.closest('a');
    if (anchor) {
      const href = anchor.getAttribute('href');
      // If it's an internal link (starts with /), use Angular Router
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
        const threshold = 50; // px tolerance
        const position = el.scrollTop + el.clientHeight;
        const height = el.scrollHeight;
        // Update local flag without triggering Change Detection
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