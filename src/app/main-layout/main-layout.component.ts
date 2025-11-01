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
import { HasPermissionDirective } from '../directives/has-permission.directive';
// --- NEW: Import the config file ---
import { NavItem, navItems } from './nav-items.config'; 

// --- REMOVED: Local NavItem interface definition ---

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
  userInitials: string = ''; // Property for user initials
  private userSubscription: Subscription | null = null;

  isUserMenuOpen: boolean = false;
  isHeaderHidden: boolean = false; 
  private lastScrollTop: number = 0; 
  private scrollListener!: () => void; 

  @ViewChild('userMenuContainer') userMenuContainer!: ElementRef;
  @ViewChild('mainPanel') mainPanel!: ElementRef; 

  // --- UPDATED: Use the imported navItems ---
  navItems: NavItem[] = navItems;

  // --- REMOVED: The large navItems array definition ---

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
        this.userInitials = this.getInitials(user.username); // Use username for initials
      } else {
        this.rolesDisplay = '';
        this.userInitials = '';
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

  /**
   * *** IMPORTANT ***
   * This function converts the role from the API (e.g., "KXĐ")
   * into a user-friendly string.
   */
  formatRoles(roles: string[]): string {
    // Add your other roles here
    if (roles.includes('KXĐ')) return 'Kế toán (KXĐ)'; // <-- UPDATE THIS FRIENDLY NAME
    if (roles.includes('SuperAdmin')) return 'Super Admin';
    if (roles.includes('Admin')) return 'Admin';
    if (roles.includes('User')) return 'User';
    
    // Fallback if no match
    return roles.join(', ');
  }

  // *** UPDATED THIS FUNCTION ***
  // Helper function to get initials from username
  private getInitials(username: string): string {
    if (username && username.length >= 3) {
      // New logic: Take 2nd and 3rd characters
      return username.substring(1, 3).toUpperCase();
    } else if (username && username.length > 0) {
      // Fallback: Take first 2 characters
      return username.substring(0, 2).toUpperCase();
    }
    return '??'; // Fallback
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
      const hamburger = this.el.nativeElement.querySelector('.mobile-sidebar-toggle'); // UPDATED this selector
      if (hamburger && hamburger.contains(event.target)) {
        // If mobile sidebar toggle was clicked, don't close user menu
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