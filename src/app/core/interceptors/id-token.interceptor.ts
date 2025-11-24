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
  
  // Define which methods require these specific headers
  const targetMethods = ['POST', 'PUT', 'DELETE'];

  // 1. Skip if not a target method or if it's a login request
  if (!targetMethods.includes(req.method.toUpperCase()) || req.url.includes(loginUrl)) {
    return next(req);
  }

  const idToken = authService.getIdToken();
  const userId = authService.getUserId();

  // 2. If tokens are missing, force logout or proceed without headers (let BE handle auth error)
  if (!idToken || !userId) {
    // authService.logout(); // Option: Force logout here
    return next(req);
  }

  // 3. Clone the request and set the headers
  const clonedRequest = req.clone({
    setHeaders: {
      'id_token': idToken,
      'id_user': userId
    }
  });

  return next(clonedRequest);
};