import {
  Component,
  Input,
  Output,
  EventEmitter,
  ElementRef,
  Renderer2,
  NgZone,
  OnInit,
  OnDestroy,
  Inject,
  OnChanges,
  SimpleChanges,
} from '@angular/core';
import { DOCUMENT, CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { NavItem } from '../../models/nav-item.model';
import { HasPermissionDirective } from '../../directives/has-permission.directive';
import { TooltipDirective } from '../../directives/tooltip.directive'; // <-- IMPORT OUR NEW DIRECTIVE

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    HasPermissionDirective,
    TooltipDirective, // <-- ADD IT HERE
  ],
  templateUrl: './sidebar.component.html',
  styleUrl: './sidebar.component.scss',
})
export class SidebarComponent implements OnInit, OnDestroy, OnChanges {
  @Input() navItems: NavItem[] = [];
  @Input() isOpen: boolean = false;
  @Output() toggleSidebar = new EventEmitter<void>();

  private globalClickListener!: () => void;
  private openAccordionItems = new Set<NavItem>();

  constructor(
    @Inject(DOCUMENT) private document: Document,
    private el: ElementRef,
    private renderer: Renderer2,
    private zone: NgZone
  ) {}

  ngOnInit(): void {
    this.zone.runOutsideAngular(() => {
      this.globalClickListener = this.renderer.listen(
        this.document,
        'click',
        (event: Event) => {
          // Close flyout if clicking outside sidebar
          const aFlyoutIsOpen =
            !this.isOpen && this.navItems.some((item) => !!item.isOpen);
          
          if (aFlyoutIsOpen) {
            const clickedInside = this.el.nativeElement.contains(event.target);
            if (!clickedInside) {
              this.zone.run(() => {
                this.hideAllSubmenus();
              });
            }
          }
        }
      );
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['isOpen']) {
      if (changes['isOpen'].firstChange) {
        return;
      }
      
      const isNowOpen = changes['isOpen'].currentValue;

      if (isNowOpen) {
        // If sidebar is opening, close all submenus and restore accordion state
        this.hideAllSubmenus();
        this.restoreAccordionState();
      } else {
        // If sidebar is closing, just close all submenus
        this.hideAllSubmenus();
      }
    }
  }

  ngOnDestroy(): void {
    if (this.globalClickListener) {
      this.globalClickListener();
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
    this.toggleSidebar.emit();
  }

  toggleSubmenu(item: NavItem, event: Event): void {
    event.preventDefault();
    event.stopPropagation();

    if (this.isOpen) {
      // --- ACCORDION LOGIC (Sidebar Open) ---
      const wasOpen = this.openAccordionItems.has(item);
      if (wasOpen) {
        this.openAccordionItems.delete(item);
      } else {
        this.openAccordionItems.add(item);
      }
      item.isOpen = !wasOpen;

    } else {
      // --- FLYOUT LOGIC (Sidebar Collapsed) ---
      const wasOpen = item.isOpen;
      // Close all other flyouts first
      this.hideAllSubmenus();
      // Toggle the current item
      item.isOpen = !wasOpen;
    }
  }

  // Helper to be called from the template when a link in the flyout is clicked
  onFlyoutLinkClick(): void {
    // This will bubble to the ul(click) and close
    this.hideAllSubmenus();
  }
}