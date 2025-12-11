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
import { CommonModule, NgOptimizedImage } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { BreakpointObserver } from '@angular/cdk/layout';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import { NavItem } from '../../../core/models/nav-item.model';
import { HasPermissionDirective } from '../../directives/has-permission.directive';
import { TooltipDirective } from '../../directives/tooltip.directive';
import { FlyoutDirective } from '../../directives/flyout.directive';
import { KeyboardShortcutService } from '../../../core/services/keyboard-shortcut.service';

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    HasPermissionDirective,
    TooltipDirective,
    FlyoutDirective,
    NgOptimizedImage,
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

  // [FIX] Signal to gate animations until view is stable
  public transitionsEnabled = signal(false);

  private openAccordionItems = new Set<NavItem>();
  private lastScrollTop: number = 0;
  public isMobileView: boolean = false;

  private breakpointObserver = inject(BreakpointObserver);
  private router = inject(Router);
  private shortcutService = inject(KeyboardShortcutService);

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

  ngAfterViewInit(): void {
    // [FIX] Enable transitions shortly after render to prevent initial "closing" animation glitch
    setTimeout(() => {
      this.transitionsEnabled.set(true);
    }, 300);
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
      this.closeSidebar.emit();
    }
  }
}