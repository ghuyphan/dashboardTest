import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient, withInterceptors, HttpRequest, HttpHandlerFn, HttpEvent, HttpErrorResponse, HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';

import { authInterceptor } from './auth.interceptor'; // Import the functional interceptor
import { AuthService } from '../services/auth.service'; // Import the service it depends on
import { environment } from '../../environments/environment.development'; // Import environment for login URL

// --- Mock AuthService ---
// Use Partial<AuthService> for easier mocking if needed, or define specific methods.
class MockAuthService {
  accessToken: string | null = null;
  logoutCalled = false;
  // Make API_URL_LOGIN accessible for tests if needed, or use environment directly
  API_URL_LOGIN = environment.authUrl; // Use the actual environment URL

  getAccessToken(): string | null {
    // console.log('MockAuthService: getAccessToken called, returning:', this.accessToken); // Debugging
    return this.accessToken;
  }

  logout(): void {
    this.logoutCalled = true;
    this.accessToken = null; // Simulate token clearing on logout
    console.log('MockAuthService: logout called');
  }

  // Add other methods if your interceptor might eventually call them
}

// --- Mock Router ---
class MockRouter {
  navigate(commands: any[]): Promise<boolean> {
    console.log('MockRouter: navigate called with:', commands);
    return Promise.resolve(true); // Simulate successful navigation
  }
}

describe('authInterceptor', () => {
  let httpMock: HttpTestingController;
  let authService: MockAuthService;
  let httpClient: HttpClient; // To make actual requests through the interceptor chain

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        // Provide HttpClient with the interceptor under test
        provideHttpClient(withInterceptors([authInterceptor])),
        // Provide the testing backend for HttpClient
        provideHttpClientTesting(),
        // Provide the mock AuthService instead of the real one
        { provide: AuthService, useClass: MockAuthService },
        // Provide the mock Router
        { provide: Router, useClass: MockRouter }
      ]
    });

    // Inject the testing controller and the http client
    httpMock = TestBed.inject(HttpTestingController);
    httpClient = TestBed.inject(HttpClient);
    // Get the instance of the MockAuthService provided above
    // Use TestBed.inject(AuthService) which gets the provided mock
    authService = TestBed.inject(AuthService) as unknown as MockAuthService;
  });

  afterEach(() => {
    httpMock.verify(); // Ensure no outstanding requests are lingering
  });

  // Test the basic creation/existence (optional but fine)
  it('should be created', () => {
     // For functional interceptors, you might test setup rather than instance
     expect(authInterceptor).toBeTruthy();
     expect(typeof authInterceptor).toBe('function');
  });

  it('should add the Authorization header if an access token exists', () => {
    const testToken = 'my-secret-token-123';
    authService.accessToken = testToken; // Set the token in the mock service

    // Make an HTTP call using the injected HttpClient
    httpClient.get('/api/data').subscribe();

    // Expect that a request was made and capture it
    const httpRequest = httpMock.expectOne('/api/data');

    // Assert that the header was added correctly
    expect(httpRequest.request.headers.has('Authorization')).toBeTrue();
    expect(httpRequest.request.headers.get('Authorization')).toBe(`Bearer ${testToken}`);

    // Flush the request to complete the observable chain
    httpRequest.flush({});
  });

  it('should NOT add the Authorization header if no access token exists', () => {
    authService.accessToken = null; // Ensure no token is set

    httpClient.get('/api/data').subscribe();

    const httpRequest = httpMock.expectOne('/api/data');

    // Assert that the header was NOT added
    expect(httpRequest.request.headers.has('Authorization')).toBeFalse();

    httpRequest.flush({});
  });

  it('should call authService.logout() and re-throw error on 401 for a protected URL', () => {
    authService.accessToken = 'existing-but-expired-token'; // Token exists initially

    httpClient.get('/api/protected/resource').subscribe({
      next: () => fail('should have failed with 401 error'), // Fail if request succeeds
      error: (error: HttpErrorResponse) => {
        expect(error.status).toBe(401); // Verify the error status
      }
    });

    const httpRequest = httpMock.expectOne('/api/protected/resource');
    expect(httpRequest.request.headers.get('Authorization')).toBe('Bearer existing-but-expired-token');

    // Simulate a 401 response from the backend
    httpRequest.flush('Unauthorized access', { status: 401, statusText: 'Unauthorized' });

    // Assert that the logout method was called on the mock service
    expect(authService.logoutCalled).toBeTrue();
  });

  it('should NOT call authService.logout() on 401 error for the LOGIN URL', () => {
    authService.accessToken = null; // No token for login attempt

    // Get the login URL directly from the environment import
    const loginUrl = environment.authUrl;

    httpClient.post(loginUrl, {}).subscribe({
      next: () => fail('should have failed with 401 error'),
      error: (error: HttpErrorResponse) => {
        expect(error.status).toBe(401); // Verify the error status
      }
    });

    const httpRequest = httpMock.expectOne(loginUrl);
    expect(httpRequest.request.headers.has('Authorization')).toBeFalse();

    // Simulate a 401 response (e.g., invalid credentials)
    httpRequest.flush('Invalid Credentials', { status: 401, statusText: 'Unauthorized' });

    // Assert that the logout method was NOT called
    expect(authService.logoutCalled).toBeFalse();
  });

  it('should pass through non-401 errors without calling logout', () => {
    authService.accessToken = 'valid-token';

    httpClient.get('/api/resource-error').subscribe({
      next: () => fail('should have failed with 500 error'),
      error: (error: HttpErrorResponse) => {
        expect(error.status).toBe(500); // Verify the error status
      }
    });

    const httpRequest = httpMock.expectOne('/api/resource-error');
    expect(httpRequest.request.headers.get('Authorization')).toBe('Bearer valid-token');

    // Simulate a 500 response
    httpRequest.flush('Internal Server Error', { status: 500, statusText: 'Internal Server Error' });

    // Assert that the logout method was NOT called
    expect(authService.logoutCalled).toBeFalse();
  });

});