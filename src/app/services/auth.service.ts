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
    date_token?: string;
    expires_in?: string;
    id_token?: string;
    token_type?: string;
  };
  MaKetQua: number;
  ErrorMessage?: string
}

// Key for storage (can be the same for both)
const TOKEN_STORAGE_KEY = 'authToken';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private API_URL_LOGIN = environment.authUrl;
  private accessToken: string | null = null;
  private isLoggedInSubject = new BehaviorSubject<boolean>(false);
  public isLoggedIn$ = this.isLoggedInSubject.asObservable();

  constructor(
    private http: HttpClient,
    private router: Router
  ) {
    this.loadTokenFromStorage();
  }

  // --- Updated Method ---
  private loadTokenFromStorage(): void {
    let storedToken: string | null = null;
    let storageType = 'none';

    try {
      // Check localStorage first
      if (typeof localStorage !== 'undefined') {
        storedToken = localStorage.getItem(TOKEN_STORAGE_KEY);
        if (storedToken) {
          storageType = 'localStorage';
        }
      }
      // If not in localStorage, check sessionStorage
      if (!storedToken && typeof sessionStorage !== 'undefined') {
        storedToken = sessionStorage.getItem(TOKEN_STORAGE_KEY);
        if (storedToken) {
          storageType = 'sessionStorage';
        }
      }

      if (storedToken) {
        this.accessToken = storedToken;
        this.isLoggedInSubject.next(true);
        console.log(`AuthService initialized: User is logged in (${storageType}).`);
      } else {
         this.isLoggedInSubject.next(false);
         console.log('AuthService initialized: User is logged out.');
      }
    } catch (e) {
      console.error('Failed to access web storage', e);
      this.accessToken = null;
      this.isLoggedInSubject.next(false);
    }
  }

  // --- Updated Method ---
  /**
   * Logs a user in. Stores token based on the 'remember' flag.
   */
  login(credentials: {username: string, password: string, remember: boolean}): Observable<LoginResponse> {
    const payload = {
      usernamE_: credentials.username,
      passworD_: credentials.password
    };

    return this.http.post<LoginResponse>(this.API_URL_LOGIN, payload, {
      headers: { 'Content-Type': 'application/json' },
    }).pipe(
      tap(response => {
        console.log('Login successful');
        this.accessToken = response.APIKey.access_token; // Store in memory

        try {
          const storage = credentials.remember ? localStorage : sessionStorage;
          const storageType = credentials.remember ? 'localStorage' : 'sessionStorage';

          // Clear the other storage type to prevent potential conflicts
          const otherStorage = credentials.remember ? sessionStorage : localStorage;
          if (typeof otherStorage !== 'undefined') {
            otherStorage.removeItem(TOKEN_STORAGE_KEY);
          }

          // Store token in the selected storage
          if (typeof storage !== 'undefined') {
            storage.setItem(TOKEN_STORAGE_KEY, response.APIKey.access_token);
            console.log(`Token saved to ${storageType}.`);
          } else {
             console.warn(`${storageType} is not available.`);
          }
        } catch (e) {
           console.error('Failed to save token to web storage', e);
        }
        this.isLoggedInSubject.next(true);
      }),
      catchError(this.handleError)
    );
  }

  /**
   * Logs the user out. Clears in-memory token, sessionStorage, localStorage, and state.
   */
  logout(): void {
     this.clearLocalAuthData();
  }

  // --- Updated Method ---
  // Helper to clear local auth state and storage
  private clearLocalAuthData(): void {
    this.accessToken = null;
    try {
      // --- Remove token from BOTH storages ---
      if (typeof sessionStorage !== 'undefined') {
        sessionStorage.removeItem(TOKEN_STORAGE_KEY);
      }
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem(TOKEN_STORAGE_KEY);
      }
    } catch (e) {
      console.error('Failed to remove token from web storage', e);
    }
    this.isLoggedInSubject.next(false);
    console.log('User logged out, state and web storage cleared.');
    this.router.navigate(['/login']);
  }


  getAccessToken(): string | null {
    return this.accessToken;
  }


  private handleError(error: HttpErrorResponse): Observable<never> {
    console.error('AuthService Error:', error);
    let errorMessage = error.error?.message || error.message || 'An unknown error occurred!';

    if (!error.error?.message && !error.message) {
        if (error.status === 0) {
            errorMessage = 'Network error or could not connect to the server.';
        } else if (error.status === 401) {
            errorMessage = 'Authentication failed. Please check your credentials.';
        } else if (error.status >= 500) {
            errorMessage = 'Server error. Please try again later.';
        }
    }

    return throwError(() => new Error(errorMessage));
  }
}