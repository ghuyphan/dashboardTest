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

@Component({
  selector: 'app-toast',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './toast.component.html',
  styleUrl: './toast.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ToastComponent implements OnInit, OnDestroy {
  // Inject dependencies
  private toastService = inject(ToastService);
  private sanitizer = inject(DomSanitizer);
  private cdRef = inject(ChangeDetectorRef);

  public toasts: ToastMessage[] = [];
  public isExpanded = false; // Default to collapsed stack
  private toastSub!: Subscription;
  private activeTimers = new Map<number, any>();

  // Swipe gesture properties
  private touchStartX = 0;
  private touchMoveX = 0;
  private swipingToastId: number | null = null;
  private swipedElement: HTMLElement | null = null;
  private readonly SWIPE_DISMISS_THRESHOLD_PERCENT = 0.4;
  private readonly DEFAULT_DURATION = 5000;

  ngOnInit(): void {
    this.toastSub = this.toastService.toasts$.subscribe((newToasts) => {
      const currentIds = new Set(this.toasts.map(t => t.id));
      
      // Identify new toasts
      const addedToasts = newToasts.filter(t => !currentIds.has(t.id));

      // Clean up timers for removed toasts
      const newIds = new Set(newToasts.map((t) => t.id));
      this.activeTimers.forEach((timer, id) => {
        if (!newIds.has(id)) {
          clearTimeout(timer);
          this.activeTimers.delete(id);
        }
      });

      this.toasts = newToasts;
      
      // Auto-expand if there are many errors, otherwise default behavior
      // or reset expansion state if list becomes empty
      if (this.toasts.length === 0) {
        this.isExpanded = false;
      }

      this.cdRef.markForCheck();

      // Start timers for new toasts
      addedToasts.forEach(toast => this.startTimer(toast));
    });
  }

  ngOnDestroy(): void {
    if (this.toastSub) {
      this.toastSub.unsubscribe();
    }
    this.clearAllTimers();
  }

  // --- Timer Logic ---

  startTimer(toast: ToastMessage): void {
    const duration = toast.duration ?? this.DEFAULT_DURATION;
    if (duration > 0 && !this.activeTimers.has(toast.id)) {
      const timer = setTimeout(() => {
        this.closeToast(toast.id);
      }, duration);
      this.activeTimers.set(toast.id, timer);
    }
  }

  pauseTimer(id: number): void {
    if (this.activeTimers.has(id)) {
      clearTimeout(this.activeTimers.get(id));
      this.activeTimers.delete(id);
    }
  }

  resumeTimer(toast: ToastMessage): void {
    // Only resume if the toast still exists and isn't already closing
    if (this.toasts.find(t => t.id === toast.id)) {
      this.startTimer(toast);
    }
  }

  // --- Actions ---

  closeToast(id: number): void {
    this.pauseTimer(id);

    const wrapper = document.getElementById('toast-' + id);
    const card = wrapper?.querySelector('.toast-card');

    if (card) {
      card.classList.add('dismissing');
      // Wait for animation
      setTimeout(() => {
        this.toastService.removeToast(id);
      }, 300);
    } else {
      this.toastService.removeToast(id);
    }
  }

  clearAllToasts(event: MouseEvent): void {
    event.stopPropagation();
    this.clearAllTimers();
    this.toastService.clearAll();
    this.isExpanded = false;
  }

  private clearAllTimers(): void {
    this.activeTimers.forEach((timer) => clearTimeout(timer));
    this.activeTimers.clear();
  }

  toggleExpanded(event: MouseEvent): void {
    event.stopPropagation();
    this.isExpanded = !this.isExpanded;
  }

  // --- Helper Methods ---

  getTitle(type: ToastType): string {
    const titles: Record<ToastType, string> = {
      success: 'Thành công',
      error: 'Đã có lỗi',
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

  // --- Swipe Gestures ---

  handleTouchStart(event: TouchEvent, toastId: number): void {
    if (event.touches.length !== 1) return;
    this.pauseTimer(toastId);
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

    // Only allow swiping right to dismiss
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
      // Reset
      this.swipedElement.style.transform = '';
      this.swipedElement.style.opacity = '';
      this.resumeTimer(toast);
    }

    this.swipingToastId = null;
    this.swipedElement = null;
  }
}