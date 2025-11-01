import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, BehaviorSubject, of, throwError } from 'rxjs';
import { catchError, tap, switchMap, map } from 'rxjs/operators';
import { Router } from '@angular/router';
import { environment } from '../../environments/environment.development';
import { User } from '../models/user.model'; // Import the updated User model

// --- INTERFACES ---

// Response from the FIRST call (/login)
interface LoginResponse {
  MaKetQua: number;
  TenKetQua?: string;
  ErrorMessage?: string;

  APIKey: {
    access_token: string;
    id_token?: string;
    date_token?: string;
    expires_in?: string;
    token_type?: string;
  };

  UserInfo: {
    id_user: string;
    user_name: string;
    ten_nhan_vien: string; // The API response still uses this key
    nhom_chuc_danh: string;
  };
}

// Response from the SECOND call (/user-permissions/{userId})
// !! This is still an assumption. Please confirm with your backend team !!
interface PermissionResponse {
  roles: string[];
  permissions: { PERMISSION: string }[];
}


// --- STORAGE KEYS ---
const TOKEN_STORAGE_KEY = 'authToken';
const ROLES_STORAGE_KEY = 'userRoles';
const USERNAME_STORAGE_KEY = 'username';
const PERMISSIONS_STORAGE_KEY = 'userPermissions';
const FULLNAME_STORAGE_KEY = 'userFullName'; // CHANGED: Using English key


@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private API_URL_LOGIN = environment.authUrl;
  private API_URL_PERMISSIONS_BASE = environment.permissionsUrl; // NEW: Base URL

  private accessToken: string | null = null;

  // --- Observables for Auth State ---
  private isLoggedInSubject = new BehaviorSubject<boolean>(false);
  public isLoggedIn$ = this.isLoggedInSubject.asObservable();

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
    let storedPermissionsJson: string | null = null;
    let storedFullName: string | null = null; // NEW
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
        storedPermissionsJson = storage.getItem(PERMISSIONS_STORAGE_KEY);
        storedFullName = storage.getItem(FULLNAME_STORAGE_KEY); // NEW

        if (storedToken && storedRolesJson && storedUsername && storedPermissionsJson && storedFullName) {
          this.accessToken = storedToken;
          const roles: string[] = JSON.parse(storedRolesJson);
          const permissions: string[] = JSON.parse(storedPermissionsJson);

          // CHANGED: Map to English model
          const user: User = {
            username: storedUsername,
            roles: roles,
            permissions: permissions,
            fullName: storedFullName // NEW
          };

          this.currentUserSubject.next(user);
          this.isLoggedInSubject.next(true);
          console.log(`AuthService: User '${user.username}' initialized from storage.`);
          return;
        }
      }
    } catch (e) {
      console.error('Failed to initialize user from storage', e);
    }

    this.clearLocalAuthData(false);
  }


  /**
   * Logs a user in by making TWO sequential API calls.
   * 1. Calls /login to get the token and userId.
   * 2. Calls /user-permissions/{userId} to get roles and permissions.
   */
  login(credentials: {username: string, password: string, remember: boolean}): Observable<any> {
    const payload = {
      usernamE_: credentials.username,
      passworD_: credentials.password
    };

    return this.http.post<LoginResponse>(this.API_URL_LOGIN, payload, {
      headers: { 'Content-Type': 'application/json' },
    }).pipe(
      // --- STEP 1: Handle Login Response ---
      switchMap(loginResponse => {

        // --- START OF MODIFICATION ---
        // Handle specific error codes from the API
        if (loginResponse.MaKetQua !== 200) {
          let errorMessage: string;
          switch (loginResponse.MaKetQua) {
            case 101:
              errorMessage = 'Tên đăng nhập hoặc mật khẩu không chính xác.';
              break;
            case 102:
              errorMessage = 'Tài khoản chưa được kích hoạt. Vui lòng kiểm tra email.';
              break;
            case 103:
              errorMessage = 'Tài khoản đã bị vô hiệu hóa. Vui lòng liên hệ quản trị viên.';
              break;
            case 104:
              errorMessage = 'Tài khoản đã bị khóa do nhập sai mật khẩu quá 5 lần.';
              break;
            default:
              // Use the error message from API if available, or a generic one
              errorMessage = loginResponse.ErrorMessage || 'Đã xảy ra lỗi không xác định. Vui lòng thử lại.';
          }
          console.error(`Login failed (API MaKetQua: ${loginResponse.MaKetQua}):`, errorMessage);
          // Throw an error with the specific, user-friendly message
          return throwError(() => new Error(errorMessage));
        }
        // --- END OF MODIFICATION ---

        console.log('Login successful, fetching permissions...');
        this.accessToken = loginResponse.APIKey.access_token;
        const storage = credentials.remember ? localStorage : sessionStorage;
        this.clearOtherStorage(credentials.remember);

        // Save the token NOW. The interceptor will need it for the next call.
        try {
          storage.setItem(TOKEN_STORAGE_KEY, loginResponse.APIKey.access_token);
        } catch (e) {
          return throwError(() => new Error('Failed to save auth token to web storage.'));
        }

        // --- STEP 2: Chain to Permission Call ---

        // CHANGED: Get userId from the first response
        const userId = loginResponse.UserInfo.id_user;
        if (!userId) {
          return throwError(() => new Error('Login response did not include a user ID.'));
        }

        // CHANGED: Construct the new URL with the userId
        const permissionsUrl = `${this.API_URL_PERMISSIONS_BASE}/${userId}`;

        // The interceptor will automatically add the token for this request
        return this.http.get<PermissionResponse>(permissionsUrl).pipe(
          // Combine the results from BOTH calls
          map(permissionResponse => {
            return { loginResponse, permissionResponse };
          })
        );
      }),
      // --- STEP 3: Handle Combined Successful Responses ---
      tap(combinedData => {
        const { loginResponse, permissionResponse } = combinedData;
        const { UserInfo } = loginResponse;

        const rolesFromApi = permissionResponse.roles || [];
        const permissionsFromApiObjects = permissionResponse.permissions || [];
        const permissionsFromApi = permissionsFromApiObjects.map(p => p.PERMISSION);

        // CHANGED: Build the User object with the English model
        const user: User = {
          username: UserInfo.user_name,           // From FIRST call
          fullName: UserInfo.ten_nhan_vien,      // From FIRST call (mapped)
          roles: rolesFromApi,                 // From SECOND call
          permissions: permissionsFromApi        // From SECOND call
        };

        // 3. Save ALL remaining user data to storage
        const storage = credentials.remember ? localStorage : sessionStorage;
        try {
          // Token was already saved.
          storage.setItem(USERNAME_STORAGE_KEY, user.username);
          storage.setItem(FULLNAME_STORAGE_KEY, user.fullName || ''); // CHANGED
          storage.setItem(ROLES_STORAGE_KEY, JSON.stringify(user.roles));
          storage.setItem(PERMISSIONS_STORAGE_KEY, JSON.stringify(user.permissions));
          console.log(`Token, roles, username, full name, and permissions saved.`);
        } catch (e) {
           console.error('Failed to save full user auth data to web storage', e);
        }

        // 4. Set global auth state
        this.isLoggedInSubject.next(true);
        this.currentUserSubject.next(user);
      }),

      // --- STEP 4: Handle ANY Error ---
      // --- THIS IS THE FIX ---
      // We use an arrow function to ensure 'this' context is preserved
      catchError(error => this.handleError(error))
      // ---------------------
    );
  }

  /**
   * Helper to clear the *other* web storage
   */
  private clearOtherStorage(remember: boolean): void {
    const otherStorage = remember ? sessionStorage : localStorage;
    try {
      if (typeof otherStorage !== 'undefined') {
        otherStorage.removeItem(TOKEN_STORAGE_KEY);
        otherStorage.removeItem(ROLES_STORAGE_KEY);
        otherStorage.removeItem(USERNAME_STORAGE_KEY);
        otherStorage.removeItem(PERMISSIONS_STORAGE_KEY);
        otherStorage.removeItem(FULLNAME_STORAGE_KEY); // CHANGED
      }
    } catch (e) {
      console.error('Failed to clear other web storage', e);
    }
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
        sessionStorage.removeItem(PERMISSIONS_STORAGE_KEY);
        sessionStorage.removeItem(FULLNAME_STORAGE_KEY); // CHANGED
      }
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem(TOKEN_STORAGE_KEY);
        localStorage.removeItem(ROLES_STORAGE_KEY);
        localStorage.removeItem(USERNAME_STORAGE_KEY);
        localStorage.removeItem(PERMISSIONS_STORAGE_KEY);
        localStorage.removeItem(FULLNAME_STORAGE_KEY); // CHANGED
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
    if (this.accessToken) {
      return this.accessToken;
    }

    try {
      let token = (typeof localStorage !== 'undefined') ? localStorage.getItem(TOKEN_STORAGE_KEY) : null;
      if (!token) {
        token = (typeof sessionStorage !== 'undefined') ? sessionStorage.getItem(TOKEN_STORAGE_KEY) : null;
      }
      this.accessToken = token;
      return token;
    } catch (e) {
      return null;
    }
  }

  // --- Role & Permission Management Methods ---
  // (No changes needed in the methods below)

  /**
   * Checks if the current user has the specified role.
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
    return currentUser ? [...currentUser.roles] : [];
  }

  /**
   * Checks if the current user has the specified *exact* permission string.
   */
  hasPermission(permission: string): boolean {
    const currentUser = this.currentUserSubject.getValue();
    return currentUser ? currentUser.permissions.includes(permission) : false;
  }

  /**
   * Gets a copy of the current user's permissions.
   */
  getUserPermissions(): string[] {
    const currentUser = this.currentUserSubject.getValue();
    return currentUser ? [...currentUser.permissions] : [];
  }

  /**
   * Checks if the user has a specific action (e.g., 'RCREATE') for a specific module
   */
  hasActionPermission(modulePrefix: string, action: string): boolean {
    const currentUser = this.currentUserSubject.getValue();
    if (!currentUser) {
      return false;
    }

    const permissionString = currentUser.permissions.find(p => p.startsWith(modulePrefix));

    if (!permissionString) {
      return false;
    }

    const actions = permissionString.split('_');
    return actions.includes(action);
  }


  /**
   * Handles HTTP errors or Application errors.
   */
  private handleError(error: HttpErrorResponse | Error): Observable<never> {
    let errorMessage: string;

    if (error instanceof HttpErrorResponse) {
      // --- HTTP Error Logic ---
      console.error('AuthService HTTP Error:', error);

      if (error.error && typeof error.error === 'object' && error.error.ErrorMessage) {
        errorMessage = error.error.ErrorMessage;
      }
      else {
        errorMessage = error.message || 'An unknown error occurred!';
      }

      if (errorMessage === 'An unknown error occurred!' || !errorMessage) {
         if (error.status === 0 || error.status === -1) {
             errorMessage = 'Network error or could not connect to the server.';
         } else if (error.status === 401) {
             errorMessage = 'Authentication failed or session expired. Please log in again.';
         } else if (error.status === 403) {
             errorMessage = 'You do not have permission to perform this action.';
         } else if (error.status === 400) {
             errorMessage = 'Invalid request. Please check your input.';
         } else if (error.status >= 500) {
             errorMessage = 'Server error. Please try again later.';
         }
      }
    } else {
      // --- Application Error Logic (thrown from switchMap) ---
      console.error('AuthService App Error:', error.message);
      errorMessage = error.message;
    }

    // Clear all data on auth failure, just in case
    this.clearLocalAuthData(false);

    return throwError(() => new Error(errorMessage));
  }
}