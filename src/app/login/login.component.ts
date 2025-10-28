import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule, NgClass } from '@angular/common';
import { AuthService } from '../services/auth.service';
import { ToastService } from '../services/toast.service';
import { RouterLink } from '@angular/router';

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
    remember: false
  };

  public passwordVisible: boolean = false;
  public passwordFieldType: string = 'password';

  // 2. Inject ToastService in the constructor
  constructor(
    private authService: AuthService,
    private toastService: ToastService 
  ) {}

  onSubmit() {
    if (this.isLoading) return;
    this.isLoading = true;

    this.authService.login(this.credentials).subscribe({
      next: (response) => {
        this.isLoading = false;
        // 3. Use ToastService for success message
        this.toastService.showSuccess('✅ Đăng nhập thành công! Đang chuyển hướng...');

        localStorage.setItem('authToken', response.APIKey.access_token);
        // console.log('Token:', response.APIKey.access_token);
        // Redirect logic here
      },
      error: (err) => {
        this.isLoading = false;
        // 4. Use ToastService for error message
        // Make error message potentially stay longer by setting duration to 0 (or omit duration for default)
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