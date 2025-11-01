import { 
  Component, 
  OnInit, 
  OnDestroy, 
  ElementRef, 
  HostListener, 
  ViewChild,
  Renderer2,  
  AfterViewInit 
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { 
  Router, 
  RouterModule, 
  RouterOutlet, 
  NavigationEnd, 
  ActivatedRoute 
} from '@angular/router';
import { Subscription } from 'rxjs';
// *** 1. IMPORT startWith ***
import { filter, map, mergeMap, startWith } from 'rxjs/operators'; 
// *** END 1. ***

import { AuthService } from '../services/auth.service';
import { User } from '../models/user.model'; 
import { HasPermissionDirective } from '../directives/has-permission.directive';
import { NavItem, navItems } from './nav-items.config'; 

@Component({
  selector: 'app-main-layout',
  standalone: true,
  imports: [
    CommonModule, 
    RouterOutlet, 
    RouterModule,
    HasPermissionDirective
  ],
  templateUrl: './main-layout.component.html',
  styleUrl: './main-layout.component.scss'
})
export class MainLayoutComponent implements OnInit, OnDestroy, AfterViewInit {
  isSidebarOpen = false;
  
  currentUser: User | null = null;
  
  rolesDisplay: string = '';
  userInitials: string = ''; 
  private userSubscription: Subscription | null = null;

  isUserMenuOpen: boolean = false;
  isHeaderHidden: boolean = false; 
  private lastScrollTop: number = 0; 
  private scrollListener!: () => void; 

  @ViewChild('userMenuContainer') userMenuContainer!: ElementRef;
  @ViewChild('mainPanel') mainPanel!: ElementRef; 

  navItems: NavItem[] = navItems;

  currentScreenName: string = 'LOADING TITLE...'; // Default value

  constructor(
    private authService: AuthService, 
    private el: ElementRef, 
    private renderer: Renderer2,
    private router: Router,
    private activatedRoute: ActivatedRoute
  ) {}

  ngOnInit(): void {
    // 1. Subscribe to get User Info
    this.userSubscription = this.authService.currentUser$.subscribe(user => {
      this.currentUser = user;
      if (user && user.roles) {
        this.rolesDisplay = this.formatRoles(user.roles);
        this.userInitials = this.getInitials(user.username);
      } else {
        this.rolesDisplay = '';
        this.userInitials = '';
      }
    });

    // 2. Subscribe to Router Events for Screen Title
    this.router.events.pipe(
      filter(event => event instanceof NavigationEnd),
      // *** 2. ADD startWith(null) ***
      // This forces the pipe to run once immediately on load,
      // in addition to running on every future NavigationEnd event.
      startWith(null), 
      // *** END 2. ***
      map(() => this.activatedRoute),
      map(route => {
        while (route.firstChild) {
          route = route.firstChild;
        }
        return route;
      }),
      filter(route => route.outlet === 'primary'),
      mergeMap(route => route.data)
    ).subscribe((data: any) => {
      
      console.log('Router data object:', data); 

      // Look for a 'title' in the route's data object
      // It will find { title: 'Trang chủ' } from app.routes.ts
      this.currentScreenName = data['title'] || 'Dashboard'; // Fallback
    });

    // 3. Check window size
    this.checkWindowSize();
    window.addEventListener('resize', this.checkWindowSize.bind(this));
  }

  ngAfterViewInit(): void {
    // Attach scroll listener
    if (this.mainPanel) {
      this.scrollListener = this.renderer.listen(
        this.mainPanel.nativeElement, 
        'scroll', 
        (event) => {
          this.onMainPanelScroll(event);
        }
      );
    }
  }

  ngOnDestroy(): void {
    if (this.userSubscription) {
      this.userSubscription.unsubscribe();
    }
    window.removeEventListener('resize', this.checkWindowSize.bind(this));
    
    if (this.scrollListener) {
      this.scrollListener();
    }
  }

  private checkWindowSize(): void {
    if (window.innerWidth <= 992) {
      this.isSidebarOpen = false;
    } else {
      this.isSidebarOpen = false;
    }
  }

  private onMainPanelScroll(event: Event): void {
    const scrollTop = (event.target as HTMLElement).scrollTop;
    const headerHeight = 60; 

    if (scrollTop > this.lastScrollTop && scrollTop > headerHeight) {
      // Scrolling Down
      this.isHeaderHidden = true;
    } else if (scrollTop < this.lastScrollTop) {
      // Scrolling Up
      this.isHeaderHidden = false;
    }

    this.lastScrollTop = scrollTop <= 0 ? 0 : scrollTop;
  }

  formatRoles(roles: string[]): string {
    if (roles.includes('KXĐ')) return 'Kế toán (KXĐ)'; 
    if (roles.includes('Bác Sĩ')) return 'Bác Sĩ'; 
    if (roles.includes('SuperAdmin')) return 'Super Admin';
    if (roles.includes('Admin')) return 'Admin';
    if (roles.includes('User')) return 'User';
    return roles.join(', ');
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

  toggleSubmenu(item: NavItem, event: Event): void {
    event.preventDefault();
    item.isOpen = !item.isOpen;
  }

  logout(): void {
    this.authService.logout();
    this.isUserMenuOpen = false; 
  }

  toggleUserMenu(): void {
    this.isUserMenuOpen = !this.isUserMenuOpen;
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent) {
    if (
      this.userMenuContainer && 
      !this.userMenuContainer.nativeElement.contains(event.target)
    ) {
      const hamburger = this.el.nativeElement.querySelector('.mobile-sidebar-toggle'); 
      if (hamburger && hamburger.contains(event.target)) {
        return; 
      }
      this.isUserMenuOpen = false;
    }
  }

  onSettingsClick(): void {
    console.log('Settings clicked');
    this.isUserMenuOpen = false; 
  }

  onSupportClick(): void {
    console.log('Support clicked');
    this.isUserMenuOpen = false; 
  }

  onSeeAllProfilesClick(): void {
    console.log('See all profiles clicked');
    this.isUserMenuOpen = false;
  }
}