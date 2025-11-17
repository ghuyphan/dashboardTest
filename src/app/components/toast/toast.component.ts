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
  public isExpanded = true; // Expanded by default
  private toastSub!: Subscription;
  private activeTimers = new Map<number, any>();

  // Swipe gesture properties
  private touchStartX = 0;
  private touchMoveX = 0;
  private swipingToastId: number | null = null;
  private swipedElement: HTMLElement | null = null;
  private readonly SWIPE_DISMISS_THRESHOLD_PERCENT = 0.5;
  private readonly DEFAULT_DURATION = 3000; // 3 seconds

  constructor(
    private toastService: ToastService,
    private sanitizer: DomSanitizer,
    private cdRef: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.toastSub = this.toastService.toasts$.subscribe((newToasts) => {
      const oldIds = new Set(this.toasts.map((t) => t.id));
      const newlyAddedToasts = newToasts.filter((t) => !oldIds.has(t.id));

      // Clean up timers for removed toasts
      const newIds = new Set(newToasts.map((t) => t.id));
      this.activeTimers.forEach((timer, id) => {
        if (!newIds.has(id)) {
          clearTimeout(timer);
          this.activeTimers.delete(id);
        }
      });

      this.toasts = newToasts;
      this.cdRef.markForCheck();

      // Animate and set timers for new toasts
      if (newlyAddedToasts.length > 0) {
        setTimeout(() => {
          newlyAddedToasts.forEach((toast) => {
            const wrapper = document.getElementById('toast-' + toast.id);
            if (wrapper) {
              wrapper.classList.add('new');
              setTimeout(() => wrapper.classList.remove('new'), 250);
            }

            // Use default duration if not specified
            const duration = toast.duration ?? this.DEFAULT_DURATION;
            if (duration > 0) {
              const timer = setTimeout(() => {
                this.closeToast(toast.id);
                this.activeTimers.delete(toast.id);
              }, duration);
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
    // Clear timer if exists
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

  clearAllToasts(event: MouseEvent): void {
    event.stopPropagation();

    // Animate all toasts
    this.toasts.forEach((toast) => {
      const wrapper = document.getElementById('toast-' + toast.id);
      const toastEl = wrapper?.querySelector('.toast');
      if (toastEl) {
        toastEl.classList.add('dismissing');
      }
    });

    // Clear all timers
    this.activeTimers.forEach((timer) => clearTimeout(timer));
    this.activeTimers.clear();

    // Remove all toasts after animation
    setTimeout(() => {
      this.toastService.clearAll();
      this.isExpanded = false;
    }, 250);
  }

  toggleExpanded(event: MouseEvent): void {
    event.stopPropagation();
    this.isExpanded = !this.isExpanded;
    this.cdRef.markForCheck();
  }

  trackByToast(index: number, toast: ToastMessage): number {
    return toast.id;
  }

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
      error: 'fas fa-times',
      warning: 'fas fa-exclamation-triangle',
      info: 'fas fa-info-circle',
    };
    const iconClass = icons[type] || 'fas fa-bell';
    return this.sanitizer.bypassSecurityTrustHtml(
      `<i class="${iconClass}"></i>`
    );
  }

  // Swipe gesture handlers
  handleTouchStart(event: TouchEvent, toastId: number): void {
    if (event.touches.length !== 1) return;

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
      this.swipedElement.style.opacity = `${Math.max(0, opacity)}`;
    } else {
      this.swipedElement.style.transform = 'translateX(0) translateZ(0)';
      this.swipedElement.style.opacity = '1';
    }
  }

  handleTouchEnd(event: TouchEvent, toastId: number): void {
    if (this.swipingToastId !== toastId || !this.swipedElement) return;

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