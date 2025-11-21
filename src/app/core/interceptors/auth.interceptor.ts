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
  const userId = authService.getUserId();
  const username = authService.getUsername();
  
  let authReq = req;

  // Prepare headers object to ensure we don't overwrite existing ones unless necessary
  const headersToSet: Record<string, string> = {};

  // 1. Attach Bearer Token
  if (token && !req.headers.has('Authorization')) {
    headersToSet['Authorization'] = `Bearer ${token}`;
  }

  // 2. Attach User Tracing Headers (Global)
  // This allows the BE to always know who called the API without payload changes
  if (userId && !req.headers.has('X-User-Id')) {
    headersToSet['X-User-Id'] = userId;
  }
  
  if (username && !req.headers.has('X-User-Name')) {
    // Encode to ensure safety with special characters in headers
    headersToSet['X-User-Name'] = encodeURIComponent(username);
  }

  // Clone request with new headers if we have any to add
  if (Object.keys(headersToSet).length > 0) {
    authReq = req.clone({
      setHeaders: headersToSet
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