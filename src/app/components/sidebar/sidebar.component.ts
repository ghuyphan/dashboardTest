import {
  Component,
  Output,
  EventEmitter,
  ViewChild,
  ElementRef,
  inject,
  input,
  effect,
  ChangeDetectionStrategy, // <--- Import this
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
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
  changeDetection: ChangeDetectionStrategy.OnPush, // <--- CRITICAL PERFORMANCE FIX
})
export class SidebarComponent {
  // Signal Inputs
  public navItems = input<NavItem[]>([]);
  public isOpen = input<boolean>(false);

  @Output() toggleSidebar = new EventEmitter<void>();

  @ViewChild('navContent') private navContentEl!: ElementRef<HTMLDivElement>;

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
        this.hideAllSubmenus();
        this.restoreAccordionState();
        this.restoreScrollPosition();
      } else {
        this.saveScrollPosition();
        this.hideAllSubmenus();
      }
    });
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

  public onNavLinkClick(): void {
    if (this.isMobileView && this.isOpen()) {
      this.toggleSidebar.emit();
    }
  }
}