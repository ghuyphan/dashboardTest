import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient, withInterceptors, HttpErrorResponse, HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';

import { authInterceptor } from './auth.interceptor';
import { AuthService } from '../services/auth.service';
import { environment } from '../../../environments/environment.development';

class MockAuthService {
  accessToken: string | null = null;
  logoutCalled = false;
  API_URL_LOGIN = environment.authUrl;

  getAccessToken(): string | null {
    return this.accessToken;
  }

  logout(): void {
    this.logoutCalled = true;
    this.accessToken = null;
  }
}

class MockRouter {
  navigate(commands: any[]): Promise<boolean> {
    return Promise.resolve(true);
  }
}

describe('authInterceptor', () => {
  let httpMock: HttpTestingController;
  let authService: MockAuthService;
  let httpClient: HttpClient;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        { provide: AuthService, useClass: MockAuthService },
        { provide: Router, useClass: MockRouter }
      ]
    });

    httpMock = TestBed.inject(HttpTestingController);
    httpClient = TestBed.inject(HttpClient);
    authService = TestBed.inject(AuthService) as unknown as MockAuthService;
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should be created', () => {
    expect(authInterceptor).toBeTruthy();
    expect(typeof authInterceptor).toBe('function');
  });

  it('should add the Authorization header if an access token exists', () => {
    const testToken = 'my-secret-token-123';
    authService.accessToken = testToken;

    httpClient.get('/api/data').subscribe();

    const httpRequest = httpMock.expectOne('/api/data');

    expect(httpRequest.request.headers.has('Authorization')).toBeTrue();
    expect(httpRequest.request.headers.get('Authorization')).toBe(`Bearer ${testToken}`);

    httpRequest.flush({});
  });

  it('should NOT add the Authorization header if no access token exists', () => {
    authService.accessToken = null;

    httpClient.get('/api/data').subscribe();

    const httpRequest = httpMock.expectOne('/api/data');

    expect(httpRequest.request.headers.has('Authorization')).toBeFalse();

    httpRequest.flush({});
  });

  it('should call authService.logout() and re-throw error on 401 for a protected URL', () => {
    authService.accessToken = 'existing-but-expired-token';

    httpClient.get('/api/protected/resource').subscribe({
      next: () => fail('should have failed with 401 error'),
      error: (error: HttpErrorResponse) => {
        expect(error.status).toBe(401);
      }
    });

    const httpRequest = httpMock.expectOne('/api/protected/resource');
    expect(httpRequest.request.headers.get('Authorization')).toBe('Bearer existing-but-expired-token');

    httpRequest.flush('Unauthorized access', { status: 401, statusText: 'Unauthorized' });

    expect(authService.logoutCalled).toBeTrue();
  });

  it('should NOT call authService.logout() on 401 error for the LOGIN URL', () => {
    authService.accessToken = null;
    const loginUrl = environment.authUrl;

    httpClient.post(loginUrl, {}).subscribe({
      next: () => fail('should have failed with 401 error'),
      error: (error: HttpErrorResponse) => {
        expect(error.status).toBe(401);
      }
    });

    const httpRequest = httpMock.expectOne(loginUrl);
    expect(httpRequest.request.headers.has('Authorization')).toBeFalse();

    httpRequest.flush('Invalid Credentials', { status: 401, statusText: 'Unauthorized' });

    expect(authService.logoutCalled).toBeFalse();
  });

  it('should pass through non-401 errors without calling logout', () => {
    authService.accessToken = 'valid-token';

    httpClient.get('/api/resource-error').subscribe({
      next: () => fail('should have failed with 500 error'),
      error: (error: HttpErrorResponse) => {
        expect(error.status).toBe(500);
      }
    });

    const httpRequest = httpMock.expectOne('/api/resource-error');
    expect(httpRequest.request.headers.get('Authorization')).toBe('Bearer valid-token');

    httpRequest.flush('Internal Server Error', { status: 500, statusText: 'Internal Server Error' });

    expect(authService.logoutCalled).toBeFalse();
  });
});