import {
  Component,
  input,
  output,
  viewChild,
  ElementRef,
  effect,
  HostListener,
  DestroyRef,
  inject
} from '@angular/core';
import { Router, RouterModule } from '@angular/router';
import { CommonModule } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatMenuModule, MatMenuTrigger } from '@angular/material/menu';
import { KeyboardShortcutService } from '../../../core/services/keyboard-shortcut.service';
import { GLOBAL_SHORTCUTS } from '../../../core/config/keyboard-shortcuts.config';
import { MatButtonModule } from '@angular/material/button';
import { MatDividerModule } from '@angular/material/divider';
import { MatIconModule } from '@angular/material/icon';

import { User } from '../../../core/models/user.model';
import { SearchService } from '../../../core/services/search.service';
import { ThemeService } from '../../../core/services/theme.service';
import { LlmService } from '../../../core/services/llm.service';
import { VersionService } from '../../../core/services/version.service';

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
  // --- Inputs ---
  public currentUser = input<User | null>(null);
  public userInitials = input<string>('');
  public rolesDisplay = input<string>('');
  public currentScreenName = input<string>('Dashboard');
  public showSearchBar = input<boolean>(false);
  public showBackButton = input<boolean>(false);

  // --- Injections ---
  private router = inject(Router);
  public searchService = inject(SearchService);
  public themeService = inject(ThemeService);
  public llmService = inject(LlmService);
  public versionService = inject(VersionService);
  private shortcutService = inject(KeyboardShortcutService);
  private destroyRef = inject(DestroyRef);

  // --- View Queries ---
  private menuTrigger = viewChild(MatMenuTrigger);
  private avatarButton = viewChild<ElementRef<HTMLButtonElement>>('avatarButton');
  private searchInput = viewChild<ElementRef<HTMLInputElement>>('searchInput');

  // --- Outputs ---
  public sidebarToggled = output<void>();
  public logoutClicked = output<void>();
  public backClicked = output<void>();

  // --- Public Methods ---
  public focusSearch(): void {
    const input = this.searchInput()?.nativeElement;
    if (input) {
      input.focus();
    }
  }

  constructor() {
    // 1. Listen for Escape to clear/blur search
    this.shortcutService.listen(GLOBAL_SHORTCUTS.ESCAPE, true) // allowInInputs=true
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((e) => {
        const input = this.searchInput()?.nativeElement;
        if (input && document.activeElement === input) {
          e.event.preventDefault();
          if (input.value) {
            this.searchService.setSearchTerm('');
            input.value = ''; // Update view
          } else {
            input.blur();
          }
        }
      });

    // Update AI chat anchor position when avatar button is available or when chat opens
    effect(() => {
      const button = this.avatarButton()?.nativeElement;
      const isOpen = this.llmService.isOpen();

      if (button && isOpen) {
        this.updateAiChatAnchor();
      }
    });
  }

  get searchTerm(): string {
    return this.searchService.searchTerm();
  }

  // --- Event Handlers ---

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

  onAiMenuClick(event: Event): void {
    // Stop propagation to prevent document click handler from immediately closing the chat
    event.stopPropagation();

    // Update anchor position before opening
    this.updateAiChatAnchor();

    this.llmService.toggleChat();

    // Manually close the menu
    this.menuTrigger()?.closeMenu();
  }

  onSearchChange(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.searchService.setSearchTerm(target.value);
  }

  onClearSearch(): void {
    this.searchService.setSearchTerm('');
  }

  // Update anchor position on window resize
  @HostListener('window:resize')
  onResize(): void {
    if (this.llmService.isOpen()) {
      this.updateAiChatAnchor();
    }
  }

  private updateAiChatAnchor(): void {
    const button = this.avatarButton()?.nativeElement;
    if (!button) return;

    const rect = button.getBoundingClientRect();

    this.llmService.setAnchorPosition({
      top: rect.bottom + 8, // 8px gap below avatar
      right: window.innerWidth - rect.right, // Distance from right edge
    });
  }
}