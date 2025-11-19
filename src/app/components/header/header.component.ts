import { Component, Input, Output, EventEmitter, ViewChild, ElementRef, HostListener, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { User } from '../../models/user.model';
import { SearchService } from '../../services/search.service';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './header.component.html',
  styleUrl: './header.component.scss',
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

  isUserMenuOpen: boolean = false;

  @ViewChild('userMenuContainer') userMenuContainer!: ElementRef;
  @ViewChild('mobileToggle') mobileToggle!: ElementRef;

  // Inject the service
  public searchService = inject(SearchService);

  constructor() {}

  // Getter to read the signal value directly in the template
  // In HTML: [value]="searchTerm"
  get searchTerm(): string {
    return this.searchService.searchTerm();
  }

  toggleUserMenu(): void {
    this.isUserMenuOpen = !this.isUserMenuOpen;
  }

  onMobileToggleClick(): void {
    this.sidebarToggled.emit();
  }

  onBackClick(): void {
    this.backClicked.emit();
  }

  onLogoutClick(): void {
    this.logoutClicked.emit();
    this.isUserMenuOpen = false;
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent) {
    if (!this.userMenuContainer) return;
    const isClickOutsideUserMenu = !this.userMenuContainer.nativeElement.contains(event.target);
    const isClickOutsideMobileToggle = !this.mobileToggle || !this.mobileToggle.nativeElement.contains(event.target);
    if (isClickOutsideUserMenu && isClickOutsideMobileToggle) {
      this.isUserMenuOpen = false;
    }
  }

  onSettingsClick(): void {
    this.isUserMenuOpen = false;
  }

  onSupportClick(): void {
    this.isUserMenuOpen = false;
  }

  onSearchChange(event: Event): void {
    const target = event.target as HTMLInputElement;
    // Set the signal value
    this.searchService.setSearchTerm(target.value);
  }

  onClearSearch(): void {
    this.searchService.setSearchTerm('');
  }
}