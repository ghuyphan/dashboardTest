import { Directive, Input, TemplateRef, ViewContainerRef, effect } from '@angular/core';
import { AuthService } from '../../core/services/auth.service';

@Directive({
  selector: '[appHasPermission]',
  standalone: true 
})
export class HasPermissionDirective {
  private hasView = false;
  private requiredPermissions: string[] = [];

  constructor(
    private templateRef: TemplateRef<unknown>,
    private viewContainer: ViewContainerRef,
    private authService: AuthService
  ) {
    // [FIX] Use effect instead of subscription
    effect(() => {
      const user = this.authService.currentUser();
      this.updateView(user?.permissions || []);
    });
  }

  @Input() set appHasPermission(permission: string | string[] | undefined) {
    if (!permission) {
      this.requiredPermissions = [];
    } else {
      this.requiredPermissions = Array.isArray(permission) ? permission : [permission];
    }
    // Trigger an update immediately
    this.updateView(this.authService.getUserPermissions());
  }

  private updateView(userPermissions: string[]): void {
    const hasPermission = this.requiredPermissions.length === 0 || 
      this.requiredPermissions.some(
        p => userPermissions.includes(p)
      );

    if (hasPermission && !this.hasView) {
      this.viewContainer.createEmbeddedView(this.templateRef);
      this.hasView = true;
    } else if (!hasPermission && this.hasView) {
      this.viewContainer.clear();
      this.hasView = false;
    }
  }
}