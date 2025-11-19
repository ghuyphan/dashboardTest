import { HttpEvent, HttpHandlerFn, HttpInterceptorFn, HttpRequest } from '@angular/common/http';
import { inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment.development';
import { AuthService } from '../services/auth.service';

export const idTokenInterceptor: HttpInterceptorFn = (
  req: HttpRequest<unknown>,
  next: HttpHandlerFn
): Observable<HttpEvent<unknown>> => {
  const authService = inject(AuthService);
  const loginUrl = environment.authUrl;
  const equipmentCatUrl = environment.equipmentCatUrl;
  
  const targetMethods = ['POST', 'PUT', 'DELETE'];

  // Skip if not a target method or if it's a login request
  if (!targetMethods.includes(req.method.toUpperCase()) || req.url.includes(loginUrl)) {
    return next(req);
  }

  const idToken = authService.getIdToken();
  const userId = authService.getUserId();

  // If tokens are missing, force logout (or handle gracefully)
  if (!idToken || !userId) {
    authService.logout();
    return next(req);
  }

  const newUrl = buildAuthenticatedUrl(req.url, req.method, idToken, userId, equipmentCatUrl);
  
  const clonedRequest = req.clone({ url: newUrl });
  return next(clonedRequest);
};

/**
 * Helper to construct the API URL with embedded tokens.
 * Scenario A (PUT/DELETE on Equipment w/ ID): `api/DMMay/123` -> `api/DMMay/[token]/[user]/123`
 * Scenario B (Standard): `api/DMMay` -> `api/DMMay/[token]/[user]`
 */
function buildAuthenticatedUrl(
  originalUrl: string,
  method: string,
  token: string,
  userId: string,
  equipmentBaseUrl: string
): string {
  // Encode tokens to ensure URL safety
  const encToken = encodeURIComponent(token);
  const encUser = encodeURIComponent(userId);

  // Separate URL from Query Params
  const [urlPath, queryString] = originalUrl.split('?');
  const methodUpper = method.toUpperCase();

  // Check for Scenario A: PUT/DELETE with an ID at the end of the equipment URL
  // We assume the URL starts with the equipmentBaseUrl and has an ID after it.
  const isEquipmentRequest = urlPath.startsWith(equipmentBaseUrl);
  const isModification = methodUpper === 'PUT' || methodUpper === 'DELETE';

  let newPath: string;

  if (isModification && isEquipmentRequest && urlPath.length > equipmentBaseUrl.length) {
    // Extract the ID (everything after the base URL)
    // e.g. ".../api/DMMay/123" -> idPart = "/123"
    const idPart = urlPath.substring(equipmentBaseUrl.length);
    
    // Insert tokens BEFORE the ID
    // Result: ".../api/DMMay/[token]/[user]/123"
    // Note: We remove the leading slash from idPart if needed to avoid double slashes, 
    // or ensure the base url doesn't end in one. Assuming standard formatting here:
    newPath = `${equipmentBaseUrl}/${encToken}/${encUser}${idPart}`;
  } else {
    // Scenario B: Append tokens to the end
    newPath = `${urlPath}/${encToken}/${encUser}`;
  }

  // Re-attach query parameters if they existed
  return queryString ? `${newPath}?${queryString}` : newPath;
}