import { Injectable, signal } from '@angular/core';
import { ToastMessage, ToastType } from '../models/toast-message.model';

@Injectable({
  providedIn: 'root',
})
export class ToastService {
  // Internal writable signal for state management
  private _toasts = signal<ToastMessage[]>([]);

  // Expose read-only signal for components to consume
  public readonly toasts = this._toasts.asReadonly();

  private toastIdCounter = 0;
  private readonly defaultDuration = 5000;
  // INCREASED LIMIT to demonstrate optimized stacking
  private readonly MAX_TOASTS = 8;

  constructor() {}

  private addToast(
    message: string,
    type: ToastType,
    duration?: number | null
  ): void {
    const id = this.toastIdCounter++;

    const effectiveDuration =
      duration === undefined ? this.defaultDuration : duration;

    const newToast: ToastMessage = {
      id,
      message,
      type,
      duration: effectiveDuration,
    };

    this._toasts.update(currentToasts => {
      // If we've reached the limit, remove the oldest (last one in the array)
      // We slice 0 to MAX - 1 to make room for the new one
      const filtered =
        currentToasts.length >= this.MAX_TOASTS
          ? currentToasts.slice(0, this.MAX_TOASTS - 1)
          : currentToasts;

      // Add the new toast to the beginning
      return [newToast, ...filtered];
    });
  }

  showSuccess(message: string, duration?: number): void {
    this.addToast(message, 'success', duration);
  }

  showError(message: string, duration?: number): void {
    this.addToast(message, 'error', duration);
  }

  showInfo(message: string, duration?: number): void {
    this.addToast(message, 'info', duration);
  }

  showWarning(message: string, duration?: number): void {
    this.addToast(message, 'warning', duration);
  }

  removeToast(id: number): void {
    this._toasts.update(toasts => toasts.filter(toast => toast.id !== id));
  }

  clearAll(): void {
    this._toasts.set([]);
  }
}
