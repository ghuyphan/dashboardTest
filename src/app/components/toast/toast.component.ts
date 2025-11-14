import {
  Component,
  ChangeDetectorRef,
  OnDestroy,
  OnInit,
  ChangeDetectionStrategy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';
import { ToastMessage, ToastType } from '../../models/toast-message.model';
import { ToastService } from '../../services/toast.service';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';

@Component({
  selector: 'app-toast',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './toast.component.html',
  styleUrl: './toast.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ToastComponent implements OnInit, OnDestroy {
  public toasts: ToastMessage[] = [];
  private toastSub!: Subscription;

  private activeTimers = new Map<number, any>();

  private touchStartX = 0;
  private touchMoveX = 0;
  private swipingToastId: number | null = null;
  private swipedElement: HTMLElement | null = null;
  private readonly SWIPE_DISMISS_THRESHOLD_PERCENT = 0.5;

  constructor(
    private toastService: ToastService,
    private sanitizer: DomSanitizer,
    private cdRef: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.toastSub = this.toastService.toasts$.subscribe((newToasts) => {
      const oldIds = new Set(this.toasts.map((t) => t.id));
      const newlyAddedToasts = newToasts.filter((t) => !oldIds.has(t.id));

      const newIds = new Set(newToasts.map((t) => t.id));
      this.activeTimers.forEach((timer, id) => {
        if (!newIds.has(id)) {
          clearTimeout(timer);
          this.activeTimers.delete(id);
        }
      });

      this.toasts = newToasts;
      this.cdRef.markForCheck(); // Tell Angular to update the view

      if (newlyAddedToasts.length > 0) {
        setTimeout(() => {
          newlyAddedToasts.forEach((toast) => {
            const wrapper = document.getElementById('toast-' + toast.id);
            if (wrapper) {
              wrapper.classList.add('new');
              setTimeout(() => {
                wrapper.classList.remove('new');
              }, 250);
            }

            if (toast.duration && toast.duration > 0) {
              const timer = setTimeout(() => {
                this.closeToast(toast.id);
                this.activeTimers.delete(toast.id);
              }, toast.duration);
              this.activeTimers.set(toast.id, timer);
            }
          });
        }, 0);
      }
    });
  }

  ngOnDestroy(): void {
    if (this.toastSub) {
      this.toastSub.unsubscribe();
    }
    this.activeTimers.forEach((timer) => clearTimeout(timer));
    this.activeTimers.clear();
  }

  closeToast(id: number): void {
    if (this.activeTimers.has(id)) {
      clearTimeout(this.activeTimers.get(id));
      this.activeTimers.delete(id);
    }

    const wrapper = document.getElementById('toast-' + id);
    const toast = wrapper?.querySelector('.toast');

    if (toast) {
      toast.classList.add('dismissing');
      setTimeout(() => {
        this.toastService.removeToast(id);
      }, 250);
    } else {
      this.toastService.removeToast(id);
    }
  }

  // --- START OF NEW METHOD ---
  clearAllToasts(event: MouseEvent): void {
    event.stopPropagation(); // Stop click from triggering swipe logic

    // Animate all visible toasts
    this.toasts.forEach(toast => {
      const wrapper = document.getElementById('toast-' + toast.id);
      const toastEl = wrapper?.querySelector('.toast');
      if (toastEl) {
        toastEl.classList.add('dismissing');
      }
    });

    // Clear all timers
    this.activeTimers.forEach(timer => clearTimeout(timer));
    this.activeTimers.clear();

    // After animation, tell the service to clear its array
    setTimeout(() => {
      this.toastService.clearAll();
    }, 250); // Match animation duration
  }
  // --- END OF NEW METHOD ---

  trackByToast(index: number, toast: ToastMessage): number {
    return toast.id;
  }

  getTitle(type: ToastType): string {
    switch (type) {
      case 'success':
        return 'Thành công';
      case 'error':
        return 'Lỗi';
      case 'warning':
        return 'Cảnh báo';
      case 'info':
        return 'Thông tin';
      default:
        return 'Thông báo';
    }
  }

  getIcon(type: ToastType): SafeHtml {
    let iconClass = '';
    switch (type) {
      case 'success':
        iconClass = 'fas fa-check';
        break;
      case 'error':
        iconClass = 'fas fa-times';
        break;
      case 'warning':
        iconClass = 'fas fa-exclamation-triangle';
        break;
      case 'info':
        iconClass = 'fas fa-info-circle';
        break;
    }
    return this.sanitizer.bypassSecurityTrustHtml(
      `<i class="${iconClass}"></i>`
    );
  }

  getToastClass(toast: ToastMessage): string {
    return `toast-${toast.type}`;
  }

  // --- Gesture Handlers (Unchanged) ---
  handleTouchStart(event: TouchEvent, toastId: number): void {
    if (event.touches.length !== 1) {
      return;
    }
    this.touchStartX = event.touches[0].clientX;
    this.touchMoveX = this.touchStartX;
    this.swipingToastId = toastId;
    const wrapper = document.getElementById('toast-' + toastId);
    this.swipedElement = wrapper?.querySelector('.toast') as HTMLElement;

    if (this.swipedElement) {
      this.swipedElement.classList.add('swiping');
    }
  }

  handleTouchMove(event: TouchEvent, toastId: number): void {
    if (
      this.swipingToastId !== toastId ||
      !this.swipedElement ||
      event.touches.length !== 1
    ) {
      return;
    }
    this.touchMoveX = event.touches[0].clientX;
    const deltaX = this.touchMoveX - this.touchStartX;

    if (deltaX > 0) {
      event.preventDefault();
      const opacity = 1 - deltaX / this.swipedElement.offsetWidth;
      this.swipedElement.style.transform = `translateX(${deltaX}px) translateZ(0)`;
      this.swipedElement.style.opacity = `${opacity}`;
    } else {
      this.swipedElement.style.transform = 'translateX(0) translateZ(0)';
      this.swipedElement.style.opacity = '1';
    }
  }

  handleTouchEnd(event: TouchEvent, toastId: number): void {
    if (this.swipingToastId !== toastId || !this.swipedElement) {
      return;
    }
    this.swipedElement.classList.remove('swiping');
    const deltaX = this.touchMoveX - this.touchStartX;
    const dismissThreshold =
      this.swipedElement.offsetWidth * this.SWIPE_DISMISS_THRESHOLD_PERCENT;

    this.swipedElement.style.transform = '';
    this.swipedElement.style.opacity = '';

    if (deltaX > dismissThreshold) {
      this.swipedElement.classList.add('dismissing');
      setTimeout(() => {
        this.toastService.removeToast(toastId);
        this.cdRef.markForCheck();
      }, 250);
    }

    this.touchStartX = 0;
    this.touchMoveX = 0;
    this.swipingToastId = null;
    this.swipedElement = null;
  }
}