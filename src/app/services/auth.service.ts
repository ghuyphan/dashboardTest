import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, BehaviorSubject, of, throwError } from 'rxjs';
import { catchError, tap, switchMap, map } from 'rxjs/operators';
import { Router } from '@angular/router';
import { environment } from '../../environments/environment.development';
import { User } from '../models/user.model';
import { NavItem } from '../models/nav-item.model';

// --- INTERFACES ---
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
    ten_nhan_vien: string;
    nhom_chuc_danh: string;
  };
}

interface ApiPermissionNode {
  ID: string;
  PARENT_ID: string;
  LABEL: string;
  LINK: string | null;
  ICON: string;
  PERMISSION: string;
  PERMISSIONS: string[];
  ORDER: number;
}

// --- STORAGE KEYS ---
const TOKEN_STORAGE_KEY = 'authToken';
const ID_TOKEN_STORAGE_KEY = 'idToken';
const ROLES_STORAGE_KEY = 'userRoles';
const USERNAME_STORAGE_KEY = 'username';
const PERMISSIONS_STORAGE_KEY = 'userPermissions';
const FULLNAME_STORAGE_KEY = 'userFullName';
const NAV_ITEMS_STORAGE_KEY = 'userNavItems';
const USER_ID_STORAGE_KEY = 'userId';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private API_URL_LOGIN = environment.authUrl;
  private API_URL_PERMISSIONS_BASE = environment.permissionsUrl;

  private accessToken: string | null = null;
  private idToken: string | null = null;

  // --- Observables for Auth State ---
  private isLoggedInSubject = new BehaviorSubject<boolean>(false);
  public isLoggedIn$ = this.isLoggedInSubject.asObservable();

  private currentUserSubject = new BehaviorSubject<User | null>(null);
  public currentUser$ = this.currentUserSubject.asObservable();

  // Observable for dynamic navigation items
  private navItemsSubject = new BehaviorSubject<NavItem[]>([]);
  public navItems$ = this.navItemsSubject.asObservable();

  constructor(
    private http: HttpClient,
    private router: Router
  ) {
    // Initialize auth state from storage
    this.initializeAuthState();
  }

  /**
   * Initializes the authentication state from stored data.
   * This should be called once during application startup.
   */
  private initializeAuthState(): void {
    const storedToken = this.getStoredToken();
    const storedIdToken = this.getStoredIdToken();
    const storedRolesJson = this.getStoredItem(ROLES_STORAGE_KEY);
    const storedUsername = this.getStoredItem(USERNAME_STORAGE_KEY);
    const storedFullName = this.getStoredItem(FULLNAME_STORAGE_KEY);
    const storedUserId = this.getStoredItem(USER_ID_STORAGE_KEY);
    const storedPermissionsJson = this.getStoredItem(PERMISSIONS_STORAGE_KEY);
    const storedNavItemsJson = this.getStoredItem(NAV_ITEMS_STORAGE_KEY);

    // Check if all required user data exists in storage
    if (storedToken && storedIdToken && storedRolesJson && storedUsername && 
        storedFullName && storedUserId && storedPermissionsJson && storedNavItemsJson) {
      
      this.accessToken = storedToken;
      this.idToken = storedIdToken;
      
      const roles: string[] = JSON.parse(storedRolesJson);
      const permissions: string[] = JSON.parse(storedPermissionsJson);
      const navItems: NavItem[] = JSON.parse(storedNavItemsJson);
      
      // Build user object from stored data
      const user: User = {
        id: storedUserId,
        username: storedUsername,
        roles: roles,
        permissions: permissions,
        fullName: storedFullName
      };

      this.currentUserSubject.next(user);
      this.navItemsSubject.next(navItems);
      this.isLoggedInSubject.next(true);
    }
  }

  /**
   * Retrieves the stored token from either localStorage or sessionStorage.
   */
  private getStoredToken(): string | null {
    return this.getStoredItem(TOKEN_STORAGE_KEY);
  }

  /**
   * Retrieves the stored ID token from either localStorage or sessionStorage.
   */
  private getStoredIdToken(): string | null {
    return this.getStoredItem(ID_TOKEN_STORAGE_KEY);
  }

  /**
   * Retrieves an item from storage, checking both localStorage and sessionStorage.
   */
  private getStoredItem(key: string): string | null {
    if (typeof localStorage !== 'undefined' && localStorage.getItem(key)) {
      return localStorage.getItem(key);
    }
    if (typeof sessionStorage !== 'undefined' && sessionStorage.getItem(key)) {
      return sessionStorage.getItem(key);
    }
    return null;
  }

  /**
   * Main initialization method for APP_INITIALIZER.
   * Returns an Observable to allow the app to wait for initialization.
   */
  public init(): Observable<any> {
    // If user was already initialized from storage, return success
    if (this.isLoggedInSubject.value) {
      // Attempt to refresh permissions in the background
      const userId = this.getUserId();
      if (userId) {
        return this.fetchAndSetPermissions(userId).pipe(
          catchError((err) => {
            console.error("Failed to refresh permissions on init, logging out.", err);
            this.logout();
            return of(null);
          })
        );
      }
    }
    return of(null);
  }

  /**
   * Logs a user in.
   */
  login(credentials: {username: string, password: string, remember: boolean}): Observable<any> {
    const payload = {
      usernamE_: credentials.username,
      passworD_: credentials.password
    };

    // Select storage based on "remember" flag
    const storage = credentials.remember ? localStorage : sessionStorage;
    this.clearOtherStorage(credentials.remember);

    return this.http.post<LoginResponse>(this.API_URL_LOGIN, payload, {
      headers: { 'Content-Type': 'application/json' },
    }).pipe(
      // Handle login response
      switchMap(loginResponse => {
        if (loginResponse.MaKetQua !== 200) {
          const errorMessage = loginResponse.TenKetQua || loginResponse.ErrorMessage || 'Đã xảy ra lỗi không xác định. Vui lòng thử lại.';
          console.error(`Login failed (API MaKetQua: ${loginResponse.MaKetQua}):`, errorMessage);
          return throwError(() => new Error(errorMessage));
        }
        
        this.accessToken = loginResponse.APIKey.access_token;
        this.idToken = loginResponse.APIKey.id_token || null;

        try {
          storage.setItem(TOKEN_STORAGE_KEY, loginResponse.APIKey.access_token);
          if (this.idToken) {
            storage.setItem(ID_TOKEN_STORAGE_KEY, this.idToken);
          }
        } catch (e) {
          return throwError(() => new Error('Failed to save auth token to web storage.'));
        }

        // Extract user info and save to storage
        const { UserInfo } = loginResponse;
        const userId = UserInfo.id_user;
        if (!userId) {
          return throwError(() => new Error('Login response did not include a user ID.'));
        }

        try {
          storage.setItem(USER_ID_STORAGE_KEY, UserInfo.id_user);
          storage.setItem(USERNAME_STORAGE_KEY, UserInfo.user_name);
          storage.setItem(FULLNAME_STORAGE_KEY, UserInfo.ten_nhan_vien || '');
          const rolesFromApi = UserInfo.nhom_chuc_danh ? [UserInfo.nhom_chuc_danh] : [];
          storage.setItem(ROLES_STORAGE_KEY, JSON.stringify(rolesFromApi));
        } catch (e) {
           console.error('Failed to save user auth data to web storage', e);
        }

        // Fetch permissions and build navigation
        return this.fetchAndSetPermissions(userId, storage);
      }),
      catchError(error => this.handleError(error, true))
    );
  }

  /**
   * Fetches permissions for the user and updates the application state.
   * @param userId The ID of the user whose permissions are being fetched
   * @param storage Optional storage object (used during login/init)
   */
  private fetchAndSetPermissions(userId: string, storage: Storage = localStorage): Observable<any> {
    const permissionsUrl = `${this.API_URL_PERMISSIONS_BASE}/${userId}`;
    
    return this.http.get<ApiPermissionNode[]>(permissionsUrl).pipe(
      tap(permissionNodeArray => {
        // Retrieve user info from storage
        const storedUsername = this.getStoredItem(USERNAME_STORAGE_KEY) || 'Unknown';
        const storedFullName = this.getStoredItem(FULLNAME_STORAGE_KEY) || '';
        const storedRoles = JSON.parse(this.getStoredItem(ROLES_STORAGE_KEY) || '[]');
        const storedUserId = this.getStoredItem(USER_ID_STORAGE_KEY) || '0';
        
        // Extract unique permissions from API response
        const allPermissionArrays = (permissionNodeArray || []).map(node => node.PERMISSIONS || []);
        const flatPermissions = allPermissionArrays.flat();
        const permissionsFromApi = [...new Set(flatPermissions)];

        // Create user object with fresh permissions
        const user: User = {
          id: storedUserId,
          username: storedUsername,
          fullName: storedFullName,
          roles: storedRoles,
          permissions: permissionsFromApi
        };
        
        // Build navigation tree from permission data
        const navTree = this.buildNavTree(permissionNodeArray || []);

        // Save data to storage
        try {
          storage.setItem(PERMISSIONS_STORAGE_KEY, JSON.stringify(user.permissions));
          storage.setItem(NAV_ITEMS_STORAGE_KEY, JSON.stringify(navTree));
        } catch (e) {
           console.error('Failed to save permissions/nav data to web storage', e);
        }

        // Update application state
        this.isLoggedInSubject.next(true);
        this.currentUserSubject.next(user);
        this.navItemsSubject.next(navTree);
      })
    );
  }

  /**
   * Helper to clear the other web storage (not the one currently in use)
   */
  private clearOtherStorage(remember: boolean): void {
    const otherStorage = remember ? sessionStorage : localStorage;
    try {
      if (typeof otherStorage !== 'undefined') {
        otherStorage.removeItem(TOKEN_STORAGE_KEY);
        otherStorage.removeItem(ID_TOKEN_STORAGE_KEY);
        otherStorage.removeItem(ROLES_STORAGE_KEY);
        otherStorage.removeItem(USERNAME_STORAGE_KEY);
        otherStorage.removeItem(PERMISSIONS_STORAGE_KEY);
        otherStorage.removeItem(FULLNAME_STORAGE_KEY);
        otherStorage.removeItem(NAV_ITEMS_STORAGE_KEY);
        otherStorage.removeItem(USER_ID_STORAGE_KEY);
      }
    } catch (e) {
      console.error('Failed to clear other web storage', e);
    }
  }

  /**
   * Logs the user out and clears all authentication data.
   */
  logout(): void {
     this.clearLocalAuthData(true);
  }

  /**
   * Clears all local authentication state and storage.
   * @param navigate Whether to navigate to login page after clearing data
   */
  private clearLocalAuthData(navigate: boolean = true): void {
    this.accessToken = null;
    this.idToken = null;

    try {
      // Clear data from both storages
      [localStorage, sessionStorage].forEach(storage => {
        if (typeof storage !== 'undefined') {
          storage.removeItem(TOKEN_STORAGE_KEY);
          storage.removeItem(ID_TOKEN_STORAGE_KEY);
          storage.removeItem(ROLES_STORAGE_KEY);
          storage.removeItem(USERNAME_STORAGE_KEY);
          storage.removeItem(PERMISSIONS_STORAGE_KEY);
          storage.removeItem(FULLNAME_STORAGE_KEY);
          storage.removeItem(NAV_ITEMS_STORAGE_KEY);
          storage.removeItem(USER_ID_STORAGE_KEY);
        }
      });
    } catch (e) {
      console.error('Failed to remove auth data from web storage', e);
    }

    this.isLoggedInSubject.next(false);
    this.currentUserSubject.next(null);
    this.navItemsSubject.next([]);

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

    const token = this.getStoredItem(TOKEN_STORAGE_KEY);
    this.accessToken = token;
    return token;
  }

  /**
   * Gets the current ID token.
   */
  getIdToken(): string | null {
    if (this.idToken) {
      return this.idToken;
    }

    const token = this.getStoredItem(ID_TOKEN_STORAGE_KEY);
    this.idToken = token;
    return token;
  }

  // --- Role & Permission Management Methods ---

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
   * Checks if the current user has the specified permission.
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
   * Checks if the user has a specific action permission for a module.
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
   * Builds a navigation tree from flat permission nodes.
   * @param nodes The flat list of permission nodes from the server
   * @param parentId The ID of the parent node to start building from (default "0" for root)
   * @returns A nested array of NavItem objects
   */
  private buildNavTree(nodes: ApiPermissionNode[], parentId: string = "0"): NavItem[] {
    const tree: NavItem[] = [];

    // Get direct children of the current parentId and sort them
    const children = nodes
      .filter(node => node.PARENT_ID === parentId)
      .sort((a, b) => a.ORDER - b.ORDER);

    for (const node of children) {
      // Recursively find children of the current node
      const childrenOfNode = this.buildNavTree(nodes, node.ID);
      
      // Map the API node to the frontend NavItem
      const navItem: NavItem = {
        label: node.LABEL,
        icon: node.ICON || 'fas fa-dot-circle',
        link: node.LINK || null,
        permissions: node.PERMISSIONS || [],
        isOpen: false,
        children: childrenOfNode.length > 0 ? childrenOfNode : undefined
      };
      
      tree.push(navItem);
    }
    
    return tree;
  }

  /**
   * Handles HTTP and application errors.
   * @param error The error object
   * @param isLoginError Whether this error occurred during login
   */
  private handleError(error: HttpErrorResponse | Error, isLoginError: boolean = false): Observable<never> {
    let errorMessage: string;

    if (error instanceof HttpErrorResponse) {
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
      console.error('AuthService App Error:', error.message);
      errorMessage = error.message;
    }

    // Only clear data if it's a login error
    if (isLoginError) {
      this.clearLocalAuthData(false);
    }

    return throwError(() => new Error(errorMessage));
  }
  
  /**
   * Gets the ID of the currently logged-in user.
   */
  public getUserId(): string | null {
    const user = this.currentUserSubject.getValue();
    return user ? user.id : null;
  }
}