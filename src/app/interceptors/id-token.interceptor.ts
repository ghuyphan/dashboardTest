import { inject } from '@angular/core';
import { HttpInterceptorFn, HttpRequest, HttpHandlerFn, HttpEvent } from '@angular/common/http';
import { Observable } from 'rxjs';
import { AuthService } from '../services/auth.service';
import { environment } from '../../environments/environment.development';

/**
 * Intercepts POST, PUT, and DELETE requests to append the user's id_token
 * and id_user to the end of the URL, separated by a '/'.
 * E.g.: 'api/DMMay' becomes 'api/DMMay/[id_token]/[id_user]'
 * E.g.: 'api/DMMay?param=1' becomes 'api/DMMay/[id_token]/[id_user]?param=1'
 */
export const idTokenInterceptor: HttpInterceptorFn = (
  request: HttpRequest<unknown>,
  next: HttpHandlerFn
): Observable<HttpEvent<unknown>> => {

  const authService = inject(AuthService);
  const loginUrl = environment.authUrl;

  // 1. Check if it's a method we should modify
  const isTargetMethod = ['POST', 'PUT', 'DELETE'].includes(request.method.toUpperCase());

  // 2. Skip if it's not a target method OR it's the login request
  if (!isTargetMethod || request.url.includes(loginUrl)) {
    return next(request);
  }

  // 3. Get BOTH the id_token and id_user from the AuthService
  const idToken = authService.getIdToken();
  const userId = authService.getUserId(); // +++ ADDED +++

  if (idToken && userId) { // +++ MODIFIED +++
    // 4. URL-encode all parts to make it safe for a URL path
    const encodedIdToken = encodeURIComponent(idToken);
    const encodedUserId = encodeURIComponent(userId); // +++ ADDED +++

    // 5. Handle URL modification, preserving query parameters
    const [baseUrl, ...queryParts] = request.url.split('?');
    const queryString = queryParts.join('?');

    // +++ MODIFIED: Append both tokens +++
    const newUrl = queryString
      ? `${baseUrl}/${encodedIdToken}/${encodedUserId}?${queryString}`
      : `${request.url}/${encodedIdToken}/${encodedUserId}`;

    // 6. Clone the request with the new URL
    const clonedRequest = request.clone({
      url: newUrl
    });

    // console.log(`idTokenInterceptor: ${request.url} -> ${newUrl}`);
    return next(clonedRequest);
  }

  // 7. One or more tokens are missing
  console.warn(`idTokenInterceptor: Missing id_token or id_user for ${request.method} request to ${request.url}`);
  authService.logout();
  return next(request);
};