import { Component, Output, EventEmitter, inject, ViewEncapsulation, input } from '@angular/core';
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
    MatIconModule
  ],
  templateUrl: './header.component.html',
  styleUrl: './header.component.scss',
  encapsulation: ViewEncapsulation.Emulated 
})
export class HeaderComponent {
  public currentUser = input<User | null>(null);
  public userInitials = input<string>('');
  public rolesDisplay = input<string>('');
  public currentScreenName = input<string>('Dashboard');
  public showSearchBar = input<boolean>(false);
  public showBackButton = input<boolean>(false);

  @Output() sidebarToggled = new EventEmitter<void>();
  @Output() logoutClicked = new EventEmitter<void>();
  @Output() backClicked = new EventEmitter<void>();

  public searchService = inject(SearchService);
  public themeService = inject(ThemeService);

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

  // FIXED: Added 'event' parameter here to match the HTML template
  onThemeToggle(event: Event): void {
    event.stopPropagation();
    event.preventDefault();
    this.themeService.toggleTheme();
  }

  onSettingsClick(): void {}

  onSupportClick(): void {}

  onSearchChange(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.searchService.setSearchTerm(target.value);
  }

  onClearSearch(): void {
    this.searchService.setSearchTerm('');
  }
}