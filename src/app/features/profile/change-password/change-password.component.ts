import { Component, inject, ChangeDetectionStrategy, signal } from '@angular/core';
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

import { AuthService } from '../../../core/services/auth.service';
import { ToastService } from '../../../core/services/toast.service';

@Component({
  selector: 'app-change-password',
  standalone: true,
  imports: [
    CommonModule, 
    ReactiveFormsModule
  ],
  templateUrl: './change-password.component.html',
  styleUrl: './change-password.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ChangePasswordComponent {
  private fb = inject(FormBuilder);
  private authService = inject(AuthService);
  private toastService = inject(ToastService);
  private router = inject(Router);

  public form: FormGroup;
  public isLoading = signal<boolean>(false);

  // Visibility toggles
  public showOld = signal<boolean>(false);
  public showNew = signal<boolean>(false);
  public showConfirm = signal<boolean>(false);

  constructor() {
    this.form = this.fb.group({
      OldPassword: ['', [Validators.required]],
      NewPassword: ['', [Validators.required, Validators.minLength(6)]],
      ConfirmPassword: ['', [Validators.required]]
    }, { validators: this.passwordMatchValidator });
  }

  // Validator to ensure New and Confirm match
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
    if (this.form.invalid || this.isLoading()) {
      this.form.markAllAsTouched();
      return;
    }

    this.isLoading.set(true);
    const formValue = this.form.value;

    this.authService.changePassword(formValue)
      .pipe(finalize(() => this.isLoading.set(false)))
      .subscribe({
        next: (res) => {
          // Check response code if your API returns 200 but with error logic
          if (res && res.MaKetQua && res.MaKetQua !== 200) {
             this.toastService.showError(res.ErrorMessage || 'Đổi mật khẩu thất bại.');
             return;
          }
          
          this.toastService.showSuccess('Đổi mật khẩu thành công! Vui lòng đăng nhập lại.');
          this.authService.logout(); 
        },
        error: (err) => {
          console.error(err);
          const msg = err.error?.ErrorMessage || err.message || 'Đổi mật khẩu thất bại.';
          this.toastService.showError(msg);
        }
      });
  }

  public onCancel(): void {
    this.router.navigate(['/app/home']);
  }
}