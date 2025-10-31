import { Directive, Input, TemplateRef, ViewContainerRef } from '@angular/core';
import { AuthService } from '../services/auth.service'; // Adjust path if needed

/**
 * A structural directive to easily show/hide elements based on permissions.
 * * @example
 * * <button *appHasPermission="'CAN_CREATE_USER'">Create User</button>
 * * * <div *appHasPermission="['CAN_EDIT_USER', 'CAN_DELETE_USER']">Admin Actions</div>
 */
@Directive({
  selector: '[appHasPermission]',
  standalone: true // Make it a standalone directive
})
export class HasPermissionDirective {
  private hasView = false;
  private requiredPermissions: string[] = [];

  constructor(
    private templateRef: TemplateRef<unknown>,
    private viewContainer: ViewContainerRef,
    private authService: AuthService
  ) {
    // You could also subscribe to currentUser$ to make it dynamic
    // if permissions could change *during* a session, but
    // for most login-based permissions, this is simpler.
  }

  @Input() set appHasPermission(permission: string | string[] | undefined) {
    if (!permission) {
      this.requiredPermissions = [];
    } else {
      this.requiredPermissions = Array.isArray(permission) ? permission : [permission];
    }
    this.updateView();
  }

  private updateView(): void {
    // Check if user has AT LEAST ONE of the required permissions
    // To check if they have ALL, change .some() to .every()
    const hasPermission = this.requiredPermissions.some(
      p => this.authService.hasPermission(p)
    );

    if (hasPermission && !this.hasView) {
      // User has permission, add the element to the DOM
      this.viewContainer.createEmbeddedView(this.templateRef);
      this.hasView = true;
    } else if (!hasPermission && this.hasView) {
      // User does not have permission, remove the element from the DOM
      this.viewContainer.clear();
      this.hasView = false;
    }
  }
}