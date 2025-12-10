import { Component, inject, OnInit, signal, ChangeDetectionStrategy, effect, DestroyRef, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  ReactiveFormsModule,
  FormBuilder,
  FormGroup,
  Validators,
  AbstractControl,
  ValidationErrors,
  FormControl
} from '@angular/forms';
import { finalize } from 'rxjs/operators';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import { AuthService } from '../../core/services/auth.service';
import { ToastService } from '../../core/services/toast.service';
import { ModalService } from '../../core/services/modal.service';
import { ConfirmationModalComponent } from '../../shared/components/confirmation-modal/confirmation-modal.component';
import { ThemeService } from '../../core/services/theme.service';
import { VersionService } from '../../core/services/version.service';
import { User } from '../../core/models/user.model';

interface ChangePasswordForm {
  OldPassword: FormControl<string | null>;
  NewPassword: FormControl<string | null>;
  ConfirmPassword: FormControl<string | null>;
}

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
  public themeService = inject(ThemeService); // [UPDATED] Public for template access
  public versionService = inject(VersionService);
  private destroyRef = inject(DestroyRef);

  public currentUser = signal<User | null>(null);
  public isLoading = signal<boolean>(false);

  public appVersion = this.versionService.appVersion;
  public isDevMode = this.versionService.isDevMode;

  // Easter Egg State
  private clickCount = 0;
  private clickTimer: any = null;

  public form: FormGroup<ChangePasswordForm>;

  public showOld = signal(false);
  public showNew = signal(false);
  public showConfirm = signal(false);

  public passwordCriteria = signal({
    minLength: false,
    maxLength: false,
    hasUpper: false,
    hasLower: false,
    hasNumber: false,
    hasSpecial: false
  });

  // Sequential field validation - signals to track if previous fields are filled
  public isOldPasswordFilled = signal(false);
  public isNewPasswordFilled = signal(false);

  constructor() {
    this.form = this.fb.group<ChangePasswordForm>({
      OldPassword: new FormControl('', Validators.required),
      // Initialize as disabled
      NewPassword: new FormControl({ value: '', disabled: true }, [Validators.required]),
      ConfirmPassword: new FormControl({ value: '', disabled: true }, Validators.required)
    }, { validators: this.passwordMatchValidator });

    // Track OldPassword changes to enable/disable NewPassword
    this.form.controls.OldPassword.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe(val => {
        const hasValue = !!val && val.length > 0;
        this.isOldPasswordFilled.set(hasValue);

        if (hasValue) {
          this.form.controls.NewPassword.enable({ emitEvent: false });
        } else {
          this.form.controls.NewPassword.disable({ emitEvent: false });
          this.form.controls.NewPassword.reset('', { emitEvent: false });
          // Also disable confirm password if new password is disabled
          this.form.controls.ConfirmPassword.disable({ emitEvent: false });
          this.form.controls.ConfirmPassword.reset('', { emitEvent: false });
        }
      });

    // Track NewPassword changes to enable/disable ConfirmPassword and update criteria
    this.form.controls.NewPassword.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe(val => {
        const hasValue = !!val && val.length > 0;
        this.isNewPasswordFilled.set(hasValue);
        this.updatePasswordCriteria(val || '');

        if (hasValue) {
          this.form.controls.ConfirmPassword.enable({ emitEvent: false });
        } else {
          this.form.controls.ConfirmPassword.disable({ emitEvent: false });
          this.form.controls.ConfirmPassword.reset('', { emitEvent: false });
        }
      });

    effect(() => {
      this.currentUser.set(this.authService.currentUser());
    });
  }

  ngOnInit(): void { }

  ngOnDestroy(): void {
    if (this.clickTimer) {
      clearTimeout(this.clickTimer);
    }
  }

  // [NEW] Theme Switcher Logic
  setTheme(isDark: boolean): void {
    const current = this.themeService.isDarkTheme();
    if (current !== isDark) {
      this.themeService.toggleTheme();
    }
  }

  onVersionClick(): void {
    this.clickCount++;

    if (this.clickTimer) {
      clearTimeout(this.clickTimer);
      this.clickTimer = null;
    }

    if (this.clickCount >= 5) {
      this.triggerEasterEgg();
      this.clickCount = 0;
    } else {
      this.clickTimer = setTimeout(() => {
        this.clickCount = 0;
        this.clickTimer = null;
      }, 2000);
    }
  }

  private triggerEasterEgg(): void {
    // Toggle the global state via signal
    // The Service effect will handle LocalStorage and Body Class updates
    this.versionService.isDevMode.update((v: boolean) => !v);

    if (this.isDevMode()) {
      this.toastService.showSuccess('Đã bật tùy chọn nhà phát triển');
    } else {
      this.toastService.showInfo('Đã tắt tùy chọn nhà phát triển');
    }
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
      minLength: value.length >= 8,
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
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((confirmed) => {
        if (confirmed) {
          this.performChangePassword();
        }
      });
  }

  private performChangePassword(): void {
    this.isLoading.set(true);

    const rawValue = this.form.getRawValue();

    const payload = {
      OldPassword: rawValue.OldPassword || '',
      NewPassword: rawValue.NewPassword || '',
      ConfirmPassword: rawValue.ConfirmPassword || ''
    };

    this.authService.changePassword(payload)
      .pipe(
        finalize(() => this.isLoading.set(false)),
        takeUntilDestroyed(this.destroyRef)
      )
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

          if (err.error?.TenKetQua) msg = err.error.TenKetQua;
          else if (err.error?.ErrorMessage) msg = err.error.ErrorMessage;
          else if (typeof err.error === 'string') msg = err.error;

          this.toastService.showError(msg);
        }
      });
  }
}