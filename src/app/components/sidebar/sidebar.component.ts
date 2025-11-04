import {
  Component,
  Input,
  Output,
  EventEmitter,
  ElementRef, // Import ElementRef
  Renderer2, // Import Renderer2
  NgZone, // Import NgZone
  OnInit, // Import OnInit
  OnDestroy, // Import OnDestroy
  Inject, // Import Inject
  OnChanges, // Import OnChanges
  SimpleChanges, // Import SimpleChanges
} from '@angular/core';
import { DOCUMENT, CommonModule } from '@angular/common'; // Import DOCUMENT
import { RouterModule } from '@angular/router';
import { NavItem } from '../../models/nav-item.model';
import { HasPermissionDirective } from '../../directives/has-permission.directive';

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [CommonModule, RouterModule, HasPermissionDirective],
  templateUrl: './sidebar.component.html',
  styleUrl: './sidebar.component.scss',
})
export class SidebarComponent implements OnInit, OnDestroy, OnChanges {
  @Input() navItems: NavItem[] = [];
  @Input() isOpen: boolean = false;
  @Output() toggleSidebar = new EventEmitter<void>();

  private globalClickListener!: () => void; // For the click-outside listener

  constructor(
    @Inject(DOCUMENT) private document: Document,
    private el: ElementRef,
    private renderer: Renderer2,
    private zone: NgZone
  ) {}

  ngOnInit(): void {
    // Run the global listener outside Angular's zone for performance
    this.zone.runOutsideAngular(() => {
      this.globalClickListener = this.renderer.listen(
        this.document,
        'click',
        (event: Event) => {
          // Check if a fly-out is open (sidebar collapsed + an item is open)
          const aFlyoutIsOpen =
            !this.isOpen && this.navItems.some((item) => !!item.isOpen);

          if (aFlyoutIsOpen) {
            // Check if the click was *outside* the sidebar component
            const clickedInside = this.el.nativeElement.contains(event.target);

            if (!clickedInside) {
              // If outside, close all submenus and run back inside Angular's zone
              // to trigger change detection.
              this.zone.run(() => {
                this.closeAllSubmenus();
              });
            }
          }
        }
      );
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    // Check if the 'isOpen' property is changing
    if (changes['isOpen']) {
      // THIS IS THE FIX for your scenario:
      // When sidebar state changes, close all submenus
      // to prevent an open accordion from instantly
      // becoming an open fly-out.
      if (!changes['isOpen'].firstChange) {
        this.closeAllSubmenus();
      }
    }
  }

  ngOnDestroy(): void {
    // Clean up the global listener to prevent memory leaks
    if (this.globalClickListener) {
      this.globalClickListener();
    }
  }

  /**
   * Closes all submenus.
   */
  closeAllSubmenus(excludeItem?: NavItem): void {
    this.navItems.forEach((item) => {
      // Only close *other* items
      if (item !== excludeItem && item.children) {
        item.isOpen = false;
      }
    });
  }

  onToggleSidebarClick(): void {
    this.toggleSidebar.emit();
  }

  /**
   * Toggles a submenu item.
   * - If sidebar is open, it functions as an accordion.
   * - If sidebar is collapsed, it functions as a fly-out menu.
   */
  toggleSubmenu(item: NavItem, event: Event): void {
    event.preventDefault();
    event.stopPropagation(); // Stop event from bubbling up

    if (this.isOpen) {
      // --- SIDEBAR IS OPEN: Accordion behavior ---
      // Just toggle the clicked item's state
      item.isOpen = !item.isOpen;
    } else {
      // --- SIDEBAR IS COLLAPSED: Fly-out behavior ---
      // MODIFIED FOR FIX #1:
      // Just toggle the item's state to allow multiple fly-outs.
      // The click-outside listener (ngOnInit) will handle closing them all.
      item.isOpen = !item.isOpen;
    }
  }
}