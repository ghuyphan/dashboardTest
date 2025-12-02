import {
  Component,
  Output,
  EventEmitter,
  ViewChild,
  ElementRef,
  inject,
  input,
  effect,
  signal,
  AfterViewInit,
  ChangeDetectionStrategy,
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
export class SidebarComponent implements AfterViewInit {
  // Signal Inputs
  public navItems = input<NavItem[]>([]);
  public isOpen = input<boolean>(false);

  @Output() toggleSidebar = new EventEmitter<void>();
  @Output() closeSidebar = new EventEmitter<void>();

  @ViewChild('navContent') private navContentEl!: ElementRef<HTMLDivElement>;

  public transitionsEnabled = signal(false);

  private openAccordionItems = new Set<NavItem>();
  private lastScrollTop: number = 0;
  public isMobileView: boolean = false;

  private breakpointObserver = inject(BreakpointObserver);

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
        // When opening, we might want to restore state or keep everything closed
        // keeping it simple: close all to avoid clutter
        this.hideAllSubmenus(); 
        this.restoreScrollPosition();
      } else {
        this.saveScrollPosition();
        this.hideAllSubmenus();
      }
    });
  }

  ngAfterViewInit(): void {
    setTimeout(() => {
      this.transitionsEnabled.set(true);
    }, 300);
  }

  /**
   * Recursive helper to close all menus in the tree
   */
  private hideAllSubmenus(): void {
    const closeRecursive = (items: NavItem[]) => {
      items.forEach(item => {
        item.isOpen = false;
        if (item.children) {
          closeRecursive(item.children);
        }
      });
    };
    closeRecursive(this.navItems());
    this.openAccordionItems.clear();
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

  /**
   * Public method to toggle any item at any level
   */
  toggleSubmenu(item: NavItem, event: Event): void {
    event.preventDefault();
    event.stopPropagation();

    // If sidebar is collapsed (and not mobile), we don't toggle accordion style
    // The FlyoutDirective handles the initial open, but internal clicks 
    // (Level 2 -> Level 3) still need this logic to expand the inner list.
    if (!this.isOpen() && !this.isMobileView) {
       // For flyouts, we just toggle the boolean, simpler logic
       item.isOpen = !item.isOpen;
       return;
    }

    if (this.openAccordionItems.has(item)) {
      this.openAccordionItems.delete(item);
      item.isOpen = false;
    } else {
      this.openAccordionItems.add(item);
      item.isOpen = true;
    }
  }

  public onNavLinkClick(): void {
    if (this.isMobileView && this.isOpen()) {
      this.closeSidebar.emit();
    }
  }
}