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
    router.navigate(['/app/home']);
    return false;
  }

  // Read the signal value synchronously
  const user = authService.currentUser();

  if (!user || !user.permissions || user.permissions.length === 0) {
    router.navigate(['/login']);
    return false;
  }

  const hasPermission = user.permissions.some(userPerm =>
    userPerm.startsWith(requiredPermission)
  );

  if (hasPermission) {
    return true;
  } else {
    router.navigate(['/app/home']);
    return false;
  }
};