import { Directive, Input, TemplateRef, ViewContainerRef, OnDestroy } from '@angular/core';
import { AuthService } from '../../core/services/auth.service'; // Adjust path if needed
import { Subscription } from 'rxjs'; // Import Subscription

/**
 * A structural directive to easily show/hide elements based on permissions.
 * * @example
 * * <button *appHasPermission="'CAN_CREATE_USER'">Create User</button>
 * * * <div *appHasPermission="['CAN_EDIT_USER', 'CAN_DELETE_USER']">Admin Actions</div>
 */
@Directive({
  selector: '[appHasPermission]',
  standalone: true 
})
export class HasPermissionDirective implements OnDestroy { // Implement OnDestroy
  private hasView = false;
  private requiredPermissions: string[] = [];
  private authSubscription: Subscription; // Store the subscription

  constructor(
    private templateRef: TemplateRef<unknown>,
    private viewContainer: ViewContainerRef,
    private authService: AuthService
  ) {
    // Subscribe to permission changes
    this.authSubscription = this.authService.currentUser$.subscribe(user => {
      // Re-evaluate the view whenever the user object changes
      this.updateView(user?.permissions || []);
    });
  }

  @Input() set appHasPermission(permission: string | string[] | undefined) {
    if (!permission) {
      this.requiredPermissions = [];
    } else {
      this.requiredPermissions = Array.isArray(permission) ? permission : [permission];
    }
    // Trigger an update when the input property changes
    this.updateView(this.authService.getUserPermissions());
  }

  private updateView(userPermissions: string[]): void {
    // Check if user has AT LEAST ONE of the required permissions
    // To check if they have ALL, change .some() to .every()
    
    // Also check for empty array (meaning "visible to all")
    const hasPermission = this.requiredPermissions.length === 0 || 
      this.requiredPermissions.some(
        p => userPermissions.includes(p)
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

  ngOnDestroy(): void {
    // Clean up the subscription to prevent memory leaks
    if (this.authSubscription) {
      this.authSubscription.unsubscribe();
    }
  }
}