import { HttpEvent, HttpHandlerFn, HttpInterceptorFn, HttpRequest } from '@angular/common/http';
import { inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment.development';
import { AuthService } from '../services/auth.service';

export const idTokenInterceptor: HttpInterceptorFn = (
  req: HttpRequest<unknown>,
  next: HttpHandlerFn
): Observable<HttpEvent<unknown>> => {
  const authService = inject(AuthService);
  const loginUrl = environment.authUrl;
  
  // [FIX] Check if the URL is pointing to Ollama (port 11434)
  // If it is, skip adding any headers and just pass the request through.
  if (req.url.includes('11434')) { 
    return next(req);
  }

  const targetMethods = ['POST', 'PUT', 'DELETE'];

  if (!targetMethods.includes(req.method.toUpperCase()) || req.url.includes(loginUrl)) {
    return next(req);
  }

  const idToken = authService.getIdToken();
  const userId = authService.getUserId();

  if (!idToken || !userId) {
    return next(req);
  }

  const clonedRequest = req.clone({
    setHeaders: {
      'id_token': idToken,
      'id_user': userId
    }
  });

  return next(clonedRequest);
};