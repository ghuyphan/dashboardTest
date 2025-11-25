import {
  Component,
  inject,
  input,
  output, // Updated: Modern Output API
} from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { MatMenuModule } from '@angular/material/menu';
import { MatButtonModule } from '@angular/material/button';
import { MatDividerModule } from '@angular/material/divider';
import { MatIconModule } from '@angular/material/icon';

import { User } from '../../core/models/user.model';
import { SearchService } from '../../core/services/search.service';
import { ThemeService } from '../../core/services/theme.service';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    MatMenuModule,
    MatButtonModule,
    MatDividerModule,
    MatIconModule,
  ],
  templateUrl: './header.component.html',
  styleUrl: './header.component.scss'
})
export class HeaderComponent {
  public currentUser = input<User | null>(null);
  public userInitials = input<string>('');
  public rolesDisplay = input<string>('');
  public currentScreenName = input<string>('Dashboard');
  public showSearchBar = input<boolean>(false);
  public showBackButton = input<boolean>(false);
  
  private router = inject(Router);
  public searchService = inject(SearchService);
  public themeService = inject(ThemeService);

  // Updated: Use modern output() function
  public sidebarToggled = output<void>();
  public logoutClicked = output<void>();
  public backClicked = output<void>();

  get searchTerm(): string {
    return this.searchService.searchTerm();
  }

  onMobileToggleClick(): void {
    this.sidebarToggled.emit();
  }

  onBackClick(): void {
    this.backClicked.emit();
  }

  onLogoutClick(): void {
    this.logoutClicked.emit();
  }

  onThemeToggle(event: Event): void {
    event.stopPropagation();
    event.preventDefault();
    this.themeService.toggleTheme();
  }

  onSettingsClick(): void {
    this.router.navigate(['/app/settings']);
  }

  onSupportClick(): void {
    // Implementation for support action
  }

  onSearchChange(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.searchService.setSearchTerm(target.value);
  }

  onClearSearch(): void {
    this.searchService.setSearchTerm('');
  }
}