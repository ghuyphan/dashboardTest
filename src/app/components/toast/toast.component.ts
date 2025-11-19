import {
  Component,
  ChangeDetectorRef,
  OnDestroy,
  OnInit,
  ChangeDetectionStrategy,
  inject
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';
import { ToastMessage, ToastType } from '../../models/toast-message.model';
import { ToastService } from '../../services/toast.service';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';

// Helper interface to track individual timer state
interface ToastTimerState {
  timerId: any;
  startTime: number;
  remaining: number;
}

@Component({
  selector: 'app-toast',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './toast.component.html',
  styleUrl: './toast.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ToastComponent implements OnInit, OnDestroy {
  private toastService = inject(ToastService);
  private sanitizer = inject(DomSanitizer);
  private cdRef = inject(ChangeDetectorRef);

  public toasts: ToastMessage[] = [];
  
  // 1. Default to Expanded
  public isExpanded = true; 
  public isHovering = false;

  private toastSub!: Subscription;
  
  // 2. Map to store the state (time left) for each toast
  private timerState = new Map<number, ToastTimerState>();

  private readonly DEFAULT_DURATION = 5000;
  private readonly SWIPE_DISMISS_THRESHOLD_PERCENT = 0.4;

  // Swipe state
  private touchStartX = 0;
  private touchMoveX = 0;
  private swipingToastId: number | null = null;
  private swipedElement: HTMLElement | null = null;

  ngOnInit(): void {
    this.toastSub = this.toastService.toasts$.subscribe((newToasts) => {
      const currentIds = new Set(this.toasts.map(t => t.id));
      const addedToasts = newToasts.filter(t => !currentIds.has(t.id));

      // Cleanup removed toasts from our timer map
      const newIds = new Set(newToasts.map((t) => t.id));
      this.timerState.forEach((_, id) => {
        if (!newIds.has(id)) {
          this.clearTimer(id);
        }
      });

      this.toasts = newToasts;
      this.cdRef.markForCheck();

      // 3. Initialize new toasts
      addedToasts.forEach(toast => {
        const duration = toast.duration ?? this.DEFAULT_DURATION;
        if (duration > 0) {
          // Initialize state with full duration
          this.timerState.set(toast.id, {
            timerId: null,
            startTime: Date.now(),
            remaining: duration
          });
          
          // Only start countdown if we aren't currently hovering
          if (!this.isHovering) {
            this.runTimer(toast.id);
          }
        }
      });
    });
  }

  ngOnDestroy(): void {
    if (this.toastSub) {
      this.toastSub.unsubscribe();
    }
    this.clearAllTimers();
  }

  // ========================================================================
  // SMART TIMER LOGIC (Tracks Remaining Time)
  // ========================================================================

  /**
   * Actually executes the setTimeout for a specific toast based on its 'remaining' time.
   */
  private runTimer(id: number): void {
    const state = this.timerState.get(id);
    if (!state || state.remaining <= 0) return;

    // Clear any existing timer just in case
    if (state.timerId) clearTimeout(state.timerId);

    state.startTime = Date.now();
    state.timerId = setTimeout(() => {
      this.closeToast(id);
    }, state.remaining);
  }

  /**
   * Pauses all timers and updates their 'remaining' property.
   * Called on MouseEnter.
   */
  pauseAllTimers(): void {
    this.isHovering = true;
    
    this.timerState.forEach((state, id) => {
      if (state.timerId) {
        clearTimeout(state.timerId);
        state.timerId = null;
        
        // Calculate how much time passed since we started this specific slice
        const elapsed = Date.now() - state.startTime;
        state.remaining = Math.max(0, state.remaining - elapsed);
      }
    });
  }

  /**
   * Resumes all timers using their stored 'remaining' time.
   * Called on MouseLeave.
   */
  resumeAllTimers(): void {
    this.isHovering = false;

    this.timerState.forEach((state, id) => {
      // Optional: Give a tiny buffer (e.g. 1s) if it was about to expire instantly, 
      // so it doesn't vanish the millisecond the mouse leaves.
      if (state.remaining < 1000) {
        state.remaining = 1000;
      }
      this.runTimer(id);
    });
  }

  private clearTimer(id: number): void {
    const state = this.timerState.get(id);
    if (state && state.timerId) {
      clearTimeout(state.timerId);
    }
    this.timerState.delete(id);
  }

  private clearAllTimers(): void {
    this.timerState.forEach(state => {
      if (state.timerId) clearTimeout(state.timerId);
    });
    this.timerState.clear();
  }

  // ========================================================================
  // ACTIONS
  // ========================================================================

  closeToast(id: number): void {
    this.clearTimer(id); // Stop tracking this one

    const wrapper = document.getElementById('toast-' + id);
    const card = wrapper?.querySelector('.toast-card');

    if (card) {
      card.classList.add('dismissing');
      setTimeout(() => {
        this.toastService.removeToast(id);
      }, 300);
    } else {
      this.toastService.removeToast(id);
    }
  }

  toggleExpanded(event: MouseEvent): void {
    event.stopPropagation();
    this.isExpanded = !this.isExpanded;
  }

  clearAllToasts(event: MouseEvent): void {
    event.stopPropagation();
    this.clearAllTimers();
    this.toastService.clearAll();
  }

  // ========================================================================
  // HELPERS
  // ========================================================================

  getTitle(type: ToastType): string {
    const titles: Record<ToastType, string> = {
      success: 'Thành công',
      error: 'Lỗi',
      warning: 'Cảnh báo',
      info: 'Thông tin',
    };
    return titles[type] || 'Thông báo';
  }

  getIcon(type: ToastType): SafeHtml {
    const icons: Record<ToastType, string> = {
      success: 'fas fa-check',
      error: 'fas fa-exclamation',
      warning: 'fas fa-bell',
      info: 'fas fa-info',
    };
    const iconClass = icons[type] || 'fas fa-circle';
    return this.sanitizer.bypassSecurityTrustHtml(`<i class="${iconClass}"></i>`);
  }

  // ========================================================================
  // GESTURES
  // ========================================================================

  handleTouchStart(event: TouchEvent, toastId: number): void {
    if (event.touches.length !== 1) return;
    
    this.pauseAllTimers(); // Touch acts like hover

    this.touchStartX = event.touches[0].clientX;
    this.touchMoveX = this.touchStartX;
    this.swipingToastId = toastId;

    const wrapper = document.getElementById('toast-' + toastId);
    this.swipedElement = wrapper?.querySelector('.toast-card') as HTMLElement;
    
    if (this.swipedElement) {
      this.swipedElement.classList.add('swiping');
    }
  }

  handleTouchMove(event: TouchEvent, toastId: number): void {
    if (this.swipingToastId !== toastId || !this.swipedElement) return;

    this.touchMoveX = event.touches[0].clientX;
    const deltaX = this.touchMoveX - this.touchStartX;

    if (deltaX > 0) {
      event.preventDefault();
      this.swipedElement.style.transform = `translateX(${deltaX}px)`;
      this.swipedElement.style.opacity = `${1 - (deltaX / 300)}`;
    }
  }

  handleTouchEnd(event: TouchEvent, toast: ToastMessage): void {
    if (this.swipingToastId !== toast.id || !this.swipedElement) return;

    this.swipedElement.classList.remove('swiping');
    const deltaX = this.touchMoveX - this.touchStartX;
    const width = this.swipedElement.offsetWidth;

    if (deltaX > width * this.SWIPE_DISMISS_THRESHOLD_PERCENT) {
      this.closeToast(toast.id);
    } else {
      this.swipedElement.style.transform = '';
      this.swipedElement.style.opacity = '';
      this.resumeAllTimers();
    }

    this.swipingToastId = null;
    this.swipedElement = null;
  }
}