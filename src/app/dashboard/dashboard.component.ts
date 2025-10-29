// src/app/dashboard/dashboard.component.ts
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
  isSidebarOpen = true; // Changed initial state to open by default

  currentUser: MockUser | null = null;

  private authService = inject(AuthService);
  private router = inject(Router); // Inject Router

  ngOnInit(): void {
    this.currentUser = {
      username: 'testUser01',
      roles: this.authService.getUserRoles().length > 0 ? this.authService.getUserRoles() : ['User', 'Viewer']
    };
  }

  toggleSidebar() {
    this.isSidebarOpen = !this.isSidebarOpen;
    console.log('Sidebar toggled:', this.isSidebarOpen);
  }

  logout() {
    console.log('Logging out...');
    this.authService.logout();
  }

  get rolesDisplay(): string {
    return this.currentUser?.roles.join(', ') || 'No roles assigned';
  }
}