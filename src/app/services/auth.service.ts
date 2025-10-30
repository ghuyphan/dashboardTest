import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, BehaviorSubject, of, throwError } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';
import { Router } from '@angular/router';
import { environment } from '../../environments/environment.development';

// --- INTERFACES ---

interface LoginResponse {
  APIKey: {
    access_token: string;
    roles?: string[];
    date_token?: string;
    expires_in?: string;
    id_token?: string;
    token_type?: string;
  };
  MaKetQua: number; // Mã trạng thái ứng dụng
  ErrorMessage?: string;
}

// CHANGED: This interface matches the one in main-layout.component.ts
// It represents the user object we will store.
interface AppUser {
  username: string;
  roles: string[];
}

// --- STORAGE KEYS ---
const TOKEN_STORAGE_KEY = 'authToken';
const ROLES_STORAGE_KEY = 'userRoles';
const USERNAME_STORAGE_KEY = 'username'; // CHANGED: Added key for username


@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private API_URL_LOGIN = environment.authUrl;
  private accessToken: string | null = null;
  // private userRoles: string[] = []; // REMOVED: This is now part of currentUserSubject

  // --- Observables for Auth State ---
  private isLoggedInSubject = new BehaviorSubject<boolean>(false);
  public isLoggedIn$ = this.isLoggedInSubject.asObservable();

  // CHANGED: Added a BehaviorSubject to hold the full user object
  private currentUserSubject = new BehaviorSubject<AppUser | null>(null);
  public currentUser$ = this.currentUserSubject.asObservable(); // <-- THIS FIXES THE ERROR

  constructor(
    private http: HttpClient,
    private router: Router
  ) {
    // CHANGED: Replaced old load methods with a single initializer
    this.initializeUserFromStorage();
  }

  /**
   * CHANGED: New method to load all auth data from storage on init.
   * This runs once when the service is created (e.g., on page refresh).
   */
  private initializeUserFromStorage(): void {
    let storedToken: string | null = null;
    let storedRolesJson: string | null = null;
    let storedUsername: string | null = null;
    let storage: Storage | undefined;

    try {
      // Check localStorage first (remembered)
      if (typeof localStorage !== 'undefined' && localStorage.getItem(TOKEN_STORAGE_KEY)) {
        storage = localStorage;
      } 
      // Then check sessionStorage
      else if (typeof sessionStorage !== 'undefined' && sessionStorage.getItem(TOKEN_STORAGE_KEY)) {
        storage = sessionStorage;
      }

      if (storage) {
        storedToken = storage.getItem(TOKEN_STORAGE_KEY);
        storedRolesJson = storage.getItem(ROLES_STORAGE_KEY);
        storedUsername = storage.getItem(USERNAME_STORAGE_KEY);

        // We need all three pieces of data to be valid
        if (storedToken && storedRolesJson && storedUsername) {
          this.accessToken = storedToken;
          const roles: string[] = JSON.parse(storedRolesJson);
          
          const user: AppUser = {
            username: storedUsername,
            roles: roles
          };
          
          this.currentUserSubject.next(user); // Set the current user
          this.isLoggedInSubject.next(true); // Set login status
          console.log(`AuthService: User '${user.username}' initialized from storage.`);
          return;
        }
      }
    } catch (e) {
      console.error('Failed to initialize user from storage', e);
      // Fall through to clear data
    }

    // If we reach here, no valid session was found
    this.clearLocalAuthData(false); // Clear storage without navigating
  }


  /**
   * Logs a user in. Stores token and roles based on the 'remember' flag.
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
        if (response.MaKetQua === 200) {
          console.log('Login successful (MaKetQua: 200)');
          this.accessToken = response.APIKey.access_token;

          const rolesFromApi = response.APIKey.roles || [];

          // CHANGED: Create the AppUser object
          const user: AppUser = {
            username: credentials.username, // Get username from the form
            roles: rolesFromApi
          };

          // Store token, roles, and username
          try {
            const storage = credentials.remember ? localStorage : sessionStorage;
            const storageType = credentials.remember ? 'localStorage' : 'sessionStorage';
            const otherStorage = credentials.remember ? sessionStorage : localStorage;

            // Clear the other storage (if user switches from 'remember' to not)
            if (typeof otherStorage !== 'undefined') {
              otherStorage.removeItem(TOKEN_STORAGE_KEY);
              otherStorage.removeItem(ROLES_STORAGE_KEY);
              otherStorage.removeItem(USERNAME_STORAGE_KEY);
            }

            if (typeof storage !== 'undefined') {
              storage.setItem(TOKEN_STORAGE_KEY, response.APIKey.access_token);
              storage.setItem(ROLES_STORAGE_KEY, JSON.stringify(user.roles));
              storage.setItem(USERNAME_STORAGE_KEY, user.username); // <-- CHANGED: Store username
              console.log(`Token, roles, and username saved to ${storageType}.`);
            }
          } catch (e) {
             console.error('Failed to save auth data to web storage', e);
          }

          this.isLoggedInSubject.next(true);
          this.currentUserSubject.next(user); // <-- CHANGED: Update the current user observable

        } else {
          // ... (Application-level error handling)
          let errorMessage = response.ErrorMessage;
          if (!errorMessage) {
            switch (response.MaKetQua) {
              case 100: errorMessage = 'User, Pass không được để trống'; break;
              case 101: errorMessage = 'User, Pass không đúng'; break;
              default: errorMessage = `Login failed with application code: ${response.MaKetQua}`;
            }
          }
          console.error('Login failed (Application Error):', errorMessage);
          throw new Error(errorMessage);
        }
      }),
      catchError(this.handleError)
    );
  }

  /**
   * Logs the user out. Clears all data and navigates to login.
   */
  logout(): void {
     this.clearLocalAuthData(true); // Clear data and navigate
  }

  /**
   * Helper to clear all local authentication state and storage.
   * CHANGED: Added 'navigate' parameter.
   */
  private clearLocalAuthData(navigate: boolean = true): void {
    this.accessToken = null;
    
    try {
      // Remove data from BOTH storages
      if (typeof sessionStorage !== 'undefined') {
        sessionStorage.removeItem(TOKEN_STORAGE_KEY);
        sessionStorage.removeItem(ROLES_STORAGE_KEY);
        sessionStorage.removeItem(USERNAME_STORAGE_KEY); // <-- CHANGED
      }
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem(TOKEN_STORAGE_KEY);
        localStorage.removeItem(ROLES_STORAGE_KEY);
        localStorage.removeItem(USERNAME_STORAGE_KEY); // <-- CHANGED
      }
    } catch (e) {
      console.error('Failed to remove auth data from web storage', e);
    }
    
    this.isLoggedInSubject.next(false);
    this.currentUserSubject.next(null); // <-- CHANGED: Set current user to null
    
    console.log('User logged out, state and web storage cleared.');
    
    if (navigate) {
      this.router.navigate(['/login']);
    }
  }

  /**
   * Gets the current access token.
   */
  getAccessToken(): string | null {
    return this.accessToken;
  }

  // --- Role Management Methods ---

  // REMOVED: loadTokenFromStorage() - Handled by initializeUserFromStorage
  // REMOVED: setUserRoles() - Handled by login
  // REMOVED: loadUserRoles() - Handled by initializeUserFromStorage
  // REMOVED: clearUserRoles() - Handled by clearLocalAuthData

  /**
   * Checks if the current user has the specified role.
   * CHANGED: Reads from the currentUserSubject.
   */
  hasRole(role: string): boolean {
    const currentUser = this.currentUserSubject.getValue();
    return currentUser ? currentUser.roles.includes(role) : false;
  }

  /**
   * Gets a copy of the current user's roles.
   * CHANGED: Reads from the currentUserSubject.
   */
  getUserRoles(): string[] {
    const currentUser = this.currentUserSubject.getValue();
    return currentUser ? [...currentUser.roles] : []; // Return a copy
  }

  /**
   * Handles HTTP errors (non-2xx) or Application errors (thrown from tap).
   */
  private handleError(error: HttpErrorResponse | Error): Observable<never> {
    let errorMessage: string;

    if (error instanceof HttpErrorResponse) {
      // --- HTTP Error Logic (non-2xx) ---
      console.error('AuthService HTTP Error:', error);
      errorMessage = (error.error && typeof error.error === 'object' && error.error.message)
                     ? error.error.message
                     : (error.message || 'An unknown error occurred!');

      if (errorMessage === 'An unknown error occurred!' || !error.error?.message) {
          if (error.status === 0 || error.status === -1) {
              errorMessage = 'Network error or could not connect to the server.';
          } else if (error.status === 401) {
              errorMessage = 'Authentication failed. Please check your credentials.';
          } else if (error.status === 400) {
              errorMessage = 'Invalid request. Please check your input.';
          } else if (error.status >= 500) {
              errorMessage = 'Server error. Please try again later.';
          }
      }
    } else {
      // --- Application Error Logic (thrown from tap) ---
      console.error('AuthService App Error:', error.message);
      errorMessage = error.message; 
    }

    return throwError(() => new Error(errorMessage));
  }
}