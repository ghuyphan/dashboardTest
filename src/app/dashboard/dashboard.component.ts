import { Component, inject, OnInit } from '@angular/core';
import { CommonModule, NgClass } from '@angular/common'; // Import NgClass
import { AuthService } from '../services/auth.service';
import { Router } from '@angular/router'; // Import Router

interface MockUser {
  username: string;
  roles: string[];
}

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, NgClass], // Add NgClass here
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss'
})
export class DashboardComponent implements OnInit {
  isSidebarOpen = false; // Changed initial state to closed
  // Mock user data - ideally fetch from AuthService or a user service
  currentUser: MockUser | null = null;

  private authService = inject(AuthService);
  private router = inject(Router); // Inject Router

  ngOnInit(): void {
    // Simulate fetching user data on component initialization
    // In a real app, you'd get this from AuthService after login
    this.currentUser = {
      username: 'testUser01',
      roles: this.authService.getUserRoles().length > 0 ? this.authService.getUserRoles() : ['User', 'Viewer'] // Use roles from service or default
    };
  }

  toggleSidebar() {
    this.isSidebarOpen = !this.isSidebarOpen;
    console.log('Sidebar toggled:', this.isSidebarOpen);
  }

  logout() {
    console.log('Logging out...');
    this.authService.logout();
    // AuthService should handle navigation to login, but we can ensure it here too
    // this.router.navigate(['/login']); // Navigation handled by AuthService.logout()
  }

  // Helper to format roles array into a string
  get rolesDisplay(): string {
    return this.currentUser?.roles.join(', ') || 'No roles assigned';
  }
}