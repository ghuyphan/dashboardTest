import { Component, inject, ElementRef, ViewChild, effect, signal } from '@angular/core';
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
  
  // Local state for the chat window visibility
  public isOpen = signal(false);
  public userInput = '';

  @ViewChild('scrollContainer') private scrollContainer!: ElementRef;

  constructor() {
    // Effect: Automatically scroll to bottom whenever messages array changes
    effect(() => {
      const msgs = this.llmService.messages();
      // Small timeout to allow DOM to update before scrolling
      setTimeout(() => this.scrollToBottom(), 50);
    });
  }

  toggleChat() {
    this.isOpen.update(v => !v);
    
    // Trigger model loading only when user first opens the chat
    if (this.isOpen() && !this.llmService.modelLoaded() && !this.llmService.isModelLoading()) {
      this.llmService.loadModel();
    }
  }

  async onSend() {
    if (!this.userInput.trim() || this.llmService.isGenerating()) return;
    
    const text = this.userInput;
    this.userInput = ''; // Clear input immediately
    await this.llmService.sendMessage(text);
  }

  private scrollToBottom(): void {
    try {
      if (this.scrollContainer) {
        this.scrollContainer.nativeElement.scrollTop = this.scrollContainer.nativeElement.scrollHeight;
      }
    } catch(err) { }
  }
}