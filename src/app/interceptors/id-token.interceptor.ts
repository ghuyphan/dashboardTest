import { inject } from '@angular/core';
import {
  HttpInterceptorFn,
  HttpRequest,
  HttpHandlerFn,
  HttpEvent,
} from '@angular/common/http';
import { Observable } from 'rxjs';
import { AuthService } from '../services/auth.service';
import { environment } from '../../environments/environment';

/**
 * Intercepts POST, PUT, and DELETE requests to append the user's id_token
 * and id_user.
 * * SPECIAL BEHAVIOR FOR PUT & DELETE to equipmentCatUrl with an ID:
 * E.g.: 'api/DMMay/123' becomes 'api/DMMay/[id_token]/[id_user]/123'
 * * STANDARD BEHAVIOR (all other matching requests):
 * E.g.: 'api/DMMay' (POST) becomes 'api/DMMay/[id_token]/[id_user]'
 */
export const idTokenInterceptor: HttpInterceptorFn = (
  request: HttpRequest<unknown>,
  next: HttpHandlerFn
): Observable<HttpEvent<unknown>> => {
  const authService = inject(AuthService);
  const loginUrl = environment.authUrl;

  // 1. Check if it's a method we should modify
  const isTargetMethod = ['POST', 'PUT', 'DELETE'].includes(
    request.method.toUpperCase()
  );

  // 2. Skip if it's not a target method OR it's the login request
  if (!isTargetMethod || request.url.includes(loginUrl)) {
    return next(request);
  }

  // 3. Get BOTH the id_token and id_user from the AuthService
  const idToken = authService.getIdToken();
  const userId = authService.getUserId();

  if (idToken && userId) {
    // 4. URL-encode all parts to make it safe for a URL path
    const encodedIdToken = encodeURIComponent(idToken);
    const encodedUserId = encodeURIComponent(userId);

    // 5. Get API URL for equipment
    const equipmentCatUrl = environment.equipmentCatUrl;
    let newUrl: string;

    // 6. Handle URL modification
    const [baseUrlWithParams, ...queryParts] = request.url.split('?');
    const queryString = queryParts.join('?');

    // 7. --- MODIFIED LOGIC for specific PUT & DELETE requests ---
    // Check if it's a PUT or DELETE request to the equipment URL with an ID
    // e.g., PUT api/DMMay/123
    // e.g., DELETE api/DMMay/123
    const method = request.method.toUpperCase();
    if (
      (method === 'PUT' || method === 'DELETE') &&
      baseUrlWithParams.startsWith(equipmentCatUrl + '/')
    ) {
      // Extract the base URL (api/DMMay) and the ID (123)
      const baseUrl = equipmentCatUrl;
      const entityId = baseUrlWithParams.substring(equipmentCatUrl.length + 1); // Get "123"

      // Build the new URL in the format: api/DMMay/[token]/[user]/[id]
      newUrl = queryString
        ? `${baseUrl}/${encodedIdToken}/${encodedUserId}/${entityId}?${queryString}`
        : `${baseUrl}/${encodedIdToken}/${encodedUserId}/${entityId}`;
    } else {
      // 8. --- ORIGINAL LOGIC for all other POST requests ---
      // e.g., POST api/DMMay  -> api/DMMay/[token]/[user]
      newUrl = queryString
        ? `${baseUrlWithParams}/${encodedIdToken}/${encodedUserId}?${queryString}`
        : `${request.url}/${encodedIdToken}/${encodedUserId}`;
    }

    // 9. Clone the request with the new URL
    const clonedRequest = request.clone({
      url: newUrl,
    });

    // console.log(`idTokenInterceptor: ${request.url} -> ${newUrl}`);
    return next(clonedRequest);
  }

  // 10. One or more tokens are missing
  console.warn(
    `idTokenInterceptor: Missing id_token or id_user for ${request.method} request to ${request.url}`
  );
  authService.logout();
  return next(request);
};