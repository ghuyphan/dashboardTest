import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, BehaviorSubject, of, throwError } from 'rxjs';
import { catchError, tap, switchMap } from 'rxjs/operators';
import { Router } from '@angular/router';
import { environment } from '../../../environments/environment.development';
import { User } from '../models/user.model';
import { NavItem } from '../models/nav-item.model';
import { CustomRouteReuseStrategy } from '../strategies/custom-route-reuse-strategy';

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

  private isLoggedInSubject = new BehaviorSubject<boolean>(false);
  public isLoggedIn$ = this.isLoggedInSubject.asObservable();

  private currentUserSubject = new BehaviorSubject<User | null>(null);
  public currentUser$ = this.currentUserSubject.asObservable();

  private navItemsSubject = new BehaviorSubject<NavItem[]>([]);
  public navItems$ = this.navItemsSubject.asObservable();

  constructor(
    private http: HttpClient,
    private router: Router
  ) {
    this.initializeAuthState();
  }

  // --- [NEW] Change Password Method ---
  changePassword(payload: { OldPassword: string, NewPassword: string, ConfirmPassword: string }): Observable<any> {
    // Construct the URL. Assuming API_URL_LOGIN ends in '/login', we remove it to get the base auth path
    // e.g., "api/auth/login" -> "api/auth/change-password"
    // If your API structure is different, adjust this string.
    const url = this.API_URL_LOGIN.replace(/\/login\/?$/i, '') + '/change-password';

    const body = {
      UserName: this.getUsername(), // Auto-fill from the service
      OldPassword: payload.OldPassword,
      NewPassword: payload.NewPassword,
      ConfirmPassword: payload.ConfirmPassword
    };

    return this.http.post(url, body).pipe(
      tap(() => {
        // Optional: Logout user to force re-login with new password
        // this.logout(); 
      })
    );
  }
  // ------------------------------------

  private initializeAuthState(): void {
    const storedToken = this.getStoredToken();
    const storedIdToken = this.getStoredIdToken();
    const storedUsername = this.getStoredItem(USERNAME_STORAGE_KEY);
    const storedFullName = this.getStoredItem(FULLNAME_STORAGE_KEY);
    const storedUserId = this.getStoredItem(USER_ID_STORAGE_KEY);

    let roles: string[] = [];
    let permissions: string[] = [];
    let navItems: NavItem[] = [];
    let isDataValid = false;

    try {
      const storedRolesJson = this.getStoredItem(ROLES_STORAGE_KEY);
      const storedPermissionsJson = this.getStoredItem(PERMISSIONS_STORAGE_KEY);
      const storedNavItemsJson = this.getStoredItem(NAV_ITEMS_STORAGE_KEY);

      if (storedRolesJson) roles = JSON.parse(storedRolesJson);
      if (storedPermissionsJson) permissions = JSON.parse(storedPermissionsJson);
      if (storedNavItemsJson) navItems = JSON.parse(storedNavItemsJson);
      
      isDataValid = true;
    } catch (e) {
      console.error('Error parsing auth data from storage, clearing session.', e);
      this.clearLocalAuthData(false);
      return;
    }

    if (storedToken && storedIdToken && storedUsername && isDataValid) {
      this.accessToken = storedToken;
      this.idToken = storedIdToken;

      const user: User = {
        id: storedUserId || '',
        username: storedUsername,
        roles: roles,
        permissions: permissions,
        fullName: storedFullName || ''
      };

      this.currentUserSubject.next(user);
      this.navItemsSubject.next(navItems);
      this.isLoggedInSubject.next(true);
    }
  }

  private getStoredToken(): string | null {
    return this.getStoredItem(TOKEN_STORAGE_KEY);
  }

  private getStoredIdToken(): string | null {
    return this.getStoredItem(ID_TOKEN_STORAGE_KEY);
  }

  private getStoredItem(key: string): string | null {
    if (typeof localStorage !== 'undefined' && localStorage.getItem(key)) {
      return localStorage.getItem(key);
    }
    if (typeof sessionStorage !== 'undefined' && sessionStorage.getItem(key)) {
      return sessionStorage.getItem(key);
    }
    return null;
  }

  public init(): Observable<any> {
    if (this.isLoggedInSubject.value) {
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

  login(credentials: { username: string, password: string, remember: boolean }): Observable<any> {
    const payload = {
      usernamE_: credentials.username,
      passworD_: credentials.password
    };

    const storage = credentials.remember ? localStorage : sessionStorage;
    this.clearOtherStorage(credentials.remember);

    return this.http.post<LoginResponse>(this.API_URL_LOGIN, payload, {
      headers: { 'Content-Type': 'application/json' },
    }).pipe(
      switchMap(loginResponse => {
        if (loginResponse.MaKetQua !== 200) {
          const errorMessage = loginResponse.TenKetQua || loginResponse.ErrorMessage || 'Đã xảy ra lỗi không xác định.';
          return throwError(() => ({
            message: errorMessage,
            code: loginResponse.MaKetQua
          }));
        }

        this.accessToken = loginResponse.APIKey.access_token;
        this.idToken = loginResponse.APIKey.id_token || null;

        try {
          storage.setItem(TOKEN_STORAGE_KEY, loginResponse.APIKey.access_token);
          if (this.idToken) {
            storage.setItem(ID_TOKEN_STORAGE_KEY, this.idToken);
          }
          
          const { UserInfo } = loginResponse;
          storage.setItem(USER_ID_STORAGE_KEY, UserInfo.id_user);
          storage.setItem(USERNAME_STORAGE_KEY, UserInfo.user_name);
          storage.setItem(FULLNAME_STORAGE_KEY, UserInfo.ten_nhan_vien || '');
          
          const rolesFromApi = UserInfo.nhom_chuc_danh ? [UserInfo.nhom_chuc_danh] : [];
          storage.setItem(ROLES_STORAGE_KEY, JSON.stringify(rolesFromApi));
          
        } catch (e) {
          return throwError(() => new Error('Failed to save auth token to web storage.'));
        }

        return this.fetchAndSetPermissions(loginResponse.UserInfo.id_user, storage);
      }),
      catchError(error => this.handleError(error, true))
    );
  }

  private fetchAndSetPermissions(userId: string, storage: Storage = localStorage): Observable<any> {
    const permissionsUrl = `${this.API_URL_PERMISSIONS_BASE}/${userId}`;

    return this.http.get<ApiPermissionNode[]>(permissionsUrl).pipe(
      tap(permissionNodeArray => {
        const storedUsername = this.getStoredItem(USERNAME_STORAGE_KEY) || 'Unknown';
        const storedFullName = this.getStoredItem(FULLNAME_STORAGE_KEY) || '';
        const storedRoles = JSON.parse(this.getStoredItem(ROLES_STORAGE_KEY) || '[]');
        const storedUserId = this.getStoredItem(USER_ID_STORAGE_KEY) || '0';

        const allPermissionArrays = (permissionNodeArray || []).map(node => node.PERMISSIONS || []);
        const flatPermissions = allPermissionArrays.flat();
        const permissionsFromApi = [...new Set(flatPermissions)];

        const user: User = {
          id: storedUserId,
          username: storedUsername,
          fullName: storedFullName,
          roles: storedRoles,
          permissions: permissionsFromApi
        };

        const navTree = this.buildNavTree(permissionNodeArray || []);

        try {
          storage.setItem(PERMISSIONS_STORAGE_KEY, JSON.stringify(user.permissions));
          storage.setItem(NAV_ITEMS_STORAGE_KEY, JSON.stringify(navTree));
        } catch (e) {
          console.error('Failed to save permissions/nav data to web storage', e);
        }

        this.isLoggedInSubject.next(true);
        this.currentUserSubject.next(user);
        this.navItemsSubject.next(navTree);
      })
    );
  }

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

  logout(): void {
    CustomRouteReuseStrategy.clearAllHandles();
    this.clearLocalAuthData(true);
  }

  private clearLocalAuthData(navigate: boolean = true): void {
    this.accessToken = null;
    this.idToken = null;

    try {
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

    if (navigate) {
      this.router.navigate(['/login']).then(() => {
        CustomRouteReuseStrategy.clearAllHandles();
      });
    } else {
      CustomRouteReuseStrategy.clearAllHandles();
    }
  }

  getAccessToken(): string | null {
    if (this.accessToken) return this.accessToken;
    const token = this.getStoredItem(TOKEN_STORAGE_KEY);
    this.accessToken = token;
    return token;
  }

  getIdToken(): string | null {
    if (this.idToken) return this.idToken;
    const token = this.getStoredItem(ID_TOKEN_STORAGE_KEY);
    this.idToken = token;
    return token;
  }

  hasRole(role: string): boolean {
    const currentUser = this.currentUserSubject.getValue();
    return currentUser ? currentUser.roles.includes(role) : false;
  }

  getUserRoles(): string[] {
    const currentUser = this.currentUserSubject.getValue();
    return currentUser ? [...currentUser.roles] : [];
  }

  hasPermission(permission: string): boolean {
    const currentUser = this.currentUserSubject.getValue();
    return currentUser ? currentUser.permissions.includes(permission) : false;
  }

  getUserPermissions(): string[] {
    const currentUser = this.currentUserSubject.getValue();
    return currentUser ? [...currentUser.permissions] : [];
  }

  hasActionPermission(modulePrefix: string, action: string): boolean {
    const currentUser = this.currentUserSubject.getValue();
    if (!currentUser) return false;
    
    const permissionString = currentUser.permissions.find(p => p.startsWith(modulePrefix));
    if (!permissionString) return false;

    const actions = permissionString.split('_');
    return actions.includes(action);
  }

  private buildNavTree(nodes: ApiPermissionNode[], parentId: string = "0"): NavItem[] {
    const tree: NavItem[] = [];
    const children = nodes
      .filter(node => node.PARENT_ID === parentId)
      .sort((a, b) => a.ORDER - b.ORDER);

    for (const node of children) {
      const childrenOfNode = this.buildNavTree(nodes, node.ID);
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

  private handleError(error: any, isLoginError: boolean = false): Observable<never> {
    if (error && error.code) {
      return throwError(() => error);
    }

    let errorMessage: string;

    if (error instanceof HttpErrorResponse) {
      if (error.error && typeof error.error === 'object' && error.error.ErrorMessage) {
        errorMessage = error.error.ErrorMessage;
      } else {
        errorMessage = error.message || 'An unknown error occurred!';
      }

      if (errorMessage === 'An unknown error occurred!' || !errorMessage) {
        if (error.status === 0 || error.status === -1) errorMessage = 'Network error or could not connect to the server.';
        else if (error.status === 401) errorMessage = 'Authentication failed or session expired. Please log in again.';
        else if (error.status === 403) errorMessage = 'You do not have permission to perform this action.';
        else if (error.status === 400) errorMessage = 'Invalid request. Please check your input.';
        else if (error.status >= 500) errorMessage = 'Server error. Please try again later.';
      }
    } else {
      errorMessage = error.message;
    }

    if (isLoginError) {
      this.clearLocalAuthData(false);
    }

    return throwError(() => new Error(errorMessage));
  }

  public getUserId(): string | null {
    const user = this.currentUserSubject.getValue();
    return user ? user.id : null;
  }

  public getUsername(): string | null {
    const user = this.currentUserSubject.getValue();
    return user ? user.username : null;
  }
}