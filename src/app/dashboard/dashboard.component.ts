import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AuthService } from '../services/auth.service';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss'
})
export class DashboardComponent {
  isMenuOpen = false;

  authService = inject(AuthService);
  toggleMenu() {
    this.isMenuOpen = !this.isMenuOpen;
    // Add logic here to show/hide sidebar if needed
    console.log('Menu toggled:', this.isMenuOpen);
  }
}