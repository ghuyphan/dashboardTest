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
      NewPassword: ['', [Validators.required]], // Validators handled manually for custom UI feedback
      ConfirmPassword: ['', Validators.required]
    }, { validators: this.passwordMatchValidator });

    // Listen to password changes to update criteria UI
    this.form.get('NewPassword')?.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe(val => this.updatePasswordCriteria(val));
  }

  ngOnInit(): void {
    // Load current user data for the read-only section
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
      // Special chars: ~!@#$%^&*<>?/-
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
    
    // Check if all criteria are met before submitting
    const criteria = this.passwordCriteria();
    const allCriteriaMet = Object.values(criteria).every(Boolean);
    
    if (!allCriteriaMet) {
      this.toastService.showWarning('Mật khẩu mới chưa đáp ứng đủ điều kiện bảo mật.');
      return;
    }

    this.isLoading.set(true);
    this.authService.changePassword(this.form.value)
      .pipe(finalize(() => this.isLoading.set(false)))
      .subscribe({
        next: (res) => {
           // Handle API specific response codes if needed
           if (res && res.MaKetQua && res.MaKetQua !== 200) {
             this.toastService.showError(res.ErrorMessage || 'Đổi mật khẩu thất bại.');
             return;
           }
           this.toastService.showSuccess('Đổi mật khẩu thành công. Vui lòng đăng nhập lại.');
           this.authService.logout();
        },
        error: (err) => {
          const msg = err.error?.ErrorMessage || 'Đổi mật khẩu thất bại. Kiểm tra lại mật khẩu cũ.';
          this.toastService.showError(msg);
        }
      });
  }
}