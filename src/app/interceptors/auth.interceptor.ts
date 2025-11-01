import { inject } from '@angular/core';
import { HttpInterceptorFn } from '@angular/common/http';
import { AuthService } from '../services/auth.service';
import { environment } from '../../environments/environment.development';

// This is now an exported const (a function), not a class
export const authInterceptor: HttpInterceptorFn = (request, next) => {
  
  // We use inject() here instead of a constructor
  const authService = inject(AuthService);
  const loginUrl = environment.authUrl;

  // Check if the request is for the login endpoint.
  // If it is, skip all logic and just send the request.
  if (request.url.includes(loginUrl)) {
    return next(request);
  }

  // For ALL OTHER requests, get the token and attach it.
  const token = authService.getAccessToken();

  console.log(`Intercepting request to ${request.url}. Token: ${token}`);

  if (token) {
    // We have to clone the request here
    const clonedRequest = request.clone({
      setHeaders: {
        Authorization: `Bearer ${token}`
      }
    });
    return next(clonedRequest);
  }

  return next(request);
};