import { inject } from '@angular/core';
import {
  HttpRequest,
  HttpHandlerFn,
  HttpEvent,
  HttpInterceptorFn,
  HttpErrorResponse
} from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { AuthService } from '../services/auth.service';
import { environment } from '../../environments/environment';

/**
 * Functional HTTP Interceptor to add Authorization header and handle 401 errors.
 */
export const authInterceptor: HttpInterceptorFn = (
  req: HttpRequest<any>,
  next: HttpHandlerFn
): Observable<HttpEvent<any>> => {

  // Inject AuthService using Angular's inject function
  const authService = inject(AuthService);
  const accessToken = authService.getAccessToken();
  const loginUrl = environment.authUrl; // <-- Get login URL

  // --- THIS IS THE FIX ---
  // Only add the token if it exists AND the request is NOT for the login URL
  if (accessToken && !req.url.startsWith(loginUrl)) {
    req = req.clone({
      setHeaders: {
        Authorization: `Bearer ${accessToken}`
      }
    });
  }
  // --- END OF FIX ---

  // Handle the request and catch errors
  return next(req).pipe( // Pass the potentially cloned req
    catchError((error: HttpErrorResponse) => {

      // This 401 check is correct
      if (error.status === 401 && !req.url.includes(loginUrl)) {
        console.error('Unauthorized request (401). Logging out user via interceptor.');
        authService.logout(); // Trigger logout in AuthService
      }

      // For any other errors, re-throw them to be handled elsewhere
      return throwError(() => error);
    })
  );
};