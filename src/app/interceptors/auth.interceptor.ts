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
  const accessToken = authService.getAccessToken(); // Get token from memory (populated by AuthService)

  // Clone the request to add the new header if token exists
  if (accessToken) {
    req = req.clone({
      setHeaders: {
        Authorization: `Bearer ${accessToken}`
      }
    });
  }

  // Handle the request and catch errors
  return next(req).pipe( // Pass the potentially cloned req
    catchError((error: HttpErrorResponse) => {
      // Handle 401 Unauthorized (likely token expired or invalid)
      // Ensure we don't try to handle errors for the login request itself
      const loginUrl = environment.authUrl; // Get login URL
      if (error.status === 401 && !req.url.includes(loginUrl)) {
        console.error('Unauthorized request (401). Logging out user via interceptor.');
        authService.logout(); // Trigger logout in AuthService
        // Optionally prevent the error from propagating further if needed
        // return EMPTY; // Requires import { EMPTY } from 'rxjs';
      }
      // For any other errors, re-throw them to be handled elsewhere
      return throwError(() => error);
    })
  );
};