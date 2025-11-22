import { Component, inject, OnInit, signal, computed, ChangeDetectionStrategy } from '@angular/core';
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

import { AuthService } from '../../core/services/auth.service';
import { ToastService } from '../../core/services/toast.service';
import { User } from '../../core/models/user.model';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

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
  }

  ngOnInit(): void {
    this.authService.currentUser$.subscribe(user => {
      this.currentUser.set(user);
    });
  }

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

    // 1. Ensure Username exists
    const username = this.authService.getUsername();
    if (!username) {
      this.toastService.showError('Lỗi phiên làm việc. Vui lòng đăng nhập lại.');
      return;
    }

    this.isLoading.set(true);
    
    this.authService.changePassword(this.form.value)
      .pipe(finalize(() => this.isLoading.set(false)))
      .subscribe({
        next: (res) => {
           // 2. Handle API Logic Success/Fail logic if status is 200 but body has error code
           if (res && res.MaKetQua && res.MaKetQua !== 200) {
             const msg = res.TenKetQua || res.ErrorMessage || 'Đổi mật khẩu thất bại.';
             this.toastService.showError(msg);
             return;
           }
           this.toastService.showSuccess('Đổi mật khẩu thành công. Vui lòng đăng nhập lại.');
           this.authService.logout();
        },
        error: (err) => {
          console.error('Change Password Error:', err);
          
          // 3. Expanded Error Parsing Logic
          let msg = 'Đổi mật khẩu thất bại. Vui lòng thử lại sau.';

          if (err.error) {
            // Check specifically for the structure often returned by backend
            if (typeof err.error === 'string') {
               msg = err.error;
            } else if (err.error.TenKetQua) {
               // "Đổi mật khẩu thất bại. Kiểm tra lại mật khẩu cũ" usually comes here
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