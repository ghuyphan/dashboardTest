import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { ToastService } from '../services/toast.service'; // Assuming you might want toasts here too

@Component({
  selector: 'app-forgot-password',
  standalone: true,
  imports: [
    FormsModule,
    CommonModule
  ],
  templateUrl: './forgot-password.component.html',
  styleUrl: './forgot-password.component.scss' // Link to the SCSS file
})
export class ForgotPasswordComponent {
  public isLoading = false;
  public email: string = '';

  constructor(
    private toastService: ToastService
    // Inject other services like an AuthService if needed for the reset logic
  ) {}

  onSubmit() {
    if (this.isLoading) return;
    this.isLoading = true;
    console.log('Password reset requested for:', this.email);

    // --- Placeholder for password reset logic ---
    // Example: Call a service method this.authService.requestPasswordReset(this.email)
    setTimeout(() => { // Simulate API call
      this.isLoading = false;
      if (this.email.includes('@')) { // Basic email check example
        this.toastService.showSuccess(`Nếu địa chỉ email ${this.email} tồn tại trong hệ thống, bạn sẽ nhận được hướng dẫn đặt lại mật khẩu.`);
        // Optionally clear the email field or redirect
        // this.email = '';
      } else {
        this.toastService.showError('Vui lòng nhập địa chỉ email hợp lệ.');
      }
    }, 1500);
    // --- End Placeholder ---
  }

  // Optional: Add a method to navigate back to login
  goBackToLogin() {
    // Implement navigation logic if using Angular Router
    console.log('Navigate back to login');
    // Example: this.router.navigate(['/login']);
    window.history.back(); // Simple browser back for now
  }
}