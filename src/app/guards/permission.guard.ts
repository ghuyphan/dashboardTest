import { inject } from '@angular/core';
import { CanActivateFn, Router, ActivatedRouteSnapshot } from '@angular/router';
import { AuthService } from '../services/auth.service';

/**
 * This guard checks if the currently logged-in user has a specific permission.
 * It should be used on routes *inside* a route protected by authGuard.
 * * It requires a `permission` string to be set in the route's `data` property.
 * e.g., { path: 'users', component: ..., canActivate: [permissionGuard], data: { permission: 'CAN_VIEW_USERS' } }
 */
export const permissionGuard: CanActivateFn = (route: ActivatedRouteSnapshot, state) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  // Get the required permission from the route's data property
  const requiredPermission = route.data['permission'];

  if (!requiredPermission) {
    // This is a developer error. A route using this guard MUST provide a permission.
    console.error('PermissionGuard: Route is missing "permission" property in data.', route.pathFromRoot);
    // You could also throw an error: throw new Error('Route missing permission data');
    // For safety, deny access
    router.navigate(['/app/home']); // or a '/forbidden' page
    return false;
  }

  // Use the new hasPermission() method from AuthService
  if (authService.hasPermission(requiredPermission)) {
    return true; // User has the permission, allow access
  } else {
    // User does not have the permission
    console.warn(`PermissionGuard: Access denied - User lacks permission: '${requiredPermission}'. Redirecting to /app/home.`);
    // Redirect to a "forbidden" page or back to home
    router.navigate(['/app/home']); 
    return false; // Prevent activation
  }
};