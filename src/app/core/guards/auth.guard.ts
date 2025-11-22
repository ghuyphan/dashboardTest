import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

export const authGuard: CanActivateFn = (route, state) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  // Access the signal value directly by calling it as a function
  if (authService.isLoggedIn()) {
    return true;
  } else {
    console.warn('AuthGuard: Access denied - User not logged in. Redirecting to /login.');
    router.navigate(['/login']);
    return false;
  }
};