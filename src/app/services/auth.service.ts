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
  MaKetQua: number; // Mã trạng thái ứng dụng
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
   * Checks 'MaKetQua' in the response body for success determination.
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
        // --- CHECK APPLICATION-LEVEL STATUS CODE ---
        if (response.MaKetQua === 200) {
          // SUCCESS (MaKetQua = 200)
          console.log('Login successful (MaKetQua: 200)');
          this.accessToken = response.APIKey.access_token; // Store in memory

          // --- Extract and Store Roles (Gracefully handle absence) ---
          const rolesFromApi = response.APIKey.roles || [];
          this.setUserRoles(rolesFromApi); // Set roles

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

        } else {
          // --- APPLICATION-LEVEL ERROR (e.g., MaKetQua 100, 101) ---
          let errorMessage = response.ErrorMessage; // Use API message if provided
          if (!errorMessage) {
            // Use custom messages based on MaKetQua
            switch (response.MaKetQua) {
              case 100:
                errorMessage = 'User, Pass không được để trống';
                break;
              case 101:
                errorMessage = 'User, Pass không đúng';
                break;
              default:
                errorMessage = `Login failed with application code: ${response.MaKetQua}`;
            }
          }
          console.error('Login failed (Application Error):', errorMessage);
          // Throw an error to be caught by catchError and propagated to the component
          throw new Error(errorMessage);
        }
      }),
      catchError(this.handleError) // Handles HTTP errors AND errors thrown from tap
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
   * Handles HTTP errors (non-2xx) or Application errors (thrown from tap).
   */
  private handleError(error: HttpErrorResponse | Error): Observable<never> {
    let errorMessage: string;

    if (error instanceof HttpErrorResponse) {
      // --- HTTP Error Logic (non-2xx) ---
      console.error('AuthService HTTP Error:', error);

      // Prioritize error message from the response body if available
      errorMessage = (error.error && typeof error.error === 'object' && error.error.message)
                     ? error.error.message
                     : (error.message || 'An unknown error occurred!');

      // Fallback messages based on HTTP status
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
      errorMessage = error.message; // Use the message we threw (e.g., 'User, Pass không đúng')
    }

    // Return an observable error with the processed message
    return throwError(() => new Error(errorMessage));
  }
}