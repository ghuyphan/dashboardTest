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

  // 1. SKIP the Proxy/LLM entirely in this interceptor
  // The 'authInterceptor' handles the Bearer token, which is all the Proxy needs.
  // We don't need to add 'id_token' or 'id_user' for the LLM.
  if (req.url.includes('11434') || req.url.includes('3000') || req.url.includes('/api/llm')) { 
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