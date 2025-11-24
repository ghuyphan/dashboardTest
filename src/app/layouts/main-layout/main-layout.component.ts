import { 
  Component, 
  OnInit, 
  OnDestroy, 
  inject, 
  effect, 
  signal, 
  computed, 
  ChangeDetectionStrategy 
} from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import {
  Router,
  RouterModule,
  RouterOutlet,
  NavigationEnd,
  ActivatedRoute,
} from '@angular/router';
import { filter, map, mergeMap, startWith } from 'rxjs/operators';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'; // Best Practice: Auto-cleanup

import { AuthService } from '../../core/services/auth.service';
import { NavItem } from '../../core/models/nav-item.model';
import { ActionFooterComponent } from '../../components/action-footer/action-footer.component';
import { SidebarComponent } from '../../components/sidebar/sidebar.component';
import { HeaderComponent } from '../../components/header/header.component';
import { SearchService } from '../../core/services/search.service';
import { FooterActionService } from '../../core/services/footer-action.service';

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
  ],
  templateUrl: './main-layout.component.html',
  styleUrl: './main-layout.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush // Best Practice: Optimize rendering cycles
})
export class MainLayoutComponent implements OnInit, OnDestroy {
  private authService = inject(AuthService);
  private router = inject(Router);
  private activatedRoute = inject(ActivatedRoute);
  private searchService = inject(SearchService);
  private location = inject(Location);
  private footerService = inject(FooterActionService);

  // --- State Signals (Best Practice: Reactive State) ---
  public sidebarOpen = signal(false);
  public contentLoaded = signal(false);
  
  public screenTitle = signal('Đang tải...');
  public searchVisible = signal(false);
  public backButtonVisible = signal(false);

  // --- Derived State (Best Practice: Computed Signals) ---
  // Automatically updates when authService.currentUser signal emits
  public currentUser = this.authService.currentUser; 

  public rolesDisplay = computed(() => {
    const user = this.currentUser();
    return user?.roles ? user.roles.join(', ') : '';
  });

  public userInitials = computed(() => {
    const name = this.currentUser()?.username || '';
    return this.getInitials(name);
  });

  // Writable signal for local nav items (copied to allow mutation by sidebar accordion)
  public navItems = signal<NavItem[]>([]);

  constructor() {
    // Best Practice: Use effects to sync state instead of manual subscribe()
    effect(() => {
      const items = this.authService.navItems();
      // Deep copy remains necessary if the sidebar component mutates 'isOpen' state internally
      this.navItems.set(this.deepCopyNavItems(items));
    });

    this.initializeRouterEvents();
  }

  ngOnInit(): void {
    this.checkWindowSize();
    window.addEventListener('resize', this.checkWindowSize.bind(this));

    // Simulate content loading (or replace with actual logic)
    setTimeout(() => {
      this.contentLoaded.set(true);
    }, 50);
  }

  ngOnDestroy(): void {
    window.removeEventListener('resize', this.checkWindowSize.bind(this));
  }

  private initializeRouterEvents(): void {
    this.router.events
      .pipe(
        filter(event => event instanceof NavigationEnd),
        startWith(null),
        map(() => this.activatedRoute),
        map(route => {
          while (route.firstChild) route = route.firstChild;
          return route;
        }),
        filter(route => route.outlet === 'primary'),
        mergeMap(route => route.data),
        // Best Practice: RxJS Interop for auto-unsubscription
        takeUntilDestroyed() 
      )
      .subscribe((data: any) => {
        this.footerService.clearActions();
        
        // Best Practice: Update signals instead of primitive properties
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
    // Auto-collapse on small screens
    this.sidebarOpen.set(false);
  }

  private getInitials(username: string): string {
    if (username && username.length >= 3) {
      return username.substring(1, 3).toUpperCase();
    } else if (username && username.length > 0) {
      return username.substring(0, 2).toUpperCase();
    }
    return '??';
  }

  // --- Event Handlers ---

  toggleSidebar(): void {
    this.sidebarOpen.update(v => !v); // Best Practice: signal.update()
  }

  logout(): void {
    this.authService.logout();
  }

  onBackClicked(): void {
    this.location.back();
  }
}