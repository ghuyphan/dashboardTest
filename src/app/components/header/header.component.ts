import {
  Component,
  Input,
  Output,
  EventEmitter,
  ViewChild,
  ElementRef,
  HostListener,
  OnInit, // <-- IMPORT
  OnDestroy, // <-- IMPORT
  ChangeDetectorRef, // <-- IMPORT
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { User } from '../../models/user.model';
import { SearchService } from '../../services/search.service'; // <-- IMPORT
import { Subscription } from 'rxjs'; // <-- IMPORT

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './header.component.html',
  styleUrl: './header.component.scss',
})
export class HeaderComponent implements OnInit, OnDestroy { // <-- IMPLEMENT
  @Input() currentUser: User | null = null;
  @Input() userInitials: string = '';
  @Input() rolesDisplay: string = '';
  @Input() currentScreenName: string = 'Dashboard';
  @Input() showSearchBar: boolean = false;
  @Input() showBackButton: boolean = false;

  @Output() sidebarToggled = new EventEmitter<void>();
  @Output() logoutClicked = new EventEmitter<void>();
  // --- This is no longer needed, as we'll use the service ---
  // @Output() searchChanged = new EventEmitter<string>();
  @Output() backClicked = new EventEmitter<void>();

  isUserMenuOpen: boolean = false;
  searchTerm: string = '';

  @ViewChild('userMenuContainer') userMenuContainer!: ElementRef;
  @ViewChild('mobileToggle') mobileToggle!: ElementRef;

  // --- START OF MODIFICATION ---
  private searchSub: Subscription | null = null;

  constructor(
    private searchService: SearchService, // <-- INJECT
    private cd: ChangeDetectorRef // <-- INJECT
  ) {}

  ngOnInit(): void {
    // Subscribe to the search service to keep the local search term in sync
    this.searchSub = this.searchService.searchTerm$.subscribe(term => {
      if (term !== this.searchTerm) {
        this.searchTerm = term;
        this.cd.detectChanges(); // Update the view
      }
    });
  }

  ngOnDestroy(): void {
    this.searchSub?.unsubscribe();
  }
  // --- END OF MODIFICATION ---

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
    if (!this.userMenuContainer) {
      return;
    }

    const isClickOutsideUserMenu =
      !this.userMenuContainer.nativeElement.contains(event.target);
    const isClickOutsideMobileToggle =
      !this.mobileToggle ||
      !this.mobileToggle.nativeElement.contains(event.target);

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

  // --- START OF MODIFICATION ---
  /**
   * Updates the search term in the service as the user types.
   */
  onSearchChange(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.searchTerm = target.value;
    // Call the service directly
    this.searchService.setSearchTerm(this.searchTerm);
  }

  /**
   * Clears the search term in the service.
   */
  onClearSearch(): void {
    this.searchTerm = '';
    // Call the service directly
    this.searchService.setSearchTerm(this.searchTerm);
  }
  // --- END OF MODIFICATION ---
}