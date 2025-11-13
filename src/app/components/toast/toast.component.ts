import { Component, ChangeDetectorRef, OnDestroy, OnInit } from '@angular/core';
import { AsyncPipe, NgClass, NgFor } from '@angular/common';
import { Observable, Subscription } from 'rxjs';
import { ToastMessage, ToastType } from '../../models/toast-message.model';
import { ToastService } from '../../services/toast.service';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';

@Component({
  selector: 'app-toast',
  standalone: true,
  imports: [NgFor, NgClass, AsyncPipe],
  templateUrl: './toast.component.html',
  styleUrl: './toast.component.scss'
})
export class ToastComponent implements OnInit, OnDestroy { 
  
  public toasts: ToastMessage[] = [];
  private toastSub!: Subscription;
  
  // --- REMOVED 'lastToastIds' ---
  // private lastToastIds = new Set<number>();

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
  this.toastSub = this.toastService.toasts$.subscribe(newToasts => {
    // Find truly new toasts by comparing IDs
    const oldIds = new Set(this.toasts.map(t => t.id));
    const newlyAddedToasts = newToasts.filter(t => !oldIds.has(t.id));
    
    // Update the component's array to match the service
    this.toasts = newToasts; 
    
    // Animate each newly added toast
    if (newlyAddedToasts.length > 0) {
      setTimeout(() => {
        newlyAddedToasts.forEach(toast => {
          const wrapper = document.getElementById('toast-' + toast.id);
          if (wrapper) {
            wrapper.classList.add('new');
            setTimeout(() => {
              wrapper.classList.remove('new');
            }, 300);
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
  }

  closeToast(id: number): void {
    const wrapper = document.getElementById('toast-' + id);
    const toast = wrapper?.querySelector('.toast'); // Target the inner .toast

    if (toast) {
      toast.classList.add('dismissing');
      setTimeout(() => {
        this.toastService.removeToast(id);
      }, 300); // Match animation duration
    } else {
      this.toastService.removeToast(id);
    }
  }

  // --- Helper functions (no changes) ---
  getTitle(type: ToastType): string {
    switch (type) {
      case 'success': return 'Thành công';
      case 'error': return 'Lỗi';
      case 'warning': return 'Cảnh báo';
      case 'info': return 'Thông tin';
      default: return 'Thông báo';
    }
  }

  getIcon(type: ToastType): SafeHtml {
    let svg = '';
    switch (type) {
      case 'success':
        svg = `<svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
        break;
      case 'error':
        svg = `<svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;
        break;
      case 'warning':
        svg = `<svg viewBox="0 0 24 24"><path d="M12 9v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>`;
        break;
      case 'info':
        svg = `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>`;
        break;
    }
    return this.sanitizer.bypassSecurityTrustHtml(svg);
  }

  getToastClass(toast: ToastMessage): string {
    return `toast-${toast.type}`;
  }

  // --- Gesture Handlers (no changes) ---
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
    if (this.swipingToastId !== toastId || !this.swipedElement || event.touches.length !== 1) {
      return;
    }
    this.touchMoveX = event.touches[0].clientX;
    const deltaX = this.touchMoveX - this.touchStartX;

    if (deltaX > 0) {
      event.preventDefault();
      const opacity = 1 - (deltaX / this.swipedElement.offsetWidth);
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
    const dismissThreshold = this.swipedElement.offsetWidth * this.SWIPE_DISMISS_THRESHOLD_PERCENT;

    this.swipedElement.style.transform = '';
    this.swipedElement.style.opacity = '';

    if (deltaX > dismissThreshold) {
      this.swipedElement.classList.add('dismissing');
      setTimeout(() => {
        this.toastService.removeToast(toastId);
        this.cdRef.markForCheck(); 
      }, 300);
    }

    this.touchStartX = 0;
    this.touchMoveX = 0;
    this.swipingToastId = null;
    this.swipedElement = null;
  }
}