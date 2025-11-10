import {
  Component,
  Input,
  Output,
  EventEmitter,
  OnChanges,
  SimpleChanges,
  ViewChild,
  ElementRef,
  HostListener, // <-- 1. IMPORT HostListener
  Renderer2, // <-- 2. IMPORT Renderer2
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { NavItem } from '../../models/nav-item.model';
import { HasPermissionDirective } from '../../directives/has-permission.directive';
import { TooltipDirective } from '../../directives/tooltip.directive';
import { FlyoutDirective } from '../../directives/flyout.directive';

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
})
export class SidebarComponent implements OnChanges {
  @Input() navItems: NavItem[] = [];
  @Input() isOpen: boolean = false;
  @Output() toggleSidebar = new EventEmitter<void>();

  @ViewChild('navContent') private navContentEl!: ElementRef<HTMLDivElement>;

  private openAccordionItems = new Set<NavItem>();
  private lastScrollTop: number = 0;
  private isMobileView: boolean = false; // <-- 3. Add property

  // 4. Inject Renderer2
  constructor(private renderer: Renderer2, private el: ElementRef) {
    this.checkIfMobile();
  }

  // 5. Add HostListener for window resize
  @HostListener('window:resize', ['$event'])
  onResize(event: any): void {
    this.checkIfMobile();
  }

  private checkIfMobile(): void {
    // 992px is the breakpoint used in your CSS
    this.isMobileView = window.innerWidth <= 992;
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['isOpen']) {
      // On mobile, check window size when sidebar state changes
      this.checkIfMobile();
      
      if (changes['isOpen'].firstChange) {
        return;
      }

      const isNowOpen = changes['isOpen'].currentValue;

      if (isNowOpen) {
        // === IS OPENING ===
        this.hideAllSubmenus();
        this.restoreAccordionState();
        this.restoreScrollPosition();
      } else {
        // === IS CLOSING ===
        this.saveScrollPosition();
        this.hideAllSubmenus();
      }
    }
  }

  // ... (hideAllSubmenus, restoreAccordionState, saveScrollPosition, restoreScrollPosition, onToggleSidebarClick are unchanged) ...
  
  hideAllSubmenus(): void {
    this.navItems.forEach((item) => {
      if (item.children) {
        item.isOpen = false;
      }
    });
  }

  restoreAccordionState(): void {
    this.navItems.forEach((item) => {
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
    setTimeout(() => {
      if (this.navContentEl?.nativeElement) {
        this.navContentEl.nativeElement.scrollTop = this.lastScrollTop;
      }
    }, 50);
  }

  onToggleSidebarClick(): void {
    this.toggleSidebar.emit();
  }

  toggleSubmenu(item: NavItem, event: Event): void {
    event.preventDefault();
    event.stopPropagation();

    // On mobile, isOpen is always true (when the panel is out)
    // On desktop, we only toggle accordion if isOpen is true
    if (!this.isOpen && !this.isMobileView) {
      return;
    }

    if (this.openAccordionItems.has(item)) {
      this.openAccordionItems.delete(item);
    } else {
      this.openAccordionItems.add(item);
    }

    item.isOpen = this.openAccordionItems.has(item);
  }

  // --- 6. ADD NEW METHOD ---
  /**
   * Called when a navigation link (a tag) is clicked.
   * If on mobile, it emits an event to close the sidebar.
   */
  public onNavLinkClick(): void {
    if (this.isMobileView && this.isOpen) {
      this.toggleSidebar.emit();
    }
  }
}