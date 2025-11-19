import { Injectable } from '@angular/core';
import { Subject, Observable } from 'rxjs';
import { ToastMessage, ToastType } from '../models/toast-message.model';

@Injectable({
  providedIn: 'root'
})
export class ToastService {
  private toastsSubject = new Subject<ToastMessage[]>();
  toasts$: Observable<ToastMessage[]> = this.toastsSubject.asObservable();

  private currentToasts: ToastMessage[] = [];
  
  private toastIdCounter = 0;
  private defaultDuration = 3000;
  private MAX_TOASTS = 5;

  constructor() { }

  private addToast(message: string, type: ToastType, duration?: number | null): void {
    const id = this.toastIdCounter++;
    
    const effectiveDuration = duration === undefined ? this.defaultDuration : duration;

    const newToast: ToastMessage = {
      id,
      message,
      type,
      duration: effectiveDuration
    };

    // Check if we're at the limit
    if (this.currentToasts.length >= this.MAX_TOASTS) {
      // Remove the oldest toast (which is at the end of the array)
      this.currentToasts.pop();
    }

    // Add the new toast to the beginning of the array
    this.currentToasts = [newToast, ...this.currentToasts];
    this.toastsSubject.next(this.currentToasts);
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
    this.currentToasts = this.currentToasts.filter(toast => toast.id !== id);
    this.toastsSubject.next(this.currentToasts);
  }

  clearAll(): void {
    this.currentToasts = [];
    this.toastsSubject.next(this.currentToasts);
  }
}