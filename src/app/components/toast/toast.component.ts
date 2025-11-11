import { Component } from '@angular/core';
import { AsyncPipe, NgClass, NgFor } from '@angular/common';
import { Observable } from 'rxjs';
import { ToastMessage } from '../../models/toast-message.model';
import { ToastService } from '../../services/toast.service';

@Component({
  selector: 'app-toast',
  standalone: true,
  imports: [NgFor, NgClass, AsyncPipe],
  templateUrl: './toast.component.html',
  styleUrl: './toast.component.scss'
})
export class ToastComponent {
  toasts$: Observable<ToastMessage[]>;

  // --- START OF ADDITION: Properties for swipe gesture ---
  private touchStartX = 0;
  private touchMoveX = 0;
  private swipingToastId: number | null = null;
  private swipedElement: HTMLElement | null = null;
  private readonly SWIPE_DISMISS_THRESHOLD_PERCENT = 0.5; // Dismiss at 50% swipe
  // --- END OF ADDITION ---

  constructor(private toastService: ToastService) {
    this.toasts$ = this.toastService.toasts$;
  }

  // Method to manually close a toast
  closeToast(id: number): void {
    this.toastService.removeToast(id);
  }

  // Get CSS class based on toast type
  getToastClass(toast: ToastMessage): string {
    return `toast-${toast.type}`;
  }

  // --- START OF ADDITION: Swipe Gesture Handlers ---

  /**
   * Stores the initial touch position when a swipe begins.
   */
  handleTouchStart(event: TouchEvent, toastId: number): void {
    // Only track the first touch point
    if (event.touches.length !== 1) {
      return;
    }

    this.touchStartX = event.touches[0].clientX;
    this.touchMoveX = this.touchStartX; // Initialize moveX
    this.swipingToastId = toastId;
    this.swipedElement = document.getElementById('toast-' + toastId);

    if (this.swipedElement) {
      // Disable CSS transitions while actively swiping to follow the finger
      this.swipedElement.style.transition = 'none';
    }
  }

  /**
   * Tracks the finger movement and applies visual feedback (translate/opacity).
   */
  handleTouchMove(event: TouchEvent, toastId: number): void {
    if (this.swipingToastId !== toastId || !this.swipedElement || event.touches.length !== 1) {
      return;
    }

    this.touchMoveX = event.touches[0].clientX;
    const deltaX = this.touchMoveX - this.touchStartX;

    // We only care about swiping to the right (positive deltaX)
    if (deltaX > 0) {
      // Prevent the page from scrolling vertically while we are swiping horizontally
      event.preventDefault(); 
      
      const opacity = 1 - (deltaX / this.swipedElement.offsetWidth);
      
      // Apply the visual swipe effect
      this.swipedElement.style.transform = `translateX(${deltaX}px)`;
      this.swipedElement.style.opacity = `${opacity}`;
    } else {
      // If user tries swiping left, reset to original position
      this.swipedElement.style.transform = 'translateX(0)';
      this.swipedElement.style.opacity = '1';
    }
  }

  /**
   * Determines whether to dismiss the toast or snap it back into place.
   */
  handleTouchEnd(event: TouchEvent, toastId: number): void {
    if (this.swipingToastId !== toastId || !this.swipedElement) {
      return;
    }

    const deltaX = this.touchMoveX - this.touchStartX;
    const dismissThreshold = this.swipedElement.offsetWidth * this.SWIPE_DISMISS_THRESHOLD_PERCENT;

    if (deltaX > dismissThreshold) {
      // --- DISMISS ---
      // Re-enable transitions for the "fling" animation
      this.swipedElement.style.transition = 'all 0.2s ease-out';
      this.swipedElement.style.transform = `translateX(100%)`;
      this.swipedElement.style.opacity = '0';
      
      // Wait for the animation to finish, then remove the toast from the service
      setTimeout(() => {
        this.toastService.removeToast(toastId);
        // Note: The element will be gone, so no need to clean up its styles
      }, 200);

    } else {
      // --- SNAP BACK ---
      // Re-enable transitions for the snap-back animation
      this.swipedElement.style.transition = 'all 0.2s var(--transition-smooth)';
      this.swipedElement.style.transform = 'translateX(0)';
      this.swipedElement.style.opacity = '1';
      
      // Clean up inline styles after animation
      setTimeout(() => {
        if (this.swipedElement) {
          this.swipedElement.style.transition = '';
          this.swipedElement.style.transform = '';
          this.swipedElement.style.opacity = '';
        }
      }, 200);
    }

    // Reset swipe state
    this.touchStartX = 0;
    this.touchMoveX = 0;
    this.swipingToastId = null;
    this.swipedElement = null;
  }
  // --- END OF ADDITION ---
}