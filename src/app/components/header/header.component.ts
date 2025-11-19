import { Component, Input, Output, EventEmitter, inject, ViewEncapsulation } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router'; 
import { MatMenuModule } from '@angular/material/menu';
import { MatButtonModule } from '@angular/material/button';
import { MatDividerModule } from '@angular/material/divider';
import { MatIconModule } from '@angular/material/icon'; 

import { User } from '../../models/user.model';
import { SearchService } from '../../services/search.service';

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
  // Important: Allows us to style the floating menu panel
  encapsulation: ViewEncapsulation.None 
})
export class HeaderComponent {
  @Input() currentUser: User | null = null;
  @Input() userInitials: string = '';
  @Input() rolesDisplay: string = '';
  @Input() currentScreenName: string = 'Dashboard';
  @Input() showSearchBar: boolean = false;
  @Input() showBackButton: boolean = false;

  @Output() sidebarToggled = new EventEmitter<void>();
  @Output() logoutClicked = new EventEmitter<void>();
  @Output() backClicked = new EventEmitter<void>();

  public searchService = inject(SearchService);

  constructor() {}

  // Getter to read the signal value directly in the template
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

  onSettingsClick(): void { 
    // Example action for MatMenu click
  }

  onSupportClick(): void {
    // Example action for MatMenu click
  }

  onSearchChange(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.searchService.setSearchTerm(target.value);
  }

  onClearSearch(): void {
    this.searchService.setSearchTerm('');
  }
}