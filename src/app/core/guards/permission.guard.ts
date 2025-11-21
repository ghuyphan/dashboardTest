import { inject } from '@angular/core';
import { CanActivateFn, Router, ActivatedRouteSnapshot, RouterStateSnapshot } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { map, take } from 'rxjs/operators';

/**
 * This guard checks if the currently logged-in user has permissions that match
 * the required permission "prefix".
 *
 * It requires a `permission` string in the route's `data` property.
 * e.g., data: { permission: 'QLThietBi.DMThietBi' }
 *
 * This will pass if the user has "QLThietBi.DMThietBi.RVIEW", "QLThietBi.DMThietBi.RCREATE", etc.
 */
export const permissionGuard: CanActivateFn = (
  route: ActivatedRouteSnapshot,
  state: RouterStateSnapshot
) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  // Get the required permission from the route's data property
  const requiredPermission = route.data['permission'] as string;

  if (!requiredPermission) {
    // This is a developer error.
    console.error('PermissionGuard: Route is missing "permission" property in data.', route.pathFromRoot);
    router.navigate(['/app/home']); // or a '/forbidden' page
    return false;
  }

  // --- UPDATED LOGIC ---
  // Must return an Observable to handle asynchronous permission loading.
  return authService.currentUser$.pipe(
    take(1), // Take the first available user value and complete
    map(user => {
      // Check if user is logged in and has permissions
      if (!user || !user.permissions || user.permissions.length === 0) {
        console.warn('PermissionGuard: User not logged in or has no permissions. Redirecting to login.');
        router.navigate(['/login']);
        return false;
      }

      // Check if ANY of the user's permissions START WITH the required permission
      const hasPermission = user.permissions.some(userPerm =>
        userPerm.startsWith(requiredPermission)
      );

      if (hasPermission) {
        return true; // User has a matching permission, allow access
      } else {
        // User does not have a matching permission
        console.warn(`PermissionGuard: Access denied - User lacks permission starting with: '${requiredPermission}'. Redirecting to /app/home.`);
        router.navigate(['/app/home']);
        return false; // Prevent activation
      }
    })
  );
};