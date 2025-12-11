import {
  Component,
  OnInit,
  OnDestroy,
  inject,
  effect,
  signal,
  computed,
  ChangeDetectionStrategy,
  ViewChild,
  ElementRef,
  DestroyRef
} from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import {
  Router,
  RouterModule,
  RouterOutlet,
  NavigationEnd,
  NavigationStart,
  ActivatedRoute,
} from '@angular/router'
import { filter, map, mergeMap, startWith, tap } from 'rxjs/operators';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import { AuthService } from '../../core/services/auth.service';
import { NavItem } from '../../core/models/nav-item.model';
import { ActionFooterComponent } from '../../shared/components/action-footer/action-footer.component';
import { SidebarComponent } from '../../shared/components/sidebar/sidebar.component';
import { HeaderComponent } from '../../shared/components/header/header.component';
import { SearchService } from '../../core/services/search.service';
import { FooterActionService } from '../../core/services/footer-action.service';
import { AiChatComponent } from '../../shared/components/ai-chat/ai-chat.component';
import { LlmService } from '../../core/services/llm.service'; // [NEW]
import { ModalService } from '../../core/services/modal.service';
import { ConfirmationModalComponent } from '../../shared/components/confirmation-modal/confirmation-modal.component';
import { KeyboardShortcutService } from '../../core/services/keyboard-shortcut.service';

interface RouteData {
  title?: string;
  showSearchBar?: boolean;
  showBackButton?: boolean;
  [key: string]: any;
}

@Component({
  selector: 'app-main-layout',
  standalone: true,
  imports: [
    CommonModule,
    RouterOutlet,
    RouterModule,
    ActionFooterComponent,
    SidebarComponent,
    HeaderComponent,
    AiChatComponent
  ],
  templateUrl: './main-layout.component.html',
  styleUrl: './main-layout.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MainLayoutComponent implements OnInit, OnDestroy {
  private authService = inject(AuthService);
  private router = inject(Router);
  private activatedRoute = inject(ActivatedRoute);
  private searchService = inject(SearchService);
  private location = inject(Location);
  private footerService = inject(FooterActionService);
  private modalService = inject(ModalService);
  private destroyRef = inject(DestroyRef);
  private shortcutService = inject(KeyboardShortcutService);
  private llmService = inject(LlmService); // [NEW]

  // --- State Signals ---
  public sidebarOpen = signal(false);
  public contentLoaded = signal(false);

  public screenTitle = signal('Đang tải...');
  public searchVisible = signal(false);
  public backButtonVisible = signal(false);

  // --- Derived State ---
  public currentUser = this.authService.currentUser;

  public rolesDisplay = computed(() => {
    const user = this.currentUser();
    return user?.roles ? user.roles.join(', ') : '';
  });

  public userInitials = computed(() => {
    const name = this.currentUser()?.username || '';
    return this.getInitials(name);
  });

  public navItems = signal<NavItem[]>([]);

  // [FIX] Access the scroll container
  @ViewChild('mainContent') private mainContent!: ElementRef<HTMLElement>;
  @ViewChild(HeaderComponent) private headerComponent!: HeaderComponent;

  // Store resize listener to remove it later
  private resizeListener = this.checkWindowSize.bind(this);

  constructor() {
    effect(() => {
      const items = this.authService.navItems();
      this.navItems.set(this.deepCopyNavItems(items));
    });

    this.initializeRouterEvents();
  }

  ngOnInit(): void {
    // Initial check for mobile size
    if (window.innerWidth <= 992) {
      this.sidebarOpen.set(false);
    }

    window.addEventListener('resize', this.resizeListener);
    this.contentLoaded.set(true);

    // [DEMO] Register a global shortcut: Ctrl + Alt + L to Logout
    this.shortcutService.listen({ key: 'l', ctrlKey: true, altKey: true })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        console.log('Shortcut triggered: Ctrl+Alt+L');
        this.logout();
      });

    // [DEMO] Search shortcut: Ctrl + K
    this.shortcutService.listen({ key: 'k', ctrlKey: true }, true) // allow in inputs so you can re-focus if lost? actually maybe not if typing? 
      // Common pattern: Ctrl+K works even if focused in other inputs usually, or at least from body.
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((e) => {
        e.event.preventDefault(); // Prevent browser search if conflict, though usually Ctrl+F is browser search. Ctrl+K is often browser address bar focus.
        this.headerComponent.focusSearch();
      });

    // Toggle Sidebar: Ctrl + B
    this.shortcutService.listen({ key: 'b', ctrlKey: true })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((e) => {
        e.event.preventDefault();
        this.toggleSidebar();
      });

    // Toggle AI Chat: Ctrl + / (slash) or Ctrl + ?
    this.shortcutService.listen({ key: '/', ctrlKey: true })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((e) => {
        e.event.preventDefault();
        // We need to access the LlmService. Since it is injected in Header, maybe we can access it there or inject it here.
        // It's cleaner to inject it here as well.
        this.toggleAiChat();
      });

    // Navigate to Settings: Alt + S
    this.shortcutService.listen({ key: 's', altKey: true })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((e) => {
        e.event.preventDefault();
        this.router.navigate(['/app/settings']);
      });




  }

  ngOnDestroy(): void {
    window.removeEventListener('resize', this.resizeListener);
  }

  private initializeRouterEvents(): void {
    this.router.events
      .pipe(
        filter(event => event instanceof NavigationStart),
        takeUntilDestroyed()
      )
      .subscribe(() => {
        this.footerService.clearActions();
      });

    this.router.events
      .pipe(
        filter(event => event instanceof NavigationEnd),
        tap(() => {
          // 1. Close sidebar on mobile
          if (window.innerWidth <= 992 && this.sidebarOpen()) {
            requestAnimationFrame(() => {
              this.sidebarOpen.set(false);
            });
          }

          // [FIX] 2. Reset scroll position for the internal container
          if (this.mainContent?.nativeElement) {
            this.mainContent.nativeElement.scrollTop = 0;
          }
        }),
        startWith(null),
        map(() => this.activatedRoute),
        map(route => {
          while (route.firstChild) route = route.firstChild;
          return route;
        }),
        filter(route => route.outlet === 'primary'),
        mergeMap(route => route.data),
        takeUntilDestroyed()
      )
      .subscribe((data: RouteData) => {
        this.screenTitle.set(data['title'] || 'Dashboard');
        this.searchVisible.set(data['showSearchBar'] === true);
        this.backButtonVisible.set(data['showBackButton'] === true);

        if (!this.searchVisible()) {
          this.searchService.setSearchTerm('');
        }
      });
  }

  private deepCopyNavItems(items: NavItem[]): NavItem[] {
    return items.map(item => ({
      ...item,
      children: item.children ? this.deepCopyNavItems(item.children) : undefined,
    }));
  }

  private checkWindowSize(): void {
    if (window.innerWidth <= 992 && this.sidebarOpen()) {
      this.sidebarOpen.set(false);
    }
  }

  private getInitials(username: string): string {
    if (!username) return '??';
    if (username.length >= 2) {
      return username.substring(0, 2).toUpperCase();
    }
    return username.toUpperCase();
  }

  // --- Event Handlers ---

  toggleSidebar(): void {
    this.sidebarOpen.update(v => !v);
  }

  closeSidebar(): void {
    this.sidebarOpen.set(false);
  }

  toggleAiChat(): void {
    this.llmService.toggleChat();
  }

  logout(): void {
    this.modalService.open(ConfirmationModalComponent, {
      title: 'Xác nhận',
      size: 'sm',
      context: {
        layout: 'center',
        icon: 'fas fa-sign-out-alt',
        iconColor: 'var(--color-danger)',
        title: 'Đăng xuất?',
        message: 'Bạn có chắc chắn muốn đăng xuất khỏi hệ thống không?',
        confirmText: 'Đăng xuất',
        cancelText: 'Hủy bỏ'
      }
    }).pipe(
      takeUntilDestroyed(this.destroyRef)
    ).subscribe((confirmed) => {
      if (confirmed) {
        this.authService.logout();
      }
    });
  }

  onBackClicked(): void {
    this.location.back();
  }
}