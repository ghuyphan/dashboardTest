import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule, Location } from '@angular/common'; // <-- 1. IMPORT Location
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
import { NavItem } from '../models/nav-item.model';
import { ActionFooterComponent } from '../components/action-footer/action-footer.component';

import { SidebarComponent } from '../components/sidebar/sidebar.component';
import { HeaderComponent } from '../components/header/header.component';

import { SearchService } from '../services/search.service';

@Component({
  selector: 'app-main-layout',
  standalone: true,
  imports: [
    CommonModule,
    RouterOutlet,
    RouterModule,
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

  navItems: NavItem[] = [];
  currentScreenName: string = 'LOADING TITLE...';
  
  showSearchBar: boolean = false;
  showBackButton: boolean = false; // <-- 2. ADD THIS PROPERTY

  // **** ADDITION 1: Add isContentLoaded property ****
  isContentLoaded = false;

  constructor(
    private authService: AuthService,
    private router: Router,
    private activatedRoute: ActivatedRoute,
    private searchService: SearchService, // --- 3. INJECT THE SERVICE ---
    private location: Location // <-- 3. INJECT Location
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
        this.currentScreenName = data['title'] || 'Dashboard';
        
        this.showSearchBar = data['showSearchBar'] === true;
        this.showBackButton = data['showBackButton'] === true; // <-- 4. SET THE PROPERTY
        
        // --- 4. Clear search term using the service ---
        if (!this.showSearchBar) {
          this.searchService.setSearchTerm('');
        }
      });

    // 3. Check window size
    this.checkWindowSize();
    window.addEventListener('resize', this.checkWindowSize.bind(this));

    // **** ADDITION 2: Add the delay ****
    // This pushes the rendering of the router-outlet to the next
    // browser task, allowing layout animations to complete first.
    setTimeout(() => {
      this.isContentLoaded = true;
    }, 50); // 50ms is a safe bet
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
      this.isSidebarOpen = false;
  }

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

  // --- 5. This method is NO LONGER needed ---
  // onSearchTermChanged(term: string): void {
  //   this.searchService.setSearchTerm(term);
  // }

  // <-- 5. ADD THIS HANDLER ---
  onBackClicked(): void {
    this.location.back();
  }
}