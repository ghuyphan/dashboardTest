import { Directive, Input, TemplateRef, ViewContainerRef, effect, signal } from '@angular/core';
import { AuthService } from '../../core/services/auth.service';

@Directive({
  selector: '[appHasPermission]',
  standalone: true 
})
export class HasPermissionDirective {
  private hasView = false;
  // Use a signal for the input to react nicely inside effect()
  private requiredPermissions = signal<string[]>([]);

  constructor(
    private templateRef: TemplateRef<unknown>,
    private viewContainer: ViewContainerRef,
    private authService: AuthService
  ) {
    // Reactive Effect: Runs when EITHER currentUser changes OR requiredPermissions input changes
    effect(() => {
      const user = this.authService.currentUser();
      const required = this.requiredPermissions();
      const userPermissions = user?.permissions || [];

      // Check if user has ANY of the required permissions (OR logic)
      // If required array is empty, we assume access is allowed (or denied, depending on your requirement. Usually empty = public)
      const hasPermission = required.length === 0 || 
                            required.some(p => userPermissions.includes(p));

      this.updateView(hasPermission);
    });
  }

  @Input() set appHasPermission(permission: string | string[] | undefined) {
    if (!permission) {
      this.requiredPermissions.set([]);
    } else {
      this.requiredPermissions.set(Array.isArray(permission) ? permission : [permission]);
    }
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