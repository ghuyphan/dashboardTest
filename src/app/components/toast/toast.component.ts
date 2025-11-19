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
  // --- Dependencies ---
  private toastService = inject(ToastService);
  private sanitizer = inject(DomSanitizer);
  private cdRef = inject(ChangeDetectorRef);

  // --- State ---
  public toasts: ToastMessage[] = [];
  
  // UPDATED: Default to true so toasts list out vertically by default
  public isExpanded = true; 
  
  private toastSub!: Subscription;
  private activeTimers = new Map<number, any>();
  private isHovered = false; 

  // --- Constants ---
  private readonly DEFAULT_DURATION = 5000;
  private readonly SWIPE_THRESHOLD = 0.4; 

  // --- Swipe State ---
  private touchStartX = 0;
  private touchMoveX = 0;
  private swipingToastId: number | null = null;
  private swipedElement: HTMLElement | null = null;

  ngOnInit(): void {
    this.toastSub = this.toastService.toasts$.subscribe((newToasts) => {
      const currentIds = new Set(this.toasts.map(t => t.id));
      
      const addedToasts = newToasts.filter(t => !currentIds.has(t.id));

      // Cleanup removed timers
      const newIds = new Set(newToasts.map((t) => t.id));
      this.activeTimers.forEach((timer, id) => {
        if (!newIds.has(id)) {
          clearTimeout(timer);
          this.activeTimers.delete(id);
        }
      });

      this.toasts = newToasts;
      
      // UPDATED: Reset to expanded state if list becomes empty
      if (this.toasts.length === 0) {
        this.isExpanded = true;
      }

      this.cdRef.markForCheck();

      // Start timers only if we aren't currently hovering the container
      if (!this.isHovered) {
        addedToasts.forEach(toast => this.startTimer(toast));
      }
    });
  }

  ngOnDestroy(): void {
    if (this.toastSub) {
      this.toastSub.unsubscribe();
    }
    this.clearAllTimers();
  }

  // --- Timer Logic (Global Pause) ---

  onContainerMouseEnter(): void {
    this.isHovered = true;
    this.clearAllTimers(); 
  }

  onContainerMouseLeave(): void {
    this.isHovered = false;
    this.toasts.forEach(toast => this.startTimer(toast));
  }

  startTimer(toast: ToastMessage): void {
    if (this.isHovered || this.activeTimers.has(toast.id)) return;

    const duration = toast.duration ?? this.DEFAULT_DURATION;
    
    if (duration > 0) {
      const timer = setTimeout(() => {
        this.closeToast(toast.id);
      }, duration);
      this.activeTimers.set(toast.id, timer);
    }
  }

  private clearAllTimers(): void {
    this.activeTimers.forEach((timer) => clearTimeout(timer));
    this.activeTimers.clear();
  }

  // --- Interaction Methods ---

  closeToast(id: number): void {
    if (this.activeTimers.has(id)) {
      clearTimeout(this.activeTimers.get(id));
      this.activeTimers.delete(id);
    }

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

  clearAllToasts(event: MouseEvent): void {
    event.stopPropagation();
    this.clearAllTimers();
    
    // Clear instantly
    this.toastService.clearAll();
    // We keep isExpanded true so next toasts appear expanded
    this.isExpanded = true; 
  }

  toggleExpanded(event: MouseEvent): void {
    event.stopPropagation();
    this.isExpanded = !this.isExpanded;
  }

  // --- Display Helpers ---

  getTitle(type: ToastType): string {
    const titles: Record<ToastType, string> = {
      success: 'Thành công',
      error: 'Đã xảy ra lỗi',
      warning: 'Cảnh báo',
      info: 'Thông tin',
    };
    return titles[type] || 'Thông báo';
  }

  getIcon(type: ToastType): SafeHtml {
    const icons: Record<ToastType, string> = {
      success: 'fas fa-check',
      error: 'fas fa-times',
      warning: 'fas fa-exclamation',
      info: 'fas fa-info',
    };
    const iconClass = icons[type] || 'fas fa-bell';
    return this.sanitizer.bypassSecurityTrustHtml(`<i class="${iconClass}"></i>`);
  }

  // --- Swipe Gestures (Mobile) ---

  handleTouchStart(event: TouchEvent, toastId: number): void {
    if (event.touches.length !== 1) return;
    
    this.onContainerMouseEnter(); 

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

  handleTouchEnd(event: TouchEvent, toastId: number): void {
    if (this.swipingToastId !== toastId || !this.swipedElement) return;

    this.swipedElement.classList.remove('swiping');
    const deltaX = this.touchMoveX - this.touchStartX;
    const width = this.swipedElement.offsetWidth;

    if (deltaX > width * this.SWIPE_THRESHOLD) {
      this.closeToast(toastId);
    } else {
      this.swipedElement.style.transform = '';
      this.swipedElement.style.opacity = '';
    }

    this.swipingToastId = null;
    this.swipedElement = null;
  }
}