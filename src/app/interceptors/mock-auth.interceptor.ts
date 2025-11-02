import {
  HttpRequest,
  HttpHandlerFn,
  HttpEvent,
  HttpResponse
} from '@angular/common/http';
import { Observable, of, timer } from 'rxjs';
import { mergeMap } from 'rxjs/operators';
import { environment } from '../../environments/environment.development';
import { mockLoginResponse, mockPermissionResponse } from './mock-data';


export const MockAuthInterceptor =
  (request: HttpRequest<unknown>, next: HttpHandlerFn): Observable<HttpEvent<unknown>> => {

    // Only run this interceptor if useMock is true in the environment
    if (environment.useMock) {

      // 1. Intercept the LOGIN request
      if (request.url === environment.authUrl) {
        console.warn('--- MOCKING LOGIN REQUEST ---');
        return timer(500).pipe( // Add a 500ms delay to simulate network
          mergeMap(() => of(new HttpResponse({
            status: 200,
            body: mockLoginResponse
          })))
        );
      }

      // 2. Intercept the PERMISSION request
      if (request.url.startsWith(environment.permissionsUrl)) {
        console.warn('--- MOCKING PERMISSION REQUEST ---');
        return timer(500).pipe( // Add a 500ms delay to simulate network
          mergeMap(() => of(new HttpResponse({
            status: 200,
            body: mockPermissionResponse
          })))
        );
      }
    }

    // If no match, let the request continue as normal
    // Note: use next(request) for functional interceptors
    return next(request);
  };