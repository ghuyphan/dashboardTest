import { inject } from '@angular/core';
import { CanActivateFn, Router, ActivatedRouteSnapshot, RouterStateSnapshot } from '@angular/router';
import { AuthService } from '../services/auth.service';

export const permissionGuard: CanActivateFn = (
  route: ActivatedRouteSnapshot,
  state: RouterStateSnapshot
) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  const requiredPermission = route.data['permission'] as string;

  if (!requiredPermission) {
    console.error('PermissionGuard: Route is missing "permission" property in data.', route.pathFromRoot);
    router.navigate(['/app/home']);
    return false;
  }

  // Read the signal value synchronously
  const user = authService.currentUser();

  if (!user || !user.permissions || user.permissions.length === 0) {
    console.warn('PermissionGuard: User not logged in or has no permissions. Redirecting to login.');
    router.navigate(['/login']);
    return false;
  }

  const hasPermission = user.permissions.some(userPerm =>
    userPerm.startsWith(requiredPermission)
  );

  if (hasPermission) {
    return true;
  } else {
    console.warn(`PermissionGuard: Access denied - User lacks permission starting with: '${requiredPermission}'. Redirecting to /app/home.`);
    router.navigate(['/app/home']);
    return false;
  }
};