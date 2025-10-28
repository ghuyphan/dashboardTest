import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, BehaviorSubject, of, throwError } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';
import { Router } from '@angular/router';
import { environment } from '../../environments/environment.development';

// Interface for the login response
interface LoginResponse {
  APIKey: {
    access_token: string;
    date_token?: string; // Optional 
    expires_in?: string; // Optional
    id_token?: string;   // Optional
    token_type?: string; // Optional
  };
  MaKetQua: number;
  ErrorMessage?: string
}

// Key for sessionStorage
const TOKEN_STORAGE_KEY = 'authToken';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  // --- Use your actual backend login URL ---
  private API_URL_LOGIN = environment.authUrl;
  // --- Optional: Add your backend logout URL if it exists ---
  // private API_URL_LOGOUT = '/api/auth/logout';

  // --- In-memory storage for quick access, initialized from sessionStorage ---
  private accessToken: string | null = null;

  // --- Reactive state for authentication status ---
  private isLoggedInSubject = new BehaviorSubject<boolean>(false);
  public isLoggedIn$ = this.isLoggedInSubject.asObservable();

  constructor(
    private http: HttpClient,
    private router: Router
  ) {
    // --- Initialize state from sessionStorage ---
    this.loadTokenFromStorage();
  }

  private loadTokenFromStorage(): void {
    try {
      // Safely access sessionStorage
      const storedToken = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem(TOKEN_STORAGE_KEY) : null;
      if (storedToken) {
        this.accessToken = storedToken;
        this.isLoggedInSubject.next(true);
        console.log('AuthService initialized: User is logged in (sessionStorage).');
      } else {
         this.isLoggedInSubject.next(false);
         console.log('AuthService initialized: User is logged out.');
      }
    } catch (e) {
      console.error('Failed to access sessionStorage', e);
      this.accessToken = null;
      this.isLoggedInSubject.next(false);
    }
  }

  /**
   * Logs a user in. Stores token in memory and sessionStorage.
   */
  login(credentials: any): Observable<LoginResponse> {
    const payload = {
      usernamE_: credentials.username,
      passworD_: credentials.password
    };

    return this.http.post<LoginResponse>(this.API_URL_LOGIN, payload, {
      headers: { 'Content-Type': 'application/json' },
    }).pipe(
      tap(response => {
        console.log('Login successful');
        console.log(response.APIKey.access_token)
        this.accessToken = response.APIKey.access_token; // Store in memory
        try {
          // --- Store token in sessionStorage ---
           if (typeof sessionStorage !== 'undefined') {
            sessionStorage.setItem(TOKEN_STORAGE_KEY, response.APIKey.access_token);
          } else {
             console.warn('sessionStorage is not available.');
          }
        } catch (e) {
           console.error('Failed to save token to sessionStorage', e);
        }
        this.isLoggedInSubject.next(true);
      }),
      catchError(this.handleError)
    );
  }

  /**
   * Logs the user out. Clears in-memory token, sessionStorage, and state.
   * Optionally calls backend logout.
   */
  logout(): void {
     // Optional: Call backend logout endpoint first
     // this.http.post(this.API_URL_LOGOUT, {}).subscribe({
     //   next: () => this.clearLocalAuthData(),
     //   error: (err) => { console.error('Backend logout failed:', err); this.clearLocalAuthData(); }
     // });
     // If no backend logout needed:
     this.clearLocalAuthData();
  }

  // Helper to clear local auth state and storage
  private clearLocalAuthData(): void {
    this.accessToken = null;
    try {
      // --- Remove token from sessionStorage ---
      if (typeof sessionStorage !== 'undefined') {
        sessionStorage.removeItem(TOKEN_STORAGE_KEY);
      }
    } catch (e) {
      console.error('Failed to remove token from sessionStorage', e);
    }
    this.isLoggedInSubject.next(false);
    console.log('User logged out, state and sessionStorage cleared.');
    this.router.navigate(['/login']); // Redirect to login (Ensure Router is imported and injected)
  }

  /**
   * Gets the current access token (reads from memory).
   */
  getAccessToken(): string | null {
    // Should already be loaded from storage on service init or set during login
    return this.accessToken;
  }

  /**
   * Basic error handler
   */
  private handleError(error: HttpErrorResponse): Observable<never> {
    console.error('AuthService Error:', error);
    // Try to get a more specific message from the backend error response
    let errorMessage = error.error?.message || error.message || 'An unknown error occurred!';

    // Default messages for common statuses if no specific message is available
    if (!error.error?.message && !error.message) {
        if (error.status === 0) {
            errorMessage = 'Network error or could not connect to the server.';
        } else if (error.status === 401) {
            errorMessage = 'Authentication failed. Please check your credentials.';
        } else if (error.status >= 500) {
            errorMessage = 'Server error. Please try again later.';
        }
    }

    // Return an observable with a user-facing error message.
    return throwError(() => new Error(errorMessage));
  }
}