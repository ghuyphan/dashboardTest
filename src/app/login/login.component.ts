import { Component, ChangeDetectionStrategy, ChangeDetectorRef, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule, NgClass } from '@angular/common';
import { AuthService } from '../services/auth.service';
import { ToastService } from '../services/toast.service';
import { RouterLink, Router } from '@angular/router';
import { ModalService } from '../services/modal.service';
import { ConfirmationModalComponent } from '../components/confirmation-modal/confirmation-modal.component';

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
  styleUrl: './login.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush // <--- 1. Enable OnPush
})
export class LoginComponent {
  // Inject ChangeDetectorRef
  private cd = inject(ChangeDetectorRef); 

  public isLoading = false;
  public credentials = {
    username: '',
    password: '',
    remember: false
  };

  public passwordVisible: boolean = false;
  public passwordFieldType: string = 'password';

  constructor(
    private authService: AuthService,
    private toastService: ToastService,
    private router: Router,
    private modalService: ModalService
  ) { }

  onSubmit() {
    if (this.isLoading) return;
    this.isLoading = true;
    // No need to markForCheck here because the event (submit) triggers detection automatically

    this.authService.login(this.credentials).subscribe({
      next: (response) => {
        this.isLoading = false;
        this.toastService.showSuccess('Đăng nhập thành công!');
        this.router.navigate(['/app']);
        this.cd.markForCheck(); // <--- 2. Update view after async
      },
      error: (err: any) => {
        this.isLoading = false;

        // Kiểm tra mã lỗi 104 (Tài khoản bị khóa)
        if (err.code == 104) {
          this.modalService.open(ConfirmationModalComponent, {
            title: 'Tài khoản bị khóa',
            size: 'sm',
            disableBackdropClose: true,
            context: {
              layout: 'center',
              title: '',
              icon: 'fas fa-user-shield',
              iconColor: 'var(--color-danger)',
              message: `${err.message}\n\nVui lòng liên hệ bộ phận IT qua hotline:\n☎ 1108 / 1109 để mở khóa.`,
              confirmText: 'Đã hiểu',
              cancelText: ''
            }
          });
        } else {
          // Xử lý các lỗi khác
          const errorMessage = err.message || 'Lỗi không xác định. Vui lòng thử lại.';
          this.toastService.showError(errorMessage);
        }

        console.error('Login failed', err);
        this.cd.markForCheck(); // <--- 3. Update view after async error
      }
    });
  }

  togglePasswordVisibility(): void {
    this.passwordVisible = !this.passwordVisible;
    this.passwordFieldType = this.passwordVisible ? 'text' : 'password';
    // No markForCheck needed here as it's a direct DOM event
  }
}