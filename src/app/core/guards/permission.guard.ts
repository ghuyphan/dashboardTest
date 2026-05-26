import { inject } from '@angular/core';
import {
  CanActivateFn,
  Router,
  ActivatedRouteSnapshot,
  RouterStateSnapshot,
} from '@angular/router';
import { AuthService } from '../services/auth.service';
import { ToastService } from '../services/toast.service';

export const permissionGuard: CanActivateFn = (
  route: ActivatedRouteSnapshot,
  state: RouterStateSnapshot
) => {
  const authService = inject(AuthService);
  const router = inject(Router);
  const toastService = inject(ToastService);

  const requiredPermission = route.data['permission'] as string;

  if (!requiredPermission) {
    return router.createUrlTree(['/app/home']);
  }

  // Read the signal value synchronously
  const user = authService.currentUser();

  if (!user || !user.permissions || user.permissions.length === 0) {
    return router.createUrlTree(['/login']);
  }

  const hasPermission = user.permissions.some(userPerm =>
    userPerm.startsWith(requiredPermission)
  );

  if (hasPermission) {
    return true;
  } else {
    toastService.showWarning('Bạn không có quyền truy cập trang này');
    return router.createUrlTree(['/app/home']);
  }
};
