import {
  Component,
  Input,
  Output,
  EventEmitter,
  ElementRef,
  NgZone,
  OnChanges,
  SimpleChanges,
  ViewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { NavItem } from '../../models/nav-item.model';
import { HasPermissionDirective } from '../../directives/has-permission.directive';
import { TooltipDirective } from '../../directives/tooltip.directive';
import { FlyoutDirective } from '../../directives/flyout.directive'; // <-- ADDED

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    HasPermissionDirective,
    TooltipDirective,
    FlyoutDirective, // <-- ADDED
  ],
  templateUrl: './sidebar.component.html',
  styleUrl: './sidebar.component.scss',
})
export class SidebarComponent implements OnChanges { // <-- Removed OnInit, OnDestroy
  @Input() navItems: NavItem[] = [];
  @Input() isOpen: boolean = false;
  @Output() toggleSidebar = new EventEmitter<void>();

  // Get a reference to the new #navContent wrapper from the template
  @ViewChild('navContent') private navContentEl!: ElementRef<HTMLDivElement>;

  // private globalClickListener!: () => void; // <-- REMOVED
  private openAccordionItems = new Set<NavItem>();
  private scrollPosition = 0; // <-- To store scroll position

  constructor(
    // @Inject(DOCUMENT) private document: Document, // <-- REMOVED
    // private el: ElementRef, // <-- REMOVED
    // private renderer: Renderer2, // <-- REMOVED
    private zone: NgZone
  ) {}

  // ngOnInit(): void { ... } // <-- REMOVED

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['isOpen']) {
      if (changes['isOpen'].firstChange) {
        return;
      }

      const isNowOpen = changes['isOpen'].currentValue;

      if (isNowOpen) {
        this.hideAllSubmenus(); // Collapses all items
        this.restoreAccordionState(); // Re-opens accordions based on state
      } else {
        // When collapsing, just collapse all accordions
        this.hideAllSubmenus();
      }

      // Restore scroll position after view updates
      // this.zone.runOutsideAngular(() => {
      //   setTimeout(() => {
      //     this.restoreScrollPosition();
      //   }, 0);
      // });
    }
  }

  // ngOnDestroy(): void { ... } // <-- REMOVED

  // Helper to restore scroll
  private restoreScrollPosition(): void {
    if (this.navContentEl) {
      this.navContentEl.nativeElement.scrollTop = this.scrollPosition;
    }
  }

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

  onToggleSidebarClick(): void {
    // Save the scroll position *before* emitting the change
    if (this.navContentEl) {
      this.scrollPosition = this.navContentEl.nativeElement.scrollTop;
    }
    this.toggleSidebar.emit();
  }

  toggleSubmenu(item: NavItem, event: Event): void {
    event.preventDefault();
    event.stopPropagation();

    // Flyout logic is now handled by the flyout.directive
    // This function only manages accordion state (when sidebar is open)
    if (!this.isOpen) {
      return;
    }

    if (this.openAccordionItems.has(item)) {
      this.openAccordionItems.delete(item);
    } else {
      this.openAccordionItems.add(item);
    }
    // Update item.isOpen to match the accordion state
    item.isOpen = this.openAccordionItems.has(item);
  }
}