import { inject } from '@angular/core';
import { HttpInterceptorFn } from '@angular/common/http';
import { AuthService } from '../services/auth.service';
import { environment } from '../../environments/environment.development';

/**
 * HTTP Interceptor that automatically attaches authentication tokens to outgoing requests.
 * Excludes login requests to prevent token attachment during authentication.
 */
export const authInterceptor: HttpInterceptorFn = (request, next) => {
  
  // Inject the AuthService to access authentication state
  const authService = inject(AuthService);
  const loginUrl = environment.authUrl;

  // Skip token attachment for login requests to prevent circular dependency issues
  if (request.url.includes(loginUrl)) {
    return next(request);
  }

  // Retrieve the current access token from auth service
  const token = authService.getAccessToken();

  // If a token exists, clone the request and attach the Authorization header
  if (token) {
    const clonedRequest = request.clone({
      setHeaders: {
        Authorization: `Bearer ${token}`
      }
    });
    return next(clonedRequest);
  }

  // If no token exists, proceed with the original request
  return next(request);
};