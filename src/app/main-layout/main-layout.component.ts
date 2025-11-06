import {
  Component,
  OnInit,
  OnDestroy,
} from '@angular/core';
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

  isHeaderHidden: boolean = false;
  isFooterHidden: boolean = false;
  
  // --- OPTIMIZED SCROLL LOGIC PROPERTIES ---
  private lastScrollTop: number = 0;
  private lastScrollTime: number = Date.now();
  private isScrollingDown: boolean = false;
  private rafPending: boolean = false;
  private accumulatedScroll: number = 0;
  // --- END OF OPTIMIZED SCROLL LOGIC PROPERTIES ---

  navItems: NavItem[] = [];
  currentScreenName: string = 'LOADING TITLE...';

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
        startWith(null),
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

  // --- START OF OPTIMIZED SCROLL LOGIC ---
  public onContentScroll(event: Event): void {
    // Queue up scroll handling with RAF
    if (!this.rafPending) {
      this.rafPending = true;
      requestAnimationFrame(() => {
        this.processScroll(event);
        this.rafPending = false;
      });
    }
  }

  private processScroll(event: Event): void {
    const element = event.target as HTMLElement;
    const scrollTop = element.scrollTop;
    const scrollHeight = element.scrollHeight;
    const clientHeight = element.clientHeight;
    const currentTime = Date.now();
    
    // Calculate boundaries
    const isAtTop = scrollTop <= 50;
    const isAtBottom = (scrollHeight - scrollTop - clientHeight) <= 50;
    
    // Always show at boundaries
    if (isAtTop || isAtBottom) {
      if (this.isHeaderHidden || this.isFooterHidden) {
        this.isHeaderHidden = false;
        this.isFooterHidden = false;
      }
      this.lastScrollTop = scrollTop;
      this.lastScrollTime = currentTime;
      this.accumulatedScroll = 0;
      return;
    }
    
    // Calculate scroll delta
    const scrollDelta = scrollTop - this.lastScrollTop;
    
    // Ignore minimal movements
    if (Math.abs(scrollDelta) < 3) {
      return;
    }
    
    // Track direction
    const scrollingDown = scrollDelta > 0;
    
    // Detect direction change
    if (scrollingDown !== this.isScrollingDown) {
      this.isScrollingDown = scrollingDown;
      this.accumulatedScroll = 0; // Reset accumulator on direction change
    }
    
    // Accumulate scroll distance
    this.accumulatedScroll += Math.abs(scrollDelta);
    
    // Require 30px accumulated scroll before triggering change
    if (this.accumulatedScroll >= 30) {
      if (scrollingDown) {
        // Hide when scrolling down
        if (!this.isHeaderHidden) {
          this.isHeaderHidden = true;
          this.isFooterHidden = true;
        }
      } else {
        // Show when scrolling up
        if (this.isHeaderHidden) {
          this.isHeaderHidden = false;
          this.isFooterHidden = false;
        }
      }
      
      // Reset accumulator after action
      this.accumulatedScroll = 0;
    }
    
    this.lastScrollTop = scrollTop;
    this.lastScrollTime = currentTime;
  }
  // --- END OF OPTIMIZED SCROLL LOGIC ---

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
}