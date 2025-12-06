import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthService } from '../services/auth.service';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const authService = inject(AuthService);
  const loginUrl = environment.authUrl;

  // Skip if it's a login request
  if (req.url.includes(loginUrl)) {
    return next(req);
  }

  // Get the Access Token (Bearer)
  const token = authService.getAccessToken();

  let authReq = req;

  // Attach Authorization Bearer Token if not present
  if (token && !req.headers.has('Authorization')) {
    authReq = req.clone({
      setHeaders: {
        'Authorization': `Bearer ${token}`
      }
    });
  }

  return next(authReq).pipe(
    catchError((error: unknown) => {
      if (error instanceof HttpErrorResponse && error.status === 401) {
        // Token expired or invalid -> Logout
        authService.logout();
      }
      return throwError(() => error);
    })
  );
};