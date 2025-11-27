import { Component, OnInit, inject, signal, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Observable } from 'rxjs';
import { FooterActionService } from '../../core/services/footer-action.service';
import { FooterAction } from '../../core/models/footer-action.model';
import { HasPermissionDirective } from '../../shared/directives/has-permission.directive';
import { VersionService } from '../../core/services/version.service'; 
import { ToastService } from '../../core/services/toast.service'; 

@Component({
  selector: 'app-action-footer',
  standalone: true,
  imports: [
    CommonModule, 
    HasPermissionDirective
  ],
  templateUrl: './action-footer.component.html',
  styleUrls: ['./action-footer.component.scss']
})
export class ActionFooterComponent implements OnInit, OnDestroy { // <--- Đã thêm OnDestroy

  public actions$: Observable<FooterAction[] | null>;
  
  private footerService = inject(FooterActionService);
  private versionService = inject(VersionService); 
  private toastService = inject(ToastService); 

  public appVersion = this.versionService.appVersion; 
  
  // Easter Egg State
  private clickCount = 0;
  private clickTimer: any = null; // Khởi tạo null
  public isDevMode = signal(false);

  constructor() {
    this.actions$ = this.footerService.actions$;
  }

  ngOnInit(): void {}

  // Dọn dẹp timer khi component bị hủy
  ngOnDestroy(): void {
    if (this.clickTimer) {
      clearTimeout(this.clickTimer);
    }
  }

  /**
   * Helper to execute the action's function from the model
   */
  executeAction(action: FooterAction): void {
    if (action.action) {
      action.action();
    }
  }

  /**
   * Easter Egg Handler
   * Triggers when version is clicked 5 times within 2 seconds.
   */
  onVersionClick(): void { 
    this.clickCount++;

    if (this.clickTimer) {
      clearTimeout(this.clickTimer);
      this.clickTimer = null; // Xóa ID timer cũ
    }

    if (this.clickCount >= 5) {
      this.triggerEasterEgg();
      this.clickCount = 0;
    } else {
      // Thiết lập timer mới
      this.clickTimer = setTimeout(() => {
        this.clickCount = 0;
        this.clickTimer = null; // Dọn dẹp ID khi timer chạy xong/reset
      }, 2000); 
    }
  }

  private triggerEasterEgg(): void { 
    this.isDevMode.update(v => !v);
    
    if (this.isDevMode()) {
      this.toastService.showSuccess('↑ ↑ ↓ ↓ ← → ← → B A. Chế độ Konami kích hoạt! Đã mở khóa các công cụ gỡ lỗi.');
      document.body.classList.add('dev-mode-active');
    } else {
      this.toastService.showInfo('Chế độ Konami Tắt. Tạm biệt các phím tắt bí mật.');
      document.body.classList.remove('dev-mode-active');
    }
  }
}