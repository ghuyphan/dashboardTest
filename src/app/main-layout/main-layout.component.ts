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
import { Router, RouterModule, RouterOutlet } from '@angular/router';
import { Subscription } from 'rxjs';
import { AuthService } from '../services/auth.service';
import { User } from '../models/user.model'; 
import { HasPermissionDirective } from '../directives/has-permission.directive'; // <-- NEW: Import directive

// Define navigation item interface (UPDATED)
interface NavItem {
  label: string;
  icon: string;
  link?: string;
  permissions: string[]; // <-- CHANGED: from 'roles' to 'permissions'
  children?: NavItem[];
  isOpen?: boolean;
}

@Component({
  selector: 'app-main-layout',
  standalone: true,
  imports: [
    CommonModule, 
    RouterOutlet, 
    RouterModule,
    HasPermissionDirective // <-- NEW: Add directive to imports
  ],
  templateUrl: './main-layout.component.html',
  styleUrl: './main-layout.component.scss'
})
export class MainLayoutComponent implements OnInit, OnDestroy, AfterViewInit {
  isSidebarOpen = false;
  
  currentUser: User | null = null;
  
  rolesDisplay: string = '';
  private userSubscription: Subscription | null = null;

  isUserMenuOpen: boolean = false;
  isHeaderHidden: boolean = false; 
  private lastScrollTop: number = 0; 
  private scrollListener!: () => void; 

  @ViewChild('userMenuContainer') userMenuContainer!: ElementRef;
  @ViewChild('mainPanel') mainPanel!: ElementRef; 

  // --- UPDATED: navItems array now uses 'permissions' ---
  navItems: NavItem[] = [
    {
      label: 'Home',
      icon: 'far fa-home',
      link: '/app/home', // Note: Make sure links align with app.routes.ts ('/app/home')
      permissions: [] // Empty array = visible to all logged-in users
    },
    {
      label: 'Management',
      icon: 'far fa-cogs',
      // Parent is visible if user has AT LEAST ONE of the child permissions
      permissions: ['CAN_MANAGE_USERS', 'CAN_VIEW_SETTINGS'], 
      isOpen: false,
      children: [
        {
          label: 'User Admin',
          icon: 'far fa-users-cog',
          link: '/app/users', // Example link
          permissions: ['CAN_MANAGE_USERS'] // Specific permission
        },
        {
          label: 'System Settings',
          icon: 'far fa-tools',
          link: '/app/settings', // Example link
          permissions: ['CAN_VIEW_SETTINGS'] // Specific permission
        }
      ]
    },
    {
      label: 'Profile',
      icon: 'far fa-user',
      link: '/app/profile', // Example link
      permissions: [] // Visible to all
    }
  ];

  constructor(
    private authService: AuthService, 
    private router: Router,
    private el: ElementRef, 
    private renderer: Renderer2 
  ) {}

  ngOnInit(): void {
    // Subscribe to the auth service's currentUser$ observable
    this.userSubscription = this.authService.currentUser$.subscribe(user => {
      this.currentUser = user;
      if (user && user.roles) {
        this.rolesDisplay = this.formatRoles(user.roles);
      } else {
        this.rolesDisplay = '';
      }
    });

    this.checkWindowSize();
    window.addEventListener('resize', this.checkWindowSize.bind(this));
  }

  ngAfterViewInit(): void {
    // Attach scroll listener to the main panel for hide-on-scroll
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
    
    // Remove scroll listener
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

  /**
   * Handles the scroll event on the main panel to show/hide the header.
   */
  private onMainPanelScroll(event: Event): void {
    const scrollTop = (event.target as HTMLElement).scrollTop;
    const headerHeight = 60; // Use the new header height

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
    // This logic should match the roles in your system
    if (roles.includes('SuperAdmin')) return 'Super Admin';
    if (roles.includes('Admin')) return 'Admin';
    if (roles.includes('User')) return 'User';
    return roles.join(', ');
  }

  // --- REMOVED ---
  // The 'hasRole' method is no longer needed.
  // The HasPermissionDirective handles the display logic in the template.

  toggleSidebar(): void {
    this.isSidebarOpen = !this.isSidebarOpen;
  }

  toggleSubmenu(item: NavItem, event: Event): void {
    event.preventDefault();
    item.isOpen = !item.isOpen;
  }

  logout(): void {
    this.authService.logout();
    this.isUserMenuOpen = false; // Close menu on logout
  }

  // --- Methods for new user menu in header ---

  toggleUserMenu(): void {
    this.isUserMenuOpen = !this.isUserMenuOpen;
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent) {
    // Check if the click is outside the user menu container
    // And also ensure the click wasn't on the hamburger toggle
    if (
      this.userMenuContainer && 
      !this.userMenuContainer.nativeElement.contains(event.target)
    ) {
      // Check if the click was on the sidebar toggle
      const hamburger = this.el.nativeElement.querySelector('.hamburger-menu');
      if (hamburger && hamburger.contains(event.target)) {
        // If sidebar toggle was clicked, don't close user menu
        return; 
      }
      this.isUserMenuOpen = false;
    }
  }

  onSettingsClick(): void {
    console.log('Settings clicked');
    this.isUserMenuOpen = false; 
    // Example: this.router.navigate(['/app/settings']);
  }

  onSupportClick(): void {
    console.log('Support clicked');
    this.isUserMenuOpen = false; 
    // Example: this.router.navigate(['/support']);
  }

  // --- NEW METHOD ---
  onSeeAllProfilesClick(): void {
    console.log('See all profiles clicked');
    this.isUserMenuOpen = false;
    // Example: this.router.navigate(['/profiles']);
  }
}