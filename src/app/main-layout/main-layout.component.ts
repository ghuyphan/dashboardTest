import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  Router,
  RouterModule,
  RouterOutlet,
  NavigationEnd,
  ActivatedRoute,
} from '@angular/router';
import { Subscription } from 'rxjs';
import { filter, map, mergeMap, startWith } from 'rxjs/operators';

import { AuthService } from '../services/auth.service';
import { User } from '../models/user.model';
// import { HasPermissionDirective } from '../directives/has-permission.directive';
import { NavItem } from '../models/nav-item.model';
import { ActionFooterComponent } from '../components/action-footer/action-footer.component';

// --- 1. IMPORT NEW COMPONENTS ---
import { SidebarComponent } from '../components/sidebar/sidebar.component';
import { HeaderComponent } from '../components/header/header.component';

@Component({
  selector: 'app-main-layout',
  standalone: true,
  imports: [
    CommonModule,
    RouterOutlet,
    RouterModule,
    // HasPermissionDirective,
    ActionFooterComponent,
    SidebarComponent,
    HeaderComponent,
  ],
  templateUrl: './main-layout.component.html',
  styleUrl: './main-layout.component.scss',
})
export class MainLayoutComponent implements OnInit, OnDestroy {
  isSidebarOpen = false;

  currentUser: User | null = null;
  rolesDisplay: string = '';
  userInitials: string = '';
  private userSubscription: Subscription | null = null;
  private navSubscription: Subscription | null = null;

  // --- REMOVED SCROLL LOGIC PROPERTIES ---
  // isHeaderHidden: boolean = false;
  // isFooterHidden: boolean = false;
  // private lastScrollTop: number = 0;
  // ... (all other scroll properties removed)

  navItems: NavItem[] = [];
  currentScreenName: string = 'LOADING TITLE...';
  
  // --- NEW PROPERTIES FOR SEARCH ---
  showSearchBar: boolean = false;
  currentSearchTerm: string = '';

  constructor(
    private authService: AuthService,
    private router: Router,
    private activatedRoute: ActivatedRoute
  ) {}

  ngOnInit(): void {
    // Subscribe to dynamic nav items
    this.navSubscription = this.authService.navItems$.subscribe(items => {
      this.navItems = this.deepCopyNavItems(items);
    });

    // 1. Subscribe to get User Info
    this.userSubscription = this.authService.currentUser$.subscribe(user => {
      this.currentUser = user;
      if (user && user.roles) {
        this.rolesDisplay = user.roles.join(', ');
        this.userInitials = this.getInitials(user.username);
      } else {
        this.rolesDisplay = '';
        this.userInitials = '';
      }
    });

    // 2. Subscribe to Router Events for Screen Title
    this.router.events
      .pipe(
        filter(event => event instanceof NavigationEnd),
        startWith(null), // Emit current route data on init
        map(() => this.activatedRoute),
        map(route => {
          while (route.firstChild) {
            route = route.firstChild;
          }
          return route;
        }),
        filter(route => route.outlet === 'primary'),
        mergeMap(route => route.data)
      )
      .subscribe((data: any) => {
        console.log('Router data object:', data);
        this.currentScreenName = data['title'] || 'Dashboard';
        
        // --- NEW: Show search bar based on route data ---
        this.showSearchBar = data['showSearchBar'] === true;
        
        // --- NEW: Clear search term on navigation ---
        if (!this.showSearchBar) {
          this.currentSearchTerm = '';
        }
      });

    // 3. Check window size
    this.checkWindowSize();
    window.addEventListener('resize', this.checkWindowSize.bind(this));
  }

  private deepCopyNavItems(items: NavItem[]): NavItem[] {
    return items.map(item => ({
      ...item,
      children: item.children ? this.deepCopyNavItems(item.children) : undefined,
    }));
  }

  ngOnDestroy(): void {
    if (this.userSubscription) {
      this.userSubscription.unsubscribe();
    }
    if (this.navSubscription) {
      this.navSubscription.unsubscribe();
    }
    window.removeEventListener('resize', this.checkWindowSize.bind(this));
  }

  private checkWindowSize(): void {
    if (window.innerWidth <= 992) {
      this.isSidebarOpen = false;
    } else {
      this.isSidebarOpen = false;
    }
  }

  // --- REMOVED: onContentScroll() method ---
  // --- REMOVED: processScroll() method ---

  private getInitials(username: string): string {
    if (username && username.length >= 3) {
      return username.substring(1, 3).toUpperCase();
    } else if (username && username.length > 0) {
      return username.substring(0, 2).toUpperCase();
    }
    return '??';
  }

  toggleSidebar(): void {
    this.isSidebarOpen = !this.isSidebarOpen;
  }

  logout(): void {
    this.authService.logout();
  }

  // --- NEW: Method to handle search output ---
  onSearchTermChanged(term: string): void {
    this.currentSearchTerm = term;
    console.log('Search term in main-layout:', this.currentSearchTerm);
    // You would typically pass this value to a service or child component
  }
}