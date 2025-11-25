import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { environment } from '../../../environments/environment.development';
import { AuthService } from '../services/auth.service';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const authService = inject(AuthService);
  const loginUrl = environment.authUrl;

  // Skip if it's a login request
  if (req.url.includes(loginUrl)) {
    return next(req);
  }

  const token = authService.getAccessToken();
  
  let authReq = req;

  // Only attach the Authorization Bearer Token
  // We REMOVED X-User-Id and X-User-Name headers to prevent ID Spoofing vulnerabilities.
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
        // Token expired or invalid
        authService.logout();
      }
      return throwError(() => error);
    })
  );
};