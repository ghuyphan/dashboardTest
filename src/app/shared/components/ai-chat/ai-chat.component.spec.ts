import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { signal } from '@angular/core';
import { LlmService } from '../../../core/services/llm.service';

import { AiChatComponent } from './ai-chat.component';

class MockLlmService {
  isOpen = signal(false);
  messages = signal([]);
  isGenerating = signal(false);
  isNavigating = signal(false);
  isOffline = signal(false);
  modelLoaded = signal(true);
  loadProgress = signal(''); // Added
  anchorPosition = signal({ top: 0, right: 0 });
  inputTruncated = signal(false);

  toggleChat() {
    this.isOpen.set(!this.isOpen());
  }

  sendMessage() { }
  stopGeneration() { }
  loadModel() { } // Added
  resetChat() { } // Added
}

describe('AiChatComponent', () => {
  let component: AiChatComponent;
  let fixture: ComponentFixture<AiChatComponent>;
  let llmService: MockLlmService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AiChatComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: LlmService, useClass: MockLlmService }
      ]
    })
      .compileComponents();

    fixture = TestBed.createComponent(AiChatComponent);
    component = fixture.componentInstance;
    llmService = TestBed.inject(LlmService) as unknown as MockLlmService;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should close chat on Escape key press', () => {
    llmService.isOpen.set(true);
    fixture.detectChanges();
    spyOn(component, 'closeChat').and.callThrough();
    spyOn(llmService, 'toggleChat').and.callThrough();

    const event = new KeyboardEvent('keydown', { key: 'Escape' });
    document.dispatchEvent(event);

    expect(component.closeChat).toHaveBeenCalled();
    expect(llmService.toggleChat).toHaveBeenCalled();
    expect(llmService.isOpen()).toBeFalse();
  });

  it('should NOT close chat on Escape key press if chat is closed', () => {
    llmService.isOpen.set(false);
    fixture.detectChanges();
    spyOn(component, 'closeChat');

    const event = new KeyboardEvent('keydown', { key: 'Escape' });
    document.dispatchEvent(event);

    expect(component.closeChat).not.toHaveBeenCalled();
  });

  it('should close chat on popstate event (Back button)', () => {
    llmService.isOpen.set(true);
    // Mimic the effect setting pushedState = true
    // (We need to trigger the effect, but effects might run async or require flush.
    // However, since we are testing the event handler directly, we can assume state is set or irrelevant for closing)

    spyOn(component, 'closeChat').and.callThrough();
    spyOn(llmService, 'toggleChat').and.callThrough();

    const event = new PopStateEvent('popstate', { state: null });
    window.dispatchEvent(event);

    expect(component.closeChat).toHaveBeenCalled();
    expect(llmService.isOpen()).toBeFalse();
  });

  it('should manage history state when chat opens and closes', fakeAsync(() => {
    const pushStateSpy = spyOn(history, 'pushState');
    const backSpy = spyOn(history, 'back');

    // 1. Open Chat -> Expect pushState
    llmService.isOpen.set(true);
    fixture.detectChanges();
    tick(); // Allow effect to run

    expect(pushStateSpy).toHaveBeenCalledWith({ chatOpen: true }, '', location.href);

    // 2. Close Chat -> Expect back
    llmService.isOpen.set(false);
    fixture.detectChanges();
    tick();

    expect(backSpy).toHaveBeenCalled();
  }));
});
