import {
  Component,
  Output,
  EventEmitter,
  ViewChild,
  ElementRef,
  inject,
  input,
  effect,
  ChangeDetectionStrategy,
  OnDestroy, // [1] Import OnDestroy
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { BreakpointObserver } from '@angular/cdk/layout';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import { NavItem } from '../../core/models/nav-item.model';
import { HasPermissionDirective } from '../../shared/directives/has-permission.directive';
import { TooltipDirective } from '../../shared/directives/tooltip.directive';
import { FlyoutDirective } from '../../shared/directives/flyout.directive';

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    HasPermissionDirective,
    TooltipDirective,
    FlyoutDirective,
  ],
  templateUrl: './sidebar.component.html',
  styleUrl: './sidebar.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SidebarComponent implements OnDestroy {
  // Signal Inputs
  public navItems = input<NavItem[]>([]);
  public isOpen = input<boolean>(false);

  @Output() toggleSidebar = new EventEmitter<void>();

  @ViewChild('navContent') private navContentEl!: ElementRef<HTMLDivElement>;

  private openAccordionItems = new Set<NavItem>();
  private lastScrollTop: number = 0;
  public isMobileView: boolean = false;
  
  // [2] Store timer reference
  private navTimer: any = null;

  private breakpointObserver = inject(BreakpointObserver);
  private router = inject(Router);

  constructor() {
    this.breakpointObserver
      .observe(['(max-width: 992px)'])
      .pipe(takeUntilDestroyed())
      .subscribe((state) => {
        this.isMobileView = state.matches;
      });

    // React to isOpen changes
    effect(() => {
      const open = this.isOpen();
      if (open) {
        this.hideAllSubmenus();
        this.restoreAccordionState();
        this.restoreScrollPosition();
      } else {
        this.saveScrollPosition();
        this.hideAllSubmenus();
      }
    });
  }

  // [3] Cleanup on destroy
  ngOnDestroy(): void {
    if (this.navTimer) {
      clearTimeout(this.navTimer);
    }
  }

  hideAllSubmenus(): void {
    this.navItems().forEach((item) => {
      if (item.children) {
        item.isOpen = false;
      }
    });
  }

  restoreAccordionState(): void {
    this.navItems().forEach((item) => {
      if (item.children) {
        item.isOpen = this.openAccordionItems.has(item);
      }
    });
  }

  private saveScrollPosition(): void {
    if (this.navContentEl?.nativeElement) {
      this.lastScrollTop = this.navContentEl.nativeElement.scrollTop;
    }
  }

  private restoreScrollPosition(): void {
    requestAnimationFrame(() => {
      if (this.navContentEl?.nativeElement) {
        this.navContentEl.nativeElement.scrollTop = this.lastScrollTop;
      }
    });
  }

  onToggleSidebarClick(): void {
    this.toggleSidebar.emit();
  }

  toggleSubmenu(item: NavItem, event: Event): void {
    event.preventDefault();
    event.stopPropagation();

    if (!this.isOpen() && !this.isMobileView) {
      return;
    }

    if (this.openAccordionItems.has(item)) {
      this.openAccordionItems.delete(item);
    } else {
      this.openAccordionItems.add(item);
    }

    item.isOpen = this.openAccordionItems.has(item);
  }

  /**
   * Handles navigation clicks.
   * In mobile view, it hijacks the click event to delay navigation.
   */
  public onNavLinkClick(event: Event, link: string | null | undefined): void {
    // Always clear pending timers to prevent race conditions (e.g. double clicking)
    if (this.navTimer) {
      clearTimeout(this.navTimer);
      this.navTimer = null;
    }

    if (this.isMobileView && this.isOpen()) {
      // [4] CRITICAL: Stop RouterLink from firing immediately
      // 'stopImmediatePropagation' prevents other listeners (like RouterLink) on the same element from running.
      event.stopImmediatePropagation(); 
      event.preventDefault();

      // Close the sidebar (starts the CSS transition)
      this.toggleSidebar.emit();

      // Wait for transition
      if (link) {
        this.navTimer = setTimeout(() => {
          this.router.navigateByUrl(link);
          this.navTimer = null;
        }, 300); 
      }
    }
    // If NOT mobile, we let the event bubble or RouterLink handle it naturally
  }
}