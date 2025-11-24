import {
  Component,
  OnDestroy,
  ChangeDetectionStrategy,
  inject,
  effect,
  signal
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ToastMessage, ToastType } from '../../core/models/toast-message.model';
import { ToastService } from '../../core/services/toast.service';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';

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
export class ToastComponent implements OnDestroy {
  public toastService = inject(ToastService); // Public to access signal in template
  private sanitizer = inject(DomSanitizer);

  // --- UI State Signals ---
  public isExpanded = signal(true);
  public isHovering = signal(false);

  // Private cache for diffing inside effect (not used in template)
  private _previousToasts: ToastMessage[] = [];
  private timerState = new Map<number, ToastTimerState>();

  private readonly DEFAULT_DURATION = 5000;
  private readonly SWIPE_DISMISS_THRESHOLD_PERCENT = 0.4;

  // Touch handling state (non-reactive)
  private touchStartX = 0;
  private touchMoveX = 0;
  private swipingToastId: number | null = null;
  private swipedElement: HTMLElement | null = null;

  constructor() {
    // Best Practice: Effects for side effects (timers), not for data copying
    effect(() => {
      const newToasts = this.toastService.toasts();
      
      // Diffing logic to identify added/removed toasts
      const previousIds = new Set(this._previousToasts.map(t => t.id));
      const currentIds = new Set(newToasts.map(t => t.id));

      // 1. Cleanup removed toasts
      this.timerState.forEach((_, id) => {
        if (!currentIds.has(id)) {
          this.clearTimer(id);
        }
      });

      // 2. Initialize timers for added toasts
      const addedToasts = newToasts.filter(t => !previousIds.has(t.id));
      
      addedToasts.forEach(toast => {
        const duration = toast.duration ?? this.DEFAULT_DURATION;
        if (duration > 0) {
          this.timerState.set(toast.id, {
            timerId: null,
            startTime: Date.now(),
            remaining: duration
          });
          
          // Only start if not currently paused by hover/touch
          if (!this.isHovering()) {
            this.runTimer(toast.id);
          }
        }
      });

      // Update private cache
      this._previousToasts = newToasts;
    });
  }

  ngOnDestroy(): void {
    this.clearAllTimers();
  }

  // --- Timer Logic ---

  private runTimer(id: number): void {
    const state = this.timerState.get(id);
    if (!state || state.remaining <= 0) return;
    
    if (state.timerId) clearTimeout(state.timerId);

    state.startTime = Date.now();
    state.timerId = setTimeout(() => {
      this.closeToast(id);
    }, state.remaining);
  }

  pauseAllTimers(): void {
    this.isHovering.set(true); // Update signal
    this.timerState.forEach((state) => {
      if (state.timerId) {
        clearTimeout(state.timerId);
        state.timerId = null;
        const elapsed = Date.now() - state.startTime;
        state.remaining = Math.max(0, state.remaining - elapsed);
      }
    });
  }

  resumeAllTimers(): void {
    this.isHovering.set(false); // Update signal
    this.timerState.forEach((state, id) => {
      if (state.remaining < 1000) {
        state.remaining = 1000; // Ensure visible minimum time
      }
      this.runTimer(id);
    });
  }

  private clearTimer(id: number): void {
    const state = this.timerState.get(id);
    if (state?.timerId) {
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

  // --- User Actions ---

  closeToast(id: number): void {
    this.clearTimer(id); 
    const wrapper = document.getElementById('toast-' + id);
    const card = wrapper?.querySelector('.toast-card');
    
    // Add exit animation class before removing
    if (card) {
      card.classList.add('dismissing');
      setTimeout(() => {
        this.toastService.removeToast(id);
      }, 300); // Match CSS animation duration
    } else {
      this.toastService.removeToast(id);
    }
  }

  toggleExpanded(event: MouseEvent): void {
    event.stopPropagation();
    this.isExpanded.update(v => !v);
  }

  clearAllToasts(event: MouseEvent): void {
    event.stopPropagation();
    this.clearAllTimers();
    this.toastService.clearAll();
  }

  // --- Helpers ---

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

  // --- Touch Handling ---

  handleTouchStart(event: TouchEvent, toastId: number): void {
    if (event.touches.length !== 1) return;
    this.pauseAllTimers(); 
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
    
    // Only allow swiping right
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
    
    // Dismiss if swiped more than 40% width
    if (deltaX > width * this.SWIPE_DISMISS_THRESHOLD_PERCENT) {
      this.closeToast(toast.id);
    } else {
      // Reset position
      this.swipedElement.style.transform = '';
      this.swipedElement.style.opacity = '';
      this.resumeAllTimers();
    }
    
    this.swipingToastId = null;
    this.swipedElement = null;
  }
}