import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, BehaviorSubject, of, throwError } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';
import { Router } from '@angular/router';
import { environment } from '../../environments/environment.development';

interface LoginResponse {
  APIKey: {
    access_token: string;
    roles?: string[];
    date_token?: string;
    expires_in?: string;
    id_token?: string;
    token_type?: string;
  };
  MaKetQua: number; // Application-level status code (Not checked in tap operator below)
  ErrorMessage?: string;
  // UserInfo?: { roles: string[] }; // Alternative place roles might appear later
}

// Key for storage
const TOKEN_STORAGE_KEY = 'authToken';
const ROLES_STORAGE_KEY = 'userRoles';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private API_URL_LOGIN = environment.authUrl;
  private accessToken: string | null = null;
  private userRoles: string[] = []; // Array to store user roles/permissions
  private isLoggedInSubject = new BehaviorSubject<boolean>(false);
  public isLoggedIn$ = this.isLoggedInSubject.asObservable();

  constructor(
    private http: HttpClient,
    private router: Router
  ) {
    this.loadTokenFromStorage();
    this.loadUserRoles(); // Load roles when service initializes
    // Update login status based on whether the token is loaded
    this.isLoggedInSubject.next(!!this.accessToken);
  }

  /**
   * Loads the authentication token from localStorage or sessionStorage.
   */
  private loadTokenFromStorage(): void {
    let storedToken: string | null = null;
    let storageType = 'none';

    try {
      if (typeof localStorage !== 'undefined') {
        storedToken = localStorage.getItem(TOKEN_STORAGE_KEY);
        if (storedToken) {
          storageType = 'localStorage';
        }
      }
      if (!storedToken && typeof sessionStorage !== 'undefined') {
        storedToken = sessionStorage.getItem(TOKEN_STORAGE_KEY);
        if (storedToken) {
          storageType = 'sessionStorage';
        }
      }

      if (storedToken) {
        this.accessToken = storedToken;
        console.log(`AuthService: Token loaded from ${storageType}.`);
      } else {
         this.accessToken = null;
         console.log('AuthService: No token found in storage.');
      }
    } catch (e) {
      console.error('Failed to access web storage for token', e);
      this.accessToken = null;
    }
  }

  /**
   * Logs a user in. Stores token and roles based on the 'remember' flag.
   * Relies on HTTP 2xx status code for success determination.
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
        // --- Assume success based on HTTP 2xx status ---
        console.log('Login successful (HTTP 2xx received)');
        this.accessToken = response.APIKey.access_token; // Store in memory

        // --- Extract and Store Roles (Gracefully handle absence) ---
        // ** ADJUST THIS based on where roles are in your actual API response **
        const rolesFromApi = response.APIKey.roles || []; // Use roles if present, otherwise default to []
        // const rolesFromApi = response.UserInfo?.roles || []; // Alternative example
        this.setUserRoles(rolesFromApi); // Set roles (will be [] if none provided)
        // Store token and roles
        try {
          const storage = credentials.remember ? localStorage : sessionStorage;
          const storageType = credentials.remember ? 'localStorage' : 'sessionStorage';
          const otherStorage = credentials.remember ? sessionStorage : localStorage;

          if (typeof otherStorage !== 'undefined') {
            otherStorage.removeItem(TOKEN_STORAGE_KEY);
            otherStorage.removeItem(ROLES_STORAGE_KEY);
          }

          if (typeof storage !== 'undefined') {
            storage.setItem(TOKEN_STORAGE_KEY, response.APIKey.access_token);
            storage.setItem(ROLES_STORAGE_KEY, JSON.stringify(this.userRoles)); // Store roles
            console.log(`Token and roles saved to ${storageType}.`);
          } else {
             console.warn(`${storageType} is not available.`);
          }
        } catch (e) {
           console.error('Failed to save auth data to web storage', e);
        }

        this.isLoggedInSubject.next(true); // Update login status
      }),
      catchError(this.handleError) // Handles HTTP errors (non-2xx statuses)
    );
  }

  /**
   * Logs the user out. Clears in-memory data, sessionStorage, localStorage, and state.
   */
  logout(): void {
     this.clearLocalAuthData();
  }

  /**
   * Helper to clear all local authentication state and storage.
   */
  private clearLocalAuthData(): void {
    this.accessToken = null;
    this.clearUserRoles(); // Clear roles from memory and storage
    try {
      // Remove token from BOTH storages
      if (typeof sessionStorage !== 'undefined') {
        sessionStorage.removeItem(TOKEN_STORAGE_KEY);
      }
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem(TOKEN_STORAGE_KEY);
      }
    } catch (e) {
      console.error('Failed to remove token from web storage', e);
    }
    this.isLoggedInSubject.next(false); // Set logged out state
    console.log('User logged out, state and web storage cleared.');
    // Navigate after clearing state
    this.router.navigate(['/login']);
  }

  /**
   * Gets the current access token.
   */
  getAccessToken(): string | null {
    return this.accessToken;
  }

  // --- Role Management Methods ---

  /**
   * Sets the user roles in memory and persists them to the appropriate storage.
   */
  setUserRoles(roles: string[]): void {
    this.userRoles = roles || []; // Ensure it's always an array
    console.log('User roles set:', this.userRoles);
    try {
      // Determine storage based on whether token is in localStorage (remembered) or sessionStorage
      const tokenStorage = (typeof localStorage !== 'undefined' && localStorage.getItem(TOKEN_STORAGE_KEY)) ? localStorage : sessionStorage;
      const storageType = (tokenStorage === localStorage) ? 'localStorage' : 'sessionStorage';

      if (typeof tokenStorage !== 'undefined') {
        tokenStorage.setItem(ROLES_STORAGE_KEY, JSON.stringify(this.userRoles));
        console.log(`Roles saved to ${storageType}.`);
      }
    } catch (e) {
      console.error('Failed to save roles to web storage', e);
    }
  }

  /**
   * Loads user roles from storage (localStorage first, then sessionStorage).
   * Should be called during service initialization.
   */
  loadUserRoles(): void {
    let storedRolesJson: string | null = null;
    let storageType = 'none';
    try {
      const tokenStorage = (typeof localStorage !== 'undefined' && localStorage.getItem(TOKEN_STORAGE_KEY)) ? localStorage : sessionStorage;
      storageType = (tokenStorage === localStorage) ? 'localStorage' : 'sessionStorage';

       if (typeof tokenStorage !== 'undefined') {
         storedRolesJson = tokenStorage.getItem(ROLES_STORAGE_KEY);
       }

      if (storedRolesJson) {
        this.userRoles = JSON.parse(storedRolesJson);
        console.log(`User roles loaded from ${storageType}:`, this.userRoles);
      } else {
        this.userRoles = []; // Default to empty array if nothing is stored
         console.log(`No user roles found in ${storageType}.`);
      }
    } catch (e) {
      console.error(`Failed to load/parse roles from ${storageType}`, e);
      this.userRoles = []; // Default to empty array on error
    }
  }

  /**
   * Checks if the current user has the specified role.
   */
  hasRole(role: string): boolean {
    return this.userRoles.includes(role);
  }

  /**
   * Gets a copy of the current user's roles.
   */
  getUserRoles(): string[] {
    return [...this.userRoles]; // Return a copy
  }

  /**
   * Clears user roles from memory and storage.
   */
  clearUserRoles(): void {
    this.userRoles = [];
    try {
      if (typeof sessionStorage !== 'undefined') {
        sessionStorage.removeItem(ROLES_STORAGE_KEY);
      }
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem(ROLES_STORAGE_KEY);
      }
      console.log('User roles cleared from memory and storage.');
    } catch (e) {
      console.error('Failed to remove roles from web storage', e);
    }
  }
  // --- End Role Management ---

  /**
   * Handles HTTP errors (non-2xx responses).
   */
  private handleError(error: HttpErrorResponse): Observable<never> {
    console.error('AuthService Error:', error);

    // Prioritize error message from the response body if available
    // Check if error.error exists and has a message property, otherwise use error.message
    let errorMessage = (error.error && typeof error.error === 'object' && error.error.message)
                       ? error.error.message
                       : (error.message || 'An unknown error occurred!');


    // Fallback messages based on HTTP status if no specific message is found
    if (errorMessage === 'An unknown error occurred!' || !error.error?.message) {
        if (error.status === 0 || error.status === -1) {
            errorMessage = 'Network error or could not connect to the server.';
        } else if (error.status === 401) {
            errorMessage = 'Authentication failed. Please check your credentials.';
        // Removed specific 400 check related to MaKetQua
        } else if (error.status === 400) {
            errorMessage = 'Invalid request. Please check your input.';
        } else if (error.status >= 500) {
            errorMessage = 'Server error. Please try again later.';
        }
    }

    // Return an observable error with the processed message
    return throwError(() => new Error(errorMessage));
  }
}