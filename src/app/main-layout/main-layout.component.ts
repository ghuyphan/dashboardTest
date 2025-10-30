import { Component, OnInit, OnDestroy, ElementRef, HostListener, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule, RouterOutlet } from '@angular/router';
import { Subscription } from 'rxjs';
import { AuthService } from '../services/auth.service';
import { User } from '../models/user.model'; 

// Define navigation item interface
interface NavItem {
  label: string;
  icon: string;
  link?: string;
  roles: string[];
  children?: NavItem[];
  isOpen?: boolean;
}

@Component({
  selector: 'app-main-layout',
  standalone: true,
  imports: [CommonModule, RouterOutlet, RouterModule],
  templateUrl: './main-layout.component.html',
  styleUrl: './main-layout.component.scss'
})
export class MainLayoutComponent implements OnInit, OnDestroy {
  isSidebarOpen = false;
  
  currentUser: User | null = null;
  
  rolesDisplay: string = '';
  private userSubscription: Subscription | null = null;

  isUserMenuOpen: boolean = false;

  // Reference to the user menu container for click detection
  @ViewChild('userMenuContainer') userMenuContainer!: ElementRef;

  navItems: NavItem[] = [
    // --- Add your navigation items here ---
    {
      label: 'Home',
      icon: 'fas fa-home',
      link: '/home',
      roles: []
    },
    {
      label: 'Management',
      icon: 'fas fa-cogs',
      roles: ['Admin', 'SuperAdmin'],
      isOpen: false,
      children: [
        {
          label: 'User Admin',
          icon: 'fas fa-users-cog',
          link: '/admin/users',
          roles: ['SuperAdmin']
        },
        {
          label: 'System Settings',
          icon: 'fas fa-tools',
          link: '/admin/settings',
          roles: ['Admin', 'SuperAdmin']
        }
      ]
    },
    {
      label: 'Profile',
      icon: 'fas fa-user',
      link: '/profile',
      roles: ['User', 'Admin', 'SuperAdmin']
    }
  ];

  constructor(
    private authService: AuthService, 
    private router: Router,
    private el: ElementRef // Keep ElementRef for the component itself
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

  ngOnDestroy(): void {
    if (this.userSubscription) {
      this.userSubscription.unsubscribe();
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

  formatRoles(roles: string[]): string {
    // This logic should match the roles in your system
    if (roles.includes('SuperAdmin')) return 'Super Admin';
    if (roles.includes('Admin')) return 'Admin';
    if (roles.includes('User')) return 'User';
    return roles.join(', ');
  }

  /**
   * Checks if the current user has at least one of the required roles
   */
  hasRole(roles: string[]): boolean {
    if (!this.currentUser || !this.currentUser.roles) {
      return false;
    }
    return roles.some(role => this.currentUser!.roles.includes(role));
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
    if (this.userMenuContainer && !this.userMenuContainer.nativeElement.contains(event.target)) {
      this.isUserMenuOpen = false;
    }
  }

  onSettingsClick(): void {
    console.log('Settings clicked');
    this.isUserMenuOpen = false; 
    // Example: this.router.navigate(['/settings']);
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