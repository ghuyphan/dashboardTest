import { HttpEvent, HttpHandlerFn, HttpInterceptorFn, HttpRequest } from '@angular/common/http';
import { inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthService } from '../services/auth.service';

export const idTokenInterceptor: HttpInterceptorFn = (
  req: HttpRequest<unknown>,
  next: HttpHandlerFn
): Observable<HttpEvent<unknown>> => {
  const authService = inject(AuthService);
  const loginUrl = environment.authUrl;
  const llmUrl = environment.llmUrl;

  // Skip the Proxy/LLM entirely in this interceptor
  // This interceptor only deals with "id_token" custom headers which the Proxy doesn't need.
  if (llmUrl && req.url.startsWith(llmUrl.replace('/api/llm', ''))) {
    return next(req);
  }

  const targetMethods = ['POST', 'PUT', 'DELETE'];

  if (!targetMethods.includes(req.method.toUpperCase()) || req.url.includes(loginUrl)) {
    return next(req);
  }

  // Use public accessors
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