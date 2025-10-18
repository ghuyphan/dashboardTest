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
}