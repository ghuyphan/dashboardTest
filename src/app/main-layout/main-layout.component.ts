import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { Subscription } from 'rxjs';

// --- Interface for a Navigation Item ---
interface NavItem {
  label: string;
  icon: string;
  link?: string;
  roles?: string[]; 
  children?: NavItem[]; 
  isOpen?: boolean; 
}

// Added a user interface (you can move this to a models file)
interface AppUser {
  username: string;
  roles: string[];
}

@Component({
  selector: 'app-main-layout',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './main-layout.component.html',
  styleUrl: './main-layout.component.scss'
})
export class MainLayoutComponent implements OnInit, OnDestroy { 

  isSidebarOpen = false;
  currentUser: AppUser | null = null; 
  rolesDisplay = '';

  // Added for cleaning up the subscription
  private userSubscription: Subscription | undefined;
  
  // --- Data-driven navigation menu ---
  navItems: NavItem[] = [
    {
      label: 'Trang chủ',
      icon: 'fas fa-tachometer-alt',
      link: '/app/home'
      // No 'roles' property means everyone can see it
    },
    {
      label: 'Quản lý người dùng',
      icon: 'fas fa-users',
      link: '/app/users',
      roles: ['Admin'] // Only 'Admin' can see this
    },
    {
      label: 'Báo cáo',
      icon: 'fas fa-chart-bar',
      roles: ['Admin', 'Manager'], // Only 'Admin' and 'Manager' can see
      isOpen: false, // Default to closed
      children: [
        {
          label: 'Sales Reports',
          icon: 'fas fa-chart-line', // Child icon
          link: '/app/reports/sales',
          roles: ['Admin', 'Manager'] // Roles can also be on children
        },
        {
          label: 'User Reports',
          icon: 'fas fa-user-chart', // Custom icon
          link: '/app/reports/user',
          roles: ['Admin'] // Only Admin can see this sub-item
        }
      ]
    },
    {
      label: 'Cài đặt',
      icon: 'fas fa-cog',
      link: '/app/settings'
    },
    {
      label: 'Hỗ trợ',
      icon: 'fas fa-question-circle',
      link: '/app/help'
    }
  ];


  constructor(private authService: AuthService) { }

  ngOnInit(): void {
    this.userSubscription = this.authService.currentUser$.subscribe((user: AppUser | null) => {
      this.currentUser = user;
      if (this.currentUser) {
        this.rolesDisplay = this.currentUser.roles.join(', ');
      } else {
        this.rolesDisplay = ''; // Clear display if user is null (logged out)
      }
    });
  }

  // Added ngOnDestroy to unsubscribe
  ngOnDestroy(): void {
    if (this.userSubscription) {
      this.userSubscription.unsubscribe();
    }
  }

  toggleSidebar() {
    this.isSidebarOpen = !this.isSidebarOpen;
  }

  logout() {
    this.authService.logout();
  }

  // --- UPDATED FUNCTION SIGNATURE ---
  /**
   * Checks if the current user has at least one of the specified roles.
   * @param allowedRoles A string, array of strings, or undefined.
   */
  hasRole(allowedRoles: string | string[] | undefined): boolean {
    if (!this.currentUser) {
      return false;
    }
    
    // If no roles are specified for the item (it's undefined or empty), 
    // it's visible to everyone.
    if (!allowedRoles || allowedRoles.length === 0) {
      return true;
    }

    const roles = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];
    return this.currentUser.roles.some(userRole => roles.includes(userRole));
  }

  // --- Function to toggle sub-menus ---
  toggleSubmenu(item: NavItem, event: Event): void {
    event.preventDefault(); // Prevent navigation on parent click
    item.isOpen = !item.isOpen;
  }
}