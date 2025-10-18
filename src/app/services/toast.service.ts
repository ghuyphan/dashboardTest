// src/app/services/toast.service.ts
import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { ToastMessage, ToastType } from '../models/toast-message.model';

@Injectable({
  providedIn: 'root'
})

export class ToastService {
  private toastsSubject = new BehaviorSubject<ToastMessage[]>([]);
  toasts$: Observable<ToastMessage[]> = this.toastsSubject.asObservable();

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
    const currentToasts = [newToast, ...this.toastsSubject.getValue()];
    this.toastsSubject.next(currentToasts);

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
    const currentToasts = this.toastsSubject.getValue().filter(toast => toast.id !== id);
    this.toastsSubject.next(currentToasts);
  }

  clearAll(): void {
    this.toastsSubject.next([]);
  }
}