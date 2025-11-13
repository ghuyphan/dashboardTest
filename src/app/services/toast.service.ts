import { Injectable } from '@angular/core';
import { Subject, Observable } from 'rxjs';
import { ToastMessage, ToastType } from '../models/toast-message.model';

@Injectable({
  providedIn: 'root'
})
export class ToastService {
  // ⭐ CHANGED: Use Subject instead of BehaviorSubject
  private toastsSubject = new Subject<ToastMessage[]>();
  toasts$: Observable<ToastMessage[]> = this.toastsSubject.asObservable();

  // Keep track of current toasts internally
  private currentToasts: ToastMessage[] = [];
  
  private toastIdCounter = 0;
  private defaultDuration = 5000; // Default display time in ms (5 seconds)

  constructor() { }

  private addToast(message: string, type: ToastType, duration?: number): void {
    const id = this.toastIdCounter++;
    const newToast: ToastMessage = {
      id,
      message,
      type,
      duration: duration ?? this.defaultDuration
    };

    // Add the new toast to the beginning of the array
    this.currentToasts = [newToast, ...this.currentToasts];
    this.toastsSubject.next(this.currentToasts);

    // Automatically remove the toast after its duration
    if (newToast.duration && newToast.duration > 0) {
      setTimeout(() => this.removeToast(id), newToast.duration);
    }
  }

  showSuccess(message: string, duration?: number): void {
    this.addToast(message, 'success', duration);
  }

  showError(message: string, duration?: number): void {
    // Keep error messages potentially longer or until dismissed manually if duration is 0 or negative
    const effectiveDuration = (duration !== undefined && duration <= 0) ? undefined : duration;
    this.addToast(message, 'error', effectiveDuration);
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