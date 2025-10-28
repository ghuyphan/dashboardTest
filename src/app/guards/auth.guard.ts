import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service'; // Make sure this path is correct
import { map, take } from 'rxjs/operators';

export const authGuard: CanActivateFn = (route, state) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  // Check if the user is logged in using the isLoggedIn$ observable
  return authService.isLoggedIn$.pipe(
    take(1), // Take the latest value and complete
    map(isLoggedIn => {
      if (isLoggedIn) {
        // If logged in, allow access to the route
        return true;
      } else {
        // If not logged in, redirect to the login page
        console.warn('AuthGuard: Access denied - User not logged in. Redirecting to /login.');
        router.navigate(['/login']); // Redirect
        return false; // Prevent activation of the route
      }
    })
  );

  /* Alternative check (if you prefer not using the observable directly):
  if (authService.getAccessToken()) {
    return true; // Token exists, allow access
  } else {
    console.warn('AuthGuard: Access denied - No access token. Redirecting to /login.');
    router.navigate(['/login']); // Redirect
    return false; // Prevent activation
  }
  */
};