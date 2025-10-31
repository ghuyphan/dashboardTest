import { ApplicationConfig, provideZoneChangeDetection, inject } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withInterceptors, HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http';
import { catchError, throwError } from 'rxjs'; 

import { routes } from './app.routes';
import { AuthService } from './services/auth.service'; 
import { environment } from '../environments/environment'; // <-- NEW: Import environment

// Define the interceptor logic directly as a function
const functionalAuthInterceptor: HttpInterceptorFn = (req, next) => {
  // Inject AuthService using Angular's inject function
  const authService = inject(AuthService);
  const accessToken = authService.getAccessToken();

  // Clone the request to add the Authorization header if a token exists
  if (accessToken) {
    req = req.clone({
      setHeaders: {
        Authorization: `Bearer ${accessToken}`
      }
    });
  }

  // Pass the cloned request instead of the original request to the next handle
  return next(req).pipe(
    catchError((error: HttpErrorResponse) => {
      
      // <-- UPDATED: Use environment.authUrl for a robust check -->
      const loginUrl = environment.authUrl; 

      // Check if it's a 401 error and not the login request itself
      if (error.status === 401 && !req.url.includes(loginUrl)) { 
        console.error('Unauthorized request (401). Logging out user via interceptor.');
        authService.logout(); // Call the logout method from AuthService
      }
      
      // Re-throw the error to allow other error handlers to process it
      return throwError(() => error);
    })
  );
};

// Application Configuration
export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes), // Provides routing capabilities
    provideHttpClient(
      // Registers the functional interceptor with HttpClient
      withInterceptors([functionalAuthInterceptor])
    )
  ]
};