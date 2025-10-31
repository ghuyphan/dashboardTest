import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, BehaviorSubject, of, throwError } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';
import { Router } from '@angular/router';
import { environment } from '../../environments/environment.development';
import { User } from '../models/user.model'; // Import the updated User model

// --- INTERFACES ---
interface LoginResponse {
  APIKey: {
    access_token: string;
    roles?: string[];
    permissions?: string[]; // CHANGED: Expect permissions from API
    date_token?: string;
    expires_in?: string;
    id_token?: string;
    token_type?: string;
  };
  MaKetQua: number; // Mã trạng thái ứng dụng
  ErrorMessage?: string;
}

// --- STORAGE KEYS ---
const TOKEN_STORAGE_KEY = 'authToken';
const ROLES_STORAGE_KEY = 'userRoles';
const USERNAME_STORAGE_KEY = 'username';
const PERMISSIONS_STORAGE_KEY = 'userPermissions'; // NEW: Storage key for permissions


@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private API_URL_LOGIN = environment.authUrl;
  private accessToken: string | null = null;

  // --- Observables for Auth State ---
  private isLoggedInSubject = new BehaviorSubject<boolean>(false);
  public isLoggedIn$ = this.isLoggedInSubject.asObservable();

  // This now uses the updated 'User' model
  private currentUserSubject = new BehaviorSubject<User | null>(null);
  public currentUser$ = this.currentUserSubject.asObservable();

  constructor(
    private http: HttpClient,
    private router: Router
  ) {
    this.initializeUserFromStorage();
  }

  /**
   * Loads all auth data from storage on init.
   */
  private initializeUserFromStorage(): void {
    let storedToken: string | null = null;
    let storedRolesJson: string | null = null;
    let storedUsername: string | null = null;
    let storedPermissionsJson: string | null = null; // NEW
    let storage: Storage | undefined;

    try {
      if (typeof localStorage !== 'undefined' && localStorage.getItem(TOKEN_STORAGE_KEY)) {
        storage = localStorage;
      } 
      else if (typeof sessionStorage !== 'undefined' && sessionStorage.getItem(TOKEN_STORAGE_KEY)) {
        storage = sessionStorage;
      }

      if (storage) {
        storedToken = storage.getItem(TOKEN_STORAGE_KEY);
        storedRolesJson = storage.getItem(ROLES_STORAGE_KEY);
        storedUsername = storage.getItem(USERNAME_STORAGE_KEY);
        storedPermissionsJson = storage.getItem(PERMISSIONS_STORAGE_KEY); // NEW

        // CHANGED: Check for permissions as well
        if (storedToken && storedRolesJson && storedUsername && storedPermissionsJson) {
          this.accessToken = storedToken;
          const roles: string[] = JSON.parse(storedRolesJson);
          const permissions: string[] = JSON.parse(storedPermissionsJson); // NEW
          
          // Use the updated 'User' model
          const user: User = {
            username: storedUsername,
            roles: roles,
            permissions: permissions // NEW
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

    this.clearLocalAuthData(false); // Clear storage without navigating
  }


  /**
   * Logs a user in.
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
          const permissionsFromApi = response.APIKey.permissions || []; // NEW

          // CHANGED: Create the User object with permissions
          const user: User = {
            username: credentials.username, // Get username from the form
            roles: rolesFromApi,
            permissions: permissionsFromApi // NEW
          };

          // Store token, roles, username, and permissions
          try {
            const storage = credentials.remember ? localStorage : sessionStorage;
            const storageType = credentials.remember ? 'localStorage' : 'sessionStorage';
            const otherStorage = credentials.remember ? sessionStorage : localStorage;

            // Clear the other storage
            if (typeof otherStorage !== 'undefined') {
              otherStorage.removeItem(TOKEN_STORAGE_KEY);
              otherStorage.removeItem(ROLES_STORAGE_KEY);
              otherStorage.removeItem(USERNAME_STORAGE_KEY);
              otherStorage.removeItem(PERMISSIONS_STORAGE_KEY); // NEW
            }

            // Set items in the chosen storage
            if (typeof storage !== 'undefined') {
              storage.setItem(TOKEN_STORAGE_KEY, response.APIKey.access_token);
              storage.setItem(ROLES_STORAGE_KEY, JSON.stringify(user.roles));
              storage.setItem(USERNAME_STORAGE_KEY, user.username);
              storage.setItem(PERMISSIONS_STORAGE_KEY, JSON.stringify(user.permissions)); // NEW
              console.log(`Token, roles, username, and permissions saved to ${storageType}.`);
            }
          } catch (e) {
             console.error('Failed to save auth data to web storage', e);
          }

          this.isLoggedInSubject.next(true);
          this.currentUserSubject.next(user); // Update the current user observable

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
   * Logs the user out.
   */
  logout(): void {
     this.clearLocalAuthData(true); // Clear data and navigate
  }

  /**
   * Helper to clear all local authentication state and storage.
   */
  private clearLocalAuthData(navigate: boolean = true): void {
    this.accessToken = null;
    
    try {
      // Remove data from BOTH storages
      if (typeof sessionStorage !== 'undefined') {
        sessionStorage.removeItem(TOKEN_STORAGE_KEY);
        sessionStorage.removeItem(ROLES_STORAGE_KEY);
        sessionStorage.removeItem(USERNAME_STORAGE_KEY);
        sessionStorage.removeItem(PERMISSIONS_STORAGE_KEY); // NEW
      }
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem(TOKEN_STORAGE_KEY);
        localStorage.removeItem(ROLES_STORAGE_KEY);
        localStorage.removeItem(USERNAME_STORAGE_KEY);
        localStorage.removeItem(PERMISSIONS_STORAGE_KEY); // NEW
      }
    } catch (e) {
      console.error('Failed to remove auth data from web storage', e);
    }
    
    this.isLoggedInSubject.next(false);
    this.currentUserSubject.next(null); // Set current user to null
    
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

  // --- Role & Permission Management Methods ---

  /**
   * Checks if the current user has the specified role.
   * (We keep this for display or simple grouping)
   */
  hasRole(role: string): boolean {
    const currentUser = this.currentUserSubject.getValue();
    return currentUser ? currentUser.roles.includes(role) : false;
  }

  /**
   * Gets a copy of the current user's roles.
   */
  getUserRoles(): string[] {
    const currentUser = this.currentUserSubject.getValue();
    return currentUser ? [...currentUser.roles] : []; // Return a copy
  }

  /**
   * NEW: Checks if the current user has the specified permission.
   * This is the primary method we will use for security checks.
   */
  hasPermission(permission: string): boolean {
    const currentUser = this.currentUserSubject.getValue();
    // Check if the user has this specific permission
    return currentUser ? currentUser.permissions.includes(permission) : false;
  }
  
  /**
   * NEW: Gets a copy of the current user's permissions.
   */
  getUserPermissions(): string[] {
    const currentUser = this.currentUserSubject.getValue();
    return currentUser ? [...currentUser.permissions] : []; // Return a copy
  }

  /**
   * Handles HTTP errors or Application errors.
   */
  private handleError(error: HttpErrorResponse | Error): Observable<never> {
    let errorMessage: string;

    if (error instanceof HttpErrorResponse) {
      // --- HTTP Error Logic ---
      console.error('AuthService HTTP Error:', error);
      errorMessage = (error.error && typeof error.error === 'object' && error.error.message)
                     ? error.error.message
                     : (error.message || 'An unknown error occurred!');

      if (errorMessage === 'An unknown error occurred!' || !error.error?.message) {
         if (error.status === 0 || error.status === -1) {
             errorMessage = 'Network error or could not connect to the server.';
        //  } else if (error.status === 401) {
        //      errorMessage = 'Authentication failed. Please check your credentials.';
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