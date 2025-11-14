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
 * Interceptor that appends user's id_token and id_user to POST, PUT, and DELETE requests.
 * 
 * SPECIAL BEHAVIOR FOR PUT & DELETE to equipment endpoints with an ID:
 * - Original: 'api/DMMay/123' 
 * - Modified: 'api/DMMay/[id_token]/[id_user]/123'
 * 
 * STANDARD BEHAVIOR FOR ALL OTHER MATCHING REQUESTS:
 * - Original: 'api/DMMay' (POST) 
 * - Modified: 'api/DMMay/[id_token]/[id_user]'
 */
export const idTokenInterceptor: HttpInterceptorFn = (
  request: HttpRequest<unknown>,
  next: HttpHandlerFn
): Observable<HttpEvent<unknown>> => {
  const authService = inject(AuthService);
  const loginUrl = environment.authUrl;

  // Check if the request method is one we need to modify
  const isTargetMethod = ['POST', 'PUT', 'DELETE'].includes(
    request.method.toUpperCase()
  );

  // Skip processing if not a target method or if it's a login request
  if (!isTargetMethod || request.url.includes(loginUrl)) {
    return next(request);
  }

  // Retrieve required authentication tokens
  const idToken = authService.getIdToken();
  const userId = authService.getUserId();

  if (idToken && userId) {
    // URL-encode tokens to ensure they're safe for use in URL paths
    const encodedIdToken = encodeURIComponent(idToken);
    const encodedUserId = encodeURIComponent(userId);

    // Get the equipment API base URL for special handling
    const equipmentCatUrl = environment.equipmentCatUrl;
    let newUrl: string;

    // Split URL to separate base path from query parameters
    const [baseUrlWithParams, ...queryParts] = request.url.split('?');
    const queryString = queryParts.join('?');

    // Handle special case for PUT/DELETE requests to equipment endpoints with IDs
    const method = request.method.toUpperCase();
    if (
      (method === 'PUT' || method === 'DELETE') &&
      baseUrlWithParams.startsWith(equipmentCatUrl + '/')
    ) {
      // Extract base URL and entity ID for special URL format
      // Format: base_url/[token]/[user]/[entity_id]
      const baseUrl = equipmentCatUrl;
      const entityId = baseUrlWithParams.substring(equipmentCatUrl.length + 1);

      newUrl = queryString
        ? `${baseUrl}/${encodedIdToken}/${encodedUserId}/${entityId}?${queryString}`
        : `${baseUrl}/${encodedIdToken}/${encodedUserId}/${entityId}`;
    } else {
      // Standard case: append tokens to the end of the URL
      // Format: original_url/[token]/[user]
      newUrl = queryString
        ? `${baseUrlWithParams}/${encodedIdToken}/${encodedUserId}?${queryString}`
        : `${request.url}/${encodedIdToken}/${encodedUserId}`;
    }

    // Clone the request with the modified URL
    const clonedRequest = request.clone({
      url: newUrl,
    });

    return next(clonedRequest);
  }
  
  authService.logout();
  return next(request);
};