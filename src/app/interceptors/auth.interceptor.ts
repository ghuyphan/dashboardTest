import { inject } from '@angular/core';
import { HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http';
import { AuthService } from '../services/auth.service';
import { environment } from '../../environments/environment.development';
import { catchError } from 'rxjs/operators';
import { throwError } from 'rxjs';

/**
 * HTTP Interceptor that:
 * 1. Automatically attaches authentication tokens to outgoing requests.
 * 2. Catches 401 Unauthorized errors (token expired) and redirects to login.
 */
export const authInterceptor: HttpInterceptorFn = (request, next) => {
  
  // Inject services
  const authService = inject(AuthService);
  const loginUrl = environment.authUrl;

  // Skip token attachment and error handling for login requests 
  // (The login component handles its own 401/errors)
  if (request.url.includes(loginUrl)) {
    return next(request);
  }

  // Retrieve the current access token
  const token = authService.getAccessToken();
  let authReq = request;

  // If a token exists, clone the request and attach the Authorization header
  if (token) {
    authReq = request.clone({
      setHeaders: {
        Authorization: `Bearer ${token}`
      }
    });
  }

  // Proceed with request, but pipe the response to catch errors
  return next(authReq).pipe(
    catchError((error: HttpErrorResponse) => {
      if (error.status === 401) {
        // Token has expired or is invalid.
        // Perform cleanup and redirect to login page.
        authService.logout();
      }
      
      // Re-throw the error so specific components can still handle it if needed
      return throwError(() => error);
    })
  );
};