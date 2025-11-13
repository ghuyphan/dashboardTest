import {
  Component,
  Input,
  Output,
  EventEmitter,
  ViewChild,
  ElementRef,
  HostListener,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { User } from '../../models/user.model';

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
  @Input() showSearchBar: boolean = false; // <-- NEW
  @Input() showBackButton: boolean = false; // <-- 1. ADD INPUT

  @Output() sidebarToggled = new EventEmitter<void>();
  @Output() logoutClicked = new EventEmitter<void>();
  @Output() searchChanged = new EventEmitter<string>(); // <-- NEW
  @Output() backClicked = new EventEmitter<void>(); // <-- 2. ADD OUTPUT

  isUserMenuOpen: boolean = false;
  searchTerm: string = ''; // <-- NEW

  @ViewChild('userMenuContainer') userMenuContainer!: ElementRef;
  @ViewChild('mobileToggle') mobileToggle!: ElementRef;

  constructor() {}

  toggleUserMenu(): void {
    this.isUserMenuOpen = !this.isUserMenuOpen;
  }

  onMobileToggleClick(): void {
    this.sidebarToggled.emit();
  }

  // <-- 3. ADD HANDLER -->
  onBackClick(): void {
    this.backClicked.emit();
  }

  onLogoutClick(): void {
    this.logoutClicked.emit();
    this.isUserMenuOpen = false;
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent) {
    // If user menu doesn't exist, do nothing
    if (!this.userMenuContainer) {
      return;
    }

    // Check if the click is outside the user menu
    const isClickOutsideUserMenu =
      !this.userMenuContainer.nativeElement.contains(event.target);

    // Check if the click is outside the mobile toggle button
    const isClickOutsideMobileToggle =
      !this.mobileToggle ||
      !this.mobileToggle.nativeElement.contains(event.target);

    // If the click is outside both, close the menu
    if (isClickOutsideUserMenu && isClickOutsideMobileToggle) {
      this.isUserMenuOpen = false;
    }
  }

  onSettingsClick(): void {
    console.log('Settings clicked');
    this.isUserMenuOpen = false;
  }

  onSupportClick(): void {
    console.log('Support clicked');
    this.isUserMenuOpen = false;
  }

  // <-- NEW METHOD -->
  onSearchChange(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.searchTerm = target.value;
    this.searchChanged.emit(this.searchTerm);
  }

  // --- START OF ADDITION ---
  /**
   * Clears the search term and emits the change.
   */
  onClearSearch(): void {
    this.searchTerm = '';
    this.searchChanged.emit(this.searchTerm);
  }
  // --- END OF ADDITION ---
}