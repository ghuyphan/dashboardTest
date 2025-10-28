import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule, NgClass } from '@angular/common';
import { AuthService } from '../services/auth.service';
import { ToastService } from '../services/toast.service';
import { RouterLink, Router } from '@angular/router';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [
    FormsModule,
    CommonModule,
    NgClass,
    RouterLink
  ],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss'
})
export class LoginComponent {

  public isLoading = false;
  public credentials = {
    username: '',
    password: '',
    remember: false // This value is bound from the checkbox in the HTML
  };

  public passwordVisible: boolean = false;
  public passwordFieldType: string = 'password';

  constructor(
    private authService: AuthService,
    private toastService: ToastService,
    private router: Router
  ) {}

  onSubmit() {
    if (this.isLoading) return;
    this.isLoading = true;

    // The whole credentials object, including the 'remember' flag, is passed
    this.authService.login(this.credentials).subscribe({
      next: (response) => {
        this.isLoading = false;
        this.toastService.showSuccess('✅ Đăng nhập thành công! Đang chuyển hướng...');
        // AuthService handles token storage based on credentials.remember
        this.router.navigate(['/dashboard']);
      },
      error: (err) => {
        this.isLoading = false;
        this.toastService.showError('Tên đăng nhập hoặc mật khẩu không chính xác.', 0);
        console.error('Login failed', err);
      }
    });
  }

  togglePasswordVisibility(): void {
    this.passwordVisible = !this.passwordVisible;
    this.passwordFieldType = this.passwordVisible ? 'text' : 'password';
  }
}