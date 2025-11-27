import { Component, inject, ElementRef, ViewChild, effect, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LlmService } from '../../core/services/llm.service';

@Component({
  selector: 'app-ai-chat',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './ai-chat.component.html',
  styleUrls: ['./ai-chat.component.scss']
})
export class AiChatComponent {
  public llmService = inject(LlmService);
  public userInput = '';

  @ViewChild('scrollContainer') private scrollContainer!: ElementRef;

  constructor(private elementRef: ElementRef) {
    effect(() => {
      const msgs = this.llmService.messages();
      setTimeout(() => this.scrollToBottom(), 50);
    });
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    // Check if click is outside chat window AND not on a toggle button (like in header/fab)
    // We assume toggle buttons might have a specific class or we just check if it's inside the component
    // For safety, we can rely on the toggle logic: if user clicks OUTSIDE, we close.
    // If user clicks a toggle button, that button's click handler runs.
    
    // NOTE: Ideally, buttons that toggle chat should call stopPropagation(), 
    // or we check if target is not .ai-fab or .header-icon-btn
    const isToggleButton = target.closest('.ai-fab') || target.closest('.chat-toggle-btn');

    if (this.llmService.isOpen() && !this.elementRef.nativeElement.contains(target) && !isToggleButton) {
      this.closeChat();
    }
  }

  toggleChat() {
    this.llmService.toggleChat();
  }

  closeChat(): void {
    this.llmService.isOpen.set(false);
  }

  async onSend() {
    if (!this.userInput.trim() || this.llmService.isGenerating()) return;
    const text = this.userInput;
    this.userInput = ''; 
    await this.llmService.sendMessage(text);
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