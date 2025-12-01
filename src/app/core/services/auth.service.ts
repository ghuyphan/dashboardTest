import { Injectable, signal } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, of, throwError } from 'rxjs';
import { catchError, tap, switchMap } from 'rxjs/operators';
import { Router } from '@angular/router';
import { environment } from '../../../environments/environment.development';
import { User } from '../models/user.model';
import { NavItem } from '../models/nav-item.model';
import { CustomRouteReuseStrategy } from '../strategies/custom-route-reuse-strategy';

// ============================================================================
// INTERFACES (Ensure these match your models)
// ============================================================================
interface LoginResponse {
  MaKetQua: number;
  TenKetQua?: string;
  ErrorMessage?: string;
  APIKey: {
    access_token: string;
    id_token?: string; // Optional
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

// ============================================================================
// CONSTANTS
// ============================================================================
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

  // 1. Signals
  private _isLoggedIn = signal<boolean>(false);
  private _currentUser = signal<User | null>(null);
  private _navItems = signal<NavItem[]>([]);

  // 2. Public Read-only Signals
  public readonly isLoggedIn = this._isLoggedIn.asReadonly();
  public readonly currentUser = this._currentUser.asReadonly();
  public readonly navItems = this._navItems.asReadonly();

  constructor(
    private http: HttpClient,
    private router: Router
  ) {
    this.initializeAuthState();
  }

  // ============================================================================
  // PUBLIC API
  // ============================================================================

  changePassword(payload: { OldPassword: string, NewPassword: string, ConfirmPassword: string }): Observable<any> {
    const url = environment.changePassUrl;
    const body = {
      UserName: this.getUsername(),
      OldPassword: payload.OldPassword,
      NewPassword: payload.NewPassword,
      ConfirmPassword: payload.ConfirmPassword
    };
    return this.http.put(url, body);
  }

  init(): Observable<any> {
    if (this._isLoggedIn()) {
      const userId = this.getUserId();
      if (userId) {
        return this.fetchAndSetPermissions(userId).pipe(
          catchError((err) => {
            // Only logout if strictly unauthorized (Session expired)
            if (err.status === 401) {
              console.warn("Session expired during init, logging out.");
              this.logout();
            } else {
              console.error("Failed to refresh permissions, keeping local state.", err);
            }
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
          storage.setItem(TOKEN_STORAGE_KEY, this.accessToken);
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

  logout(): void {
    CustomRouteReuseStrategy.clearAllHandles();
    this.clearLocalAuthData(true);
  }

  // ============================================================================
  // ACCESSORS (Used by Interceptors & Components)
  // ============================================================================

  getAccessToken(): string | null { 
    return this.accessToken || this.getStoredToken(); 
  }

  getIdToken(): string | null { 
    return this.idToken || this.getStoredIdToken(); 
  }

  getUserId(): string | null { 
    return this._currentUser()?.id || this.getStoredItem(USER_ID_STORAGE_KEY); 
  }

  getUsername(): string | null { 
    return this._currentUser()?.username || this.getStoredItem(USERNAME_STORAGE_KEY); 
  }

  hasRole(role: string): boolean {
    const u = this._currentUser();
    return u ? u.roles.includes(role) : false;
  }

  hasPermission(permission: string): boolean {
    const u = this._currentUser();
    return u ? u.permissions.includes(permission) : false;
  }

  hasActionPermission(modulePrefix: string, action: string): boolean {
    const u = this._currentUser();
    if (!u) return false;
    const p = u.permissions.find(perm => perm.startsWith(modulePrefix));
    return p ? p.split('_').includes(action) : false;
  }

  // ============================================================================
  // INTERNAL LOGIC
  // ============================================================================

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
      const r = this.getStoredItem(ROLES_STORAGE_KEY);
      const p = this.getStoredItem(PERMISSIONS_STORAGE_KEY);
      const n = this.getStoredItem(NAV_ITEMS_STORAGE_KEY);

      if (r) roles = JSON.parse(r);
      if (p) permissions = JSON.parse(p);
      if (n) navItems = JSON.parse(n);
      
      isDataValid = true;
    } catch (e) {
      console.error('Auth data corrupted, clearing session.', e);
      this.clearLocalAuthData(false);
      return;
    }

    if (storedToken && storedUsername && isDataValid) {
      this.accessToken = storedToken;
      this.idToken = storedIdToken;

      const user: User = {
        id: storedUserId || '',
        username: storedUsername,
        roles: roles,
        permissions: permissions,
        fullName: storedFullName || ''
      };

      this._currentUser.set(user);
      this._navItems.set(navItems);
      this._isLoggedIn.set(true);
    }
  }

  private fetchAndSetPermissions(userId: string, storage: Storage = localStorage): Observable<any> {
    // Determine storage type based on where token exists
    if (!localStorage.getItem(TOKEN_STORAGE_KEY) && sessionStorage.getItem(TOKEN_STORAGE_KEY)) {
        storage = sessionStorage;
    }

    const permissionsUrl = `${this.API_URL_PERMISSIONS_BASE}/${userId}`;

    return this.http.get<ApiPermissionNode[]>(permissionsUrl).pipe(
      tap(permissionNodeArray => {
        // Re-read from storage/cache to ensure consistency
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

        // Update signals
        this._currentUser.set(user);
        this._navItems.set(navTree);
        this._isLoggedIn.set(true);
      })
    );
  }

  private clearLocalAuthData(navigate: boolean = true): void {
    this.accessToken = null;
    this.idToken = null;

    try {
        const keys = [
            TOKEN_STORAGE_KEY, ID_TOKEN_STORAGE_KEY, ROLES_STORAGE_KEY,
            USERNAME_STORAGE_KEY, PERMISSIONS_STORAGE_KEY, FULLNAME_STORAGE_KEY,
            NAV_ITEMS_STORAGE_KEY, USER_ID_STORAGE_KEY
        ];
        
        [localStorage, sessionStorage].forEach(s => {
            if (typeof s !== 'undefined') keys.forEach(k => s.removeItem(k));
        });
    } catch (e) {
      console.error('Failed to remove auth data', e);
    }

    this._isLoggedIn.set(false);
    this._currentUser.set(null);
    this._navItems.set([]);

    if (navigate) {
      this.router.navigate(['/login']);
    }
  }

  private buildNavTree(nodes: ApiPermissionNode[], parentId: string = "0"): NavItem[] {
    const tree: NavItem[] = [];
    const children = nodes
      .filter(node => node.PARENT_ID === parentId)
      .sort((a, b) => a.ORDER - b.ORDER);

    for (const node of children) {
      const childrenOfNode = this.buildNavTree(nodes, node.ID);
      tree.push({
        label: node.LABEL,
        icon: node.ICON || 'fas fa-dot-circle',
        link: node.LINK || null,
        permissions: node.PERMISSIONS || [],
        isOpen: false,
        children: childrenOfNode.length > 0 ? childrenOfNode : undefined
      });
    }
    return tree;
  }

  private handleError(error: any, isLoginError: boolean = false): Observable<never> {
    if (isLoginError) this.clearLocalAuthData(false);
    
    let msg = error.message || 'Lỗi hệ thống.';
    if (error instanceof HttpErrorResponse) {
       if (error.status === 401) msg = 'Phiên đăng nhập hết hạn.';
       else if (error.status === 403) msg = 'Không có quyền truy cập.';
       else if (error.error?.ErrorMessage) msg = error.error.ErrorMessage;
    }
    return throwError(() => new Error(msg));
  }

  private getStoredItem(key: string): string | null {
    if (typeof localStorage !== 'undefined' && localStorage.getItem(key)) return localStorage.getItem(key);
    if (typeof sessionStorage !== 'undefined' && sessionStorage.getItem(key)) return sessionStorage.getItem(key);
    return null;
  }

  private getStoredToken(): string | null { return this.getStoredItem(TOKEN_STORAGE_KEY); }
  private getStoredIdToken(): string | null { return this.getStoredItem(ID_TOKEN_STORAGE_KEY); }

  private clearOtherStorage(remember: boolean): void {
    const other = remember ? sessionStorage : localStorage;
    try {
       if (typeof other !== 'undefined') other.clear(); 
    } catch (e) { }
  }
}