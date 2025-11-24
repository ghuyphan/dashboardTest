import { Directive, TemplateRef, ViewContainerRef, effect, input } from '@angular/core';
import { AuthService } from '../../core/services/auth.service';

@Directive({
  selector: '[appHasPermission]',
  standalone: true 
})
export class HasPermissionDirective {
  private hasView = false;

  public appHasPermission = input<string | string[] | undefined>(undefined, { alias: 'appHasPermission' });

  constructor(
    private templateRef: TemplateRef<unknown>,
    private viewContainer: ViewContainerRef,
    private authService: AuthService
  ) {
    // Effect tracks signal changes automatically
    effect(() => {
      const user = this.authService.currentUser();
      const permissionInput = this.appHasPermission();
      
      // Normalize input to array
      const required = permissionInput 
        ? (Array.isArray(permissionInput) ? permissionInput : [permissionInput]) 
        : [];

      const userPermissions = user?.permissions || [];

      // If required array is empty, assume access is allowed
      const hasPermission = required.length === 0 || 
                            required.some(p => userPermissions.includes(p));

      this.updateView(hasPermission);
    });
  }

  private updateView(shouldShow: boolean): void {
    if (shouldShow && !this.hasView) {
      this.viewContainer.createEmbeddedView(this.templateRef);
      this.hasView = true;
    } else if (!shouldShow && this.hasView) {
      this.viewContainer.clear();
      this.hasView = false;
    }
  }
}