import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

export const authGuard: CanActivateFn = (route, state) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  // Access the signal value directly
  if (authService.isLoggedIn()) {
    return true;
  } else {
    // Best Practice: Return a UrlTree to redirect internally and avoid aborted transition warnings
    return router.createUrlTree(['/login'], {
      queryParams: { returnUrl: state.url },
    });
  }
};
