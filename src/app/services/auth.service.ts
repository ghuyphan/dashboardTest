import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, BehaviorSubject, of, throwError } from 'rxjs';
import { catchError, tap, switchMap, map } from 'rxjs/operators';
import { Router } from '@angular/router';
import { environment } from '../../environments/environment.development';
import { User } from '../models/user.model';
import { NavItem } from '../models/nav-item.model'; // Make sure you created this file

// --- INTERFACES ---

// Response from the FIRST call (/login)
interface LoginResponse {
  MaKetQua: number;
  TenKetQua?: string;
  ErrorMessage?: string;

  APIKey: {
    access_token: string;
    id_token?: string; // +++ NEW/MODIFIED +++ (Ensure this is optional)
    date_token?: string;
    expires_in?: string;
    token_type?: string;
  };

  UserInfo: {
    id_user: string;
    user_name: string;
    ten_nhan_vien: string; // The API response still uses this key
    nhom_chuc_danh: string; // *** We will use this for ROLES ***
  };
}

// Interface for the NEW permission API response
// *** USING YOUR VERSION: ID and PARENT_ID are strings ***
interface ApiPermissionNode {
  ID: string;
  PARENT_ID: string;
  LABEL: string;
  LINK: string | null;
  ICON: string;
  PERMISSION: string; // This key exists but we mainly use PERMISSIONS
  PERMISSIONS: string[]; // This is the array we need
  ORDER: number;
}


// --- STORAGE KEYS ---
const TOKEN_STORAGE_KEY = 'authToken';
const ID_TOKEN_STORAGE_KEY = 'idToken'; // +++ NEW/MODIFIED +++
const ROLES_STORAGE_KEY = 'userRoles';
const USERNAME_STORAGE_KEY = 'username';
const PERMISSIONS_STORAGE_KEY = 'userPermissions';
const FULLNAME_STORAGE_KEY = 'userFullName';
const NAV_ITEMS_STORAGE_KEY = 'userNavItems'; // Key for storing the nav tree
// *** NEW: Key for storing the User ID ***
const USER_ID_STORAGE_KEY = 'userId';


@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private API_URL_LOGIN = environment.authUrl;
  private API_URL_PERMISSIONS_BASE = environment.permissionsUrl;

  private accessToken: string | null = null;
  private idToken: string | null = null; // +++ NEW/MODIFIED +++

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
  }

  /**
   * *** UPDATED: This is now the main public init method for APP_INITIALIZER ***
   */
  public init(): Observable<any> { // <-- MADE PUBLIC, RETURNS OBSERVABLE
    let storedToken: string | null = null;
    let storedIdToken: string | null = null; // +++ NEW/MODIFIED +++
    let storedRolesJson: string | null = null;
    let storedUsername: string | null = null;
    let storedFullName: string | null = null;
    let storedUserId: string | null = null;
    let storedPermissionsJson: string | null = null;
    let storedNavItemsJson: string | null = null;
    let storage: Storage | undefined;

    try {
      // *** This logic checks both storages ***
      if (typeof localStorage !== 'undefined' && localStorage.getItem(TOKEN_STORAGE_KEY)) {
        storage = localStorage;
      }
      else if (typeof sessionStorage !== 'undefined' && sessionStorage.getItem(TOKEN_STORAGE_KEY)) {
        storage = sessionStorage;
      }

      if (storage) {
        storedToken = storage.getItem(TOKEN_STORAGE_KEY);
        storedIdToken = storage.getItem(ID_TOKEN_STORAGE_KEY); // +++ NEW/MODIFIED +++
        storedRolesJson = storage.getItem(ROLES_STORAGE_KEY);
        storedUsername = storage.getItem(USERNAME_STORAGE_KEY);
        storedFullName = storage.getItem(FULLNAME_STORAGE_KEY);
        storedUserId = storage.getItem(USER_ID_STORAGE_KEY);
        storedPermissionsJson = storage.getItem(PERMISSIONS_STORAGE_KEY);
        storedNavItemsJson = storage.getItem(NAV_ITEMS_STORAGE_KEY);


        // *** UPDATED: Check for ALL required user data ***
        if (storedToken && storedIdToken && storedRolesJson && storedUsername && storedFullName && storedUserId && storedPermissionsJson && storedNavItemsJson) { // +++ NEW/MODIFIED +++ (added storedIdToken)
          this.accessToken = storedToken;
          this.idToken = storedIdToken; // +++ NEW/MODIFIED +++
          
          const roles: string[] = JSON.parse(storedRolesJson);
          const permissions: string[] = JSON.parse(storedPermissionsJson);
          const navItems: NavItem[] = JSON.parse(storedNavItemsJson);
          
          // Build *full* user from storage
          const user: User = {
            id: storedUserId,
            username: storedUsername,
            roles: roles,
            permissions: permissions, // Use stored permissions
            fullName: storedFullName
          };

          this.currentUserSubject.next(user); // Emit full user
          this.navItemsSubject.next(navItems); // Emit stored nav
          this.isLoggedInSubject.next(true);

          console.log(`AuthService: User '${user.username}' initialized from storage. Fetching fresh permissions...`);

          // --- START OF FIX ---
          // Return the observable so the APP_INITIALIZER can wait for it.
          return this.fetchAndSetPermissions(storedUserId, storage).pipe(
            catchError((err) => {
              // If the background refresh fails, log out.
              console.error("Failed to refresh permissions on init, logging out.", err);
              this.logout();
              return of(null); // Return a successful observable to finish init
            })
          );
          // --- END OF FIX ---
        }
      }
    } catch (e) {
      console.error('Failed to initialize user from storage', e);
    }

    // If any part fails, clear everything
    this.clearLocalAuthData(false);
    return of(null); // <-- Must return an observable for the initializer
  }


  /**
   * Logs a user in.
   */
  login(credentials: {username: string, password: string, remember: boolean}): Observable<any> {
    const payload = {
      usernamE_: credentials.username,
      passworD_: credentials.password
    };

    // *** This logic selects the storage based on the "remember" flag ***
    const storage = credentials.remember ? localStorage : sessionStorage;
    this.clearOtherStorage(credentials.remember);

    return this.http.post<LoginResponse>(this.API_URL_LOGIN, payload, {
      headers: { 'Content-Type': 'application/json' },
    }).pipe(
      // --- STEP 1: Handle Login Response ---
      switchMap(loginResponse => {

        if (loginResponse.MaKetQua !== 200) {
          const errorMessage = loginResponse.TenKetQua || loginResponse.ErrorMessage || 'Đã xảy ra lỗi không xác định. Vui lòng thử lại.';
          console.error(`Login failed (API MaKetQua: ${loginResponse.MaKetQua}):`, errorMessage);
          return throwError(() => new Error(errorMessage));
        }
        this.accessToken = loginResponse.APIKey.access_token;
        this.idToken = loginResponse.APIKey.id_token || null; // +++ NEW/MODIFIED +++

        try {
          storage.setItem(TOKEN_STORAGE_KEY, loginResponse.APIKey.access_token);
          if (this.idToken) { // +++ NEW/MODIFIED +++
            storage.setItem(ID_TOKEN_STORAGE_KEY, this.idToken); // +++ NEW/MODIFIED +++
          } // +++ NEW/MODIFIED +++
        } catch (e) {
          return throwError(() => new Error('Failed to save auth token to web storage.'));
        }

        // --- STEP 2: Chain to Permission Call ---
        const { UserInfo } = loginResponse;
        const userId = UserInfo.id_user;
        if (!userId) {
          return throwError(() => new Error('Login response did not include a user ID.'));
        }

        // *** NEW: Save all static user info to storage ***
        try {
          storage.setItem(USER_ID_STORAGE_KEY, UserInfo.id_user);
          storage.setItem(USERNAME_STORAGE_KEY, UserInfo.user_name);
          storage.setItem(FULLNAME_STORAGE_KEY, UserInfo.ten_nhan_vien || '');
          const rolesFromApi = UserInfo.nhom_chuc_danh ? [UserInfo.nhom_chuc_danh] : [];
          storage.setItem(ROLES_STORAGE_KEY, JSON.stringify(rolesFromApi));
        } catch (e) {
           console.error('Failed to save user auth data to web storage', e);
        }

        // *** UPDATED: Call the reusable fetchAndSetPermissions function ***
        return this.fetchAndSetPermissions(userId, storage);
      }),

      // --- STEP 3: Handle ANY Error ---
      catchError(error => this.handleError(error, true)) // Pass flag for login error
    );
  }

  /**
   * *** NEW: Reusable function to fetch, build, and save permissions and nav. ***
   */
  private fetchAndSetPermissions(userId: string, storage: Storage): Observable<any> {
    const permissionsUrl = `${this.API_URL_PERMISSIONS_BASE}/${userId}`;
    
    return this.http.get<ApiPermissionNode[]>(permissionsUrl).pipe(
      tap(permissionNodeArray => {
        // --- Get user info from storage (or current state) ---
        // Read from storage as source of truth for init/login
        const storedUsername = storage.getItem(USERNAME_STORAGE_KEY) || 'Unknown';
        const storedFullName = storage.getItem(FULLNAME_STORAGE_KEY) || '';
        const storedRoles = JSON.parse(storage.getItem(ROLES_STORAGE_KEY) || '[]');
       const storedUserId = storage.getItem(USER_ID_STORAGE_KEY) || '0';
        
        // --- Map the permissionNodeArray to get flat permissions list ---
        const allPermissionArrays = (permissionNodeArray || []).map(node => node.PERMISSIONS || []);
        const flatPermissions = allPermissionArrays.flat();
        const permissionsFromApi = [...new Set(flatPermissions)]; // Get only unique permissions

        // --- Build the User object (updating the partial user) ---
        const user: User = {
          id: storedUserId,
          username: storedUsername,
          fullName: storedFullName,
          roles: storedRoles,
          permissions: permissionsFromApi // *** ADDED FRESH PERMISSIONS ***
        };
        
        // --- Build the dynamic nav tree from the same API response ---
        const navTree = this.buildNavTree(permissionNodeArray || []);

        // --- Save PERMISSIONS and NAV to storage ---
        try {
          storage.setItem(PERMISSIONS_STORAGE_KEY, JSON.stringify(user.permissions));
          storage.setItem(NAV_ITEMS_STORAGE_KEY, JSON.stringify(navTree));
          console.log(`Fresh permissions and nav items saved.`);
        } catch (e) {
           console.error('Failed to save permissions/nav data to web storage', e);
        }

        // --- Set global auth state ---
        this.isLoggedInSubject.next(true); // Ensure this is true
        this.currentUserSubject.next(user); // Emit the *full* user object
        this.navItemsSubject.next(navTree); // Emit new nav tree
      })
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
        otherStorage.removeItem(ID_TOKEN_STORAGE_KEY); // +++ NEW/MODIFIED +++
        otherStorage.removeItem(ROLES_STORAGE_KEY);
        otherStorage.removeItem(USERNAME_STORAGE_KEY);
        otherStorage.removeItem(PERMISSIONS_STORAGE_KEY);
        otherStorage.removeItem(FULLNAME_STORAGE_KEY);
        otherStorage.removeItem(NAV_ITEMS_STORAGE_KEY); // Clear nav items
        otherStorage.removeItem(USER_ID_STORAGE_KEY); // *** ADDED ***
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
    this.idToken = null; // +++ NEW/MODIFIED +++

    try {
      // *** This logic clears BOTH storages ***
      if (typeof sessionStorage !== 'undefined') {
        sessionStorage.removeItem(TOKEN_STORAGE_KEY);
        sessionStorage.removeItem(ID_TOKEN_STORAGE_KEY); // +++ NEW/MODIFIED +++
        sessionStorage.removeItem(ROLES_STORAGE_KEY);
        sessionStorage.removeItem(USERNAME_STORAGE_KEY);
        sessionStorage.removeItem(PERMISSIONS_STORAGE_KEY);
        sessionStorage.removeItem(FULLNAME_STORAGE_KEY);
        sessionStorage.removeItem(NAV_ITEMS_STORAGE_KEY); // Clear nav items
        sessionStorage.removeItem(USER_ID_STORAGE_KEY); // *** ADDED ***
      }
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem(TOKEN_STORAGE_KEY);
        localStorage.removeItem(ID_TOKEN_STORAGE_KEY); // +++ NEW/MODIFIED +++
        localStorage.removeItem(ROLES_STORAGE_KEY);
        localStorage.removeItem(USERNAME_STORAGE_KEY);
        localStorage.removeItem(PERMISSIONS_STORAGE_KEY);
        localStorage.removeItem(FULLNAME_STORAGE_KEY);
        localStorage.removeItem(NAV_ITEMS_STORAGE_KEY); // Clear nav items
        localStorage.removeItem(USER_ID_STORAGE_KEY); // *** ADDED ***
      }
    } catch (e) {
      console.error('Failed to remove auth data from web storage', e);
    }

    this.isLoggedInSubject.next(false);
    this.currentUserSubject.next(null); // Set current user to null
    this.navItemsSubject.next([]); // Clear nav items subject

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
      // *** This logic also checks both storages ***
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

  // +++ NEW/MODIFIED +++
  /**
   * Gets the current ID token.
   */
  public getIdToken(): string | null {
    // Try in-memory first
    if (this.idToken) {
      return this.idToken;
    }

    // Try storage
    try {
      let token = (typeof localStorage !== 'undefined') ? localStorage.getItem(ID_TOKEN_STORAGE_KEY) : null;
      if (!token) {
        token = (typeof sessionStorage !== 'undefined') ? sessionStorage.getItem(ID_TOKEN_STORAGE_KEY) : null;
      }
      this.idToken = token; // Cache it
      return token;
    } catch (e) {
      return null;
    }
  }
  // +++ END NEW/MODIFIED +++


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
   * Recursively builds the navigation tree from the flat API response.
   * @param nodes The flat list of ApiPermissionNode from the server
   * @param parentId The ID of the parent to start from (default "0" for root)
   * @returns A nested array of NavItem
   */
  private buildNavTree(nodes: ApiPermissionNode[], parentId: string = "0"): NavItem[] {
    const tree: NavItem[] = [];

    // Get direct children of the current parentId and sort them
    const children = nodes
      .filter(node => node.PARENT_ID === parentId) // Using your string comparison
      .sort((a, b) => a.ORDER - b.ORDER);

    for (const node of children) {
      // Recursively find children of the current node
      const childrenOfNode = this.buildNavTree(nodes, node.ID); // Using string ID
      
      // Map the API node to the frontend NavItem
      const navItem: NavItem = {
        label: node.LABEL,
        // *** UPDATED: Provide a default icon if missing ***
        icon: node.ICON || 'fas fa-dot-circle',
        // *** UPDATED: Handle empty string LINKs as null ***
        link: node.LINK || null,
        permissions: node.PERMISSIONS || [], // Ensure it's always an array
        isOpen: false, // Default state
        children: childrenOfNode.length > 0 ? childrenOfNode : undefined
      };
      
      tree.push(navItem);
    }
    
    return tree;
  }


  /**
   * Handles HTTP errors or Application errors.
   */
  private handleError(error: HttpErrorResponse | Error, isLoginError: boolean = false): Observable<never> {
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
      // This is where the error from our `throwError(() => new Error(errorMessage))` in login() will be caught.
      console.error('AuthService App Error:', error.message);
      errorMessage = error.message;
    }

    // --- START OF MODIFICATION ---
    // Only clear data if it's a login error (e.g., bad credentials)
    // or a critical app error. Do NOT clear data on a failed refresh (401)
    // as that is handled by the init subscriber.
    if (isLoginError) {
      this.clearLocalAuthData(false);
    }
    // --- END OF MODIFICATION ---

    return throwError(() => new Error(errorMessage));
  }
  
  /**
   * *** ADD THIS NEW HELPER METHOD ***
   * Gets the ID of the currently logged-in user.
   */
  public getUserId(): string | null {
    const user = this.currentUserSubject.getValue();
    return user ? user.id : null;
  }
}