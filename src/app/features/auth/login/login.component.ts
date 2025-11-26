import { Component, ChangeDetectionStrategy, ChangeDetectorRef, inject, DestroyRef } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule, NgClass } from '@angular/common';
import { RouterLink, Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import { AuthService } from '../../../core/services/auth.service';
import { ToastService } from '../../../core/services/toast.service';
import { ModalService } from '../../../core/services/modal.service';
import { ConfirmationModalComponent } from '../../../components/confirmation-modal/confirmation-modal.component';

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
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class LoginComponent {
  private cd = inject(ChangeDetectorRef);
  private destroyRef = inject(DestroyRef);

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

    this.authService.login(this.credentials)
      .pipe(takeUntilDestroyed(this.destroyRef)) 
      .subscribe({
        next: (response) => {
          this.isLoading = false;
          this.toastService.showSuccess('Đăng nhập thành công!');
          this.router.navigate(['/app']);
          this.cd.markForCheck();
        },
        error: (err: any) => {
          this.isLoading = false;

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
            const errorMessage = err.message || 'Lỗi không xác định. Vui lòng thử lại.';
            this.toastService.showError(errorMessage);
          }

          console.error('Login failed', err);
          this.cd.markForCheck();
        }
      });
  }

  togglePasswordVisibility(): void {
    this.passwordVisible = !this.passwordVisible;
    this.passwordFieldType = this.passwordVisible ? 'text' : 'password';
  }
}