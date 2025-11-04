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

  private globalClickListener!: () => void;

  // POLISH 1: This Set *remembers* the accordion state,
  // completely separate from the visible (fly-out) state.
  private openAccordionItems = new Set<NavItem>();

  constructor(
    @Inject(DOCUMENT) private document: Document,
    private el: ElementRef,
    private renderer: Renderer2,
    private zone: NgZone
  ) {}

  ngOnInit(): void {
    // Click-outside listener (for fly-outs)
    this.zone.runOutsideAngular(() => {
      this.globalClickListener = this.renderer.listen(
        this.document,
        'click',
        (event: Event) => {
          const aFlyoutIsOpen =
            !this.isOpen && this.navItems.some((item) => !!item.isOpen);
          if (aFlyoutIsOpen) {
            const clickedInside = this.el.nativeElement.contains(event.target);
            if (!clickedInside) {
              this.zone.run(() => {
                // This only closes *visible* fly-outs, it does not touch our memory.
                this.hideAllSubmenus();
              });
            }
          }
        }
      );
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    // POLISH 2: This is the new, glitch-free transition logic
    if (changes['isOpen']) {
      if (changes['isOpen'].firstChange) {
        return; // Don't run on initial load
      }

      const isNowOpen = changes['isOpen'].currentValue;

      if (isNowOpen) {
        // --- SIDEBAR IS EXPANDING ---
        // 1. Hide any stray fly-outs that might be open
        this.hideAllSubmenus();
        // 2. Restore the accordion state from our memory
        this.restoreAccordionState();
      } else {
        // --- SIDEBAR IS COLLAPSING ---
        // 1. THIS IS THE FIX: We *only* hide the visible submenus.
        //    Your accordion state is safely saved in 'openAccordionItems'.
        //    This prevents the "flash" of the accordion trying to
        //    animate into a fly-out.
        this.hideAllSubmenus();
      }
    }
  }

  ngOnDestroy(): void {
    if (this.globalClickListener) {
      this.globalClickListener();
    }
  }

  /**
   * Hides all *visible* submenus (by setting item.isOpen = false).
   * This does NOT affect the 'openAccordionItems' memory Set.
   */
  hideAllSubmenus(): void {
    this.navItems.forEach((item) => {
      if (item.children) {
        item.isOpen = false;
      }
    });
  }

  /**
   * Restores the visible 'item.isOpen' state
   * using our 'openAccordionItems' memory Set.
   */
  restoreAccordionState(): void {
    this.navItems.forEach((item) => {
      if (item.children) {
        // Restore the visible state from our memory
        item.isOpen = this.openAccordionItems.has(item);
      }
    });
  }

  onToggleSidebarClick(): void {
    this.toggleSidebar.emit();
  }

  /**
   * Toggles a submenu item using our separated logic.
   */
  toggleSubmenu(item: NavItem, event: Event): void {
    event.preventDefault();
    event.stopPropagation();

    if (this.isOpen) {
      // --- ACCORDION LOGIC ---
      // We update our *memory* first.
      if (this.openAccordionItems.has(item)) {
        this.openAccordionItems.delete(item);
      } else {
        this.openAccordionItems.add(item);
      }
      // Then, we update the *visible* state.
      item.isOpen = this.openAccordionItems.has(item);
    } else {
      // --- FLY-OUT LOGIC ---
      // This is purely visual and temporary. It does NOT touch the memory Set.
      // This allows multiple fly-outs.
      const isCurrentlyOpen = !!item.isOpen;
      // Close other flyouts for a cleaner (one-at-a-time) experience
      this.hideAllSubmenus();
      item.isOpen = !isCurrentlyOpen;
    }
  }
}