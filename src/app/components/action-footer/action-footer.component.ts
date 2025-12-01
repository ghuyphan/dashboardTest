import { Component, OnInit, inject, OnDestroy } from '@angular/core';
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
export class ActionFooterComponent implements OnInit, OnDestroy {

  public actions$: Observable<FooterAction[] | null>;
  
  private footerService = inject(FooterActionService);
  public versionService = inject(VersionService);
  private toastService = inject(ToastService); 

  public appVersion = this.versionService.appVersion; 
  public isDevMode = this.versionService.isDevMode;
  
  // Easter Egg State
  private clickCount = 0;
  private clickTimer: any = null; 

  constructor() {
    this.actions$ = this.footerService.actions$;
  }

  ngOnInit(): void {}

  ngOnDestroy(): void {
    if (this.clickTimer) {
      clearTimeout(this.clickTimer);
    }
  }

  executeAction(action: FooterAction): void {
    if (action.action) {
      action.action();
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
    this.versionService.isDevMode.update(v => !v);
    
    if (this.isDevMode()) {
      this.toastService.showSuccess('Đã bật tùy chọn nhà phát triển');
    } else {
      this.toastService.showInfo('Đã tắt tùy chọn nhà phát triển');
    }
  }
}