import { Component, inject, OnInit, signal, ChangeDetectionStrategy, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { 
  ReactiveFormsModule, 
  FormBuilder, 
  FormGroup, 
  Validators, 
  AbstractControl, 
  ValidationErrors 
} from '@angular/forms';
import { Router } from '@angular/router';
import { finalize } from 'rxjs/operators';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import { AuthService } from '../../core/services/auth.service';
import { ToastService } from '../../core/services/toast.service';
import { ModalService } from '../../core/services/modal.service';
import { ConfirmationModalComponent } from '../../components/confirmation-modal/confirmation-modal.component';
import { User } from '../../core/models/user.model';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './settings.component.html',
  styleUrl: './settings.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SettingsComponent implements OnInit {
  private fb = inject(FormBuilder);
  private authService = inject(AuthService);
  private toastService = inject(ToastService);
  private modalService = inject(ModalService);
  private router = inject(Router);

  public currentUser = signal<User | null>(null);
  public isLoading = signal<boolean>(false);
  public form: FormGroup;

  // Password Visibility Signals
  public showOld = signal(false);
  public showNew = signal(false);
  public showConfirm = signal(false);

  // Password Requirements State
  public passwordCriteria = signal({
    minLength: false,
    maxLength: false,
    hasUpper: false,
    hasLower: false,
    hasNumber: false,
    hasSpecial: false
  });

  constructor() {
    this.form = this.fb.group({
      OldPassword: ['', Validators.required],
      NewPassword: ['', [Validators.required]],
      ConfirmPassword: ['', Validators.required]
    }, { validators: this.passwordMatchValidator });

    this.form.get('NewPassword')?.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe(val => this.updatePasswordCriteria(val));

    // [FIX] Use effect to sync with AuthService signal
    effect(() => {
      this.currentUser.set(this.authService.currentUser());
    });
  }

  ngOnInit(): void {}

  private updatePasswordCriteria(value: string): void {
    if (!value) {
      this.passwordCriteria.set({
        minLength: false, maxLength: false, hasUpper: false, 
        hasLower: false, hasNumber: false, hasSpecial: false
      });
      return;
    }

    this.passwordCriteria.set({
      minLength: value.length >= 10,
      maxLength: value.length <= 20,
      hasUpper: /[A-Z]/.test(value),
      hasLower: /[a-z]/.test(value),
      hasNumber: /[0-9]/.test(value),
      hasSpecial: /[~!@#$%^&*<>?/\-]/.test(value)
    });
  }

  private passwordMatchValidator(control: AbstractControl): ValidationErrors | null {
    const newPass = control.get('NewPassword')?.value;
    const confirmPass = control.get('ConfirmPassword')?.value;
    return newPass === confirmPass ? null : { mismatch: true };
  }

  public toggleVisibility(field: 'old' | 'new' | 'confirm'): void {
    if (field === 'old') this.showOld.update(v => !v);
    if (field === 'new') this.showNew.update(v => !v);
    if (field === 'confirm') this.showConfirm.update(v => !v);
  }

  public onSubmit(): void {
    if (this.form.invalid) return;
    
    const criteria = this.passwordCriteria();
    const allCriteriaMet = Object.values(criteria).every(Boolean);
    
    if (!allCriteriaMet) {
      this.toastService.showWarning('Mật khẩu mới chưa đáp ứng đủ điều kiện bảo mật.');
      return;
    }

    const username = this.authService.getUsername();
    if (!username) {
      this.toastService.showError('Lỗi phiên làm việc. Vui lòng đăng nhập lại.');
      return;
    }

    this.modalService.open(ConfirmationModalComponent, {
      title: 'Xác nhận đổi mật khẩu',
      size: 'sm',
      context: {
        layout: 'standard',
        icon: 'fas fa-sign-out-alt',
        iconColor: 'var(--color-warning)',
        title: 'Đổi mật khẩu?',
        message: 'Bạn có chắc chắn muốn đổi mật khẩu không? Để đảm bảo an toàn, bạn sẽ được đăng xuất và cần đăng nhập lại.',
        confirmText: 'Đổi & Đăng xuất',
        cancelText: 'Hủy bỏ'
      }
    }).subscribe((confirmed) => {
      if (confirmed) {
        this.performChangePassword();
      }
    });
  }

  private performChangePassword(): void {
    this.isLoading.set(true);
    
    this.authService.changePassword(this.form.value)
      .pipe(finalize(() => this.isLoading.set(false)))
      .subscribe({
        next: (res) => {
           if (res && res.MaKetQua && Number(res.MaKetQua) !== 200) {
             const msg = res.TenKetQua || res.ErrorMessage || 'Đổi mật khẩu thất bại.';
             this.toastService.showError(msg);
             return;
           }
           this.toastService.showSuccess('Đổi mật khẩu thành công. Đang chuyển hướng...');
           setTimeout(() => {
             this.authService.logout();
           }, 1500);
        },
        error: (err) => {
          console.error('Change Password Error:', err);
          
          let msg = 'Đổi mật khẩu thất bại. Vui lòng thử lại sau.';

          if (err.error) {
            if (typeof err.error === 'string') {
               msg = err.error;
            } else if (err.error.TenKetQua) {
               msg = err.error.TenKetQua;
            } else if (err.error.ErrorMessage) {
               msg = err.error.ErrorMessage;
            } else if (err.error.message) {
               msg = err.error.message;
            }
          } else if (err.message) {
             msg = err.message;
          }

          this.toastService.showError(msg);
        }
      });
  }
}