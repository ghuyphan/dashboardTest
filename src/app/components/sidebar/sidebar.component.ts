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
  ViewContainerRef,
  ViewChild,
  TemplateRef,
} from '@angular/core';
import { DOCUMENT, CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { NavItem } from '../../models/nav-item.model';
import { HasPermissionDirective } from '../../directives/has-permission.directive';
import {
  Overlay,
  OverlayModule,
  OverlayRef,
  ConnectedPosition,
} from '@angular/cdk/overlay';
import { TemplatePortal } from '@angular/cdk/portal';

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    HasPermissionDirective,
    OverlayModule, // <-- Import CDK OverlayModule
  ],
  templateUrl: './sidebar.component.html',
  styleUrl: './sidebar.component.scss',
})
export class SidebarComponent implements OnInit, OnDestroy, OnChanges {
  @Input() navItems: NavItem[] = [];
  @Input() isOpen: boolean = false;
  @Output() toggleSidebar = new EventEmitter<void>();

  // --- CDK Overlay Properties ---
  @ViewChild('flyoutTemplate') flyoutTemplate!: TemplateRef<any>;
  private flyoutOverlayRef: OverlayRef | null = null;
  private openFlyoutItem: NavItem | null = null;
  // ------------------------------

  private globalClickListener!: () => void;
  private openAccordionItems = new Set<NavItem>();

  constructor(
    @Inject(DOCUMENT) private document: Document,
    private el: ElementRef,
    private renderer: Renderer2,
    private zone: NgZone,
    // --- Ingest CDK Services ---
    private overlay: Overlay,
    private viewContainerRef: ViewContainerRef
  ) {}

  ngOnInit(): void {
    this.zone.runOutsideAngular(() => {
      this.globalClickListener = this.renderer.listen(
        this.document,
        'click',
        (event: Event) => {
          // Close flyout if clicking outside sidebar
          if (this.flyoutOverlayRef && this.openFlyoutItem) {
            const clickedInside = this.el.nativeElement.contains(event.target);
            // Also check if the click was *inside the overlay panel*
            const clickedInsideOverlay = this.flyoutOverlayRef?.overlayElement.contains(event.target as Node);
            
            if (!clickedInside && !clickedInsideOverlay) {
              this.zone.run(() => {
                this.closeFlyout();
              });
            }
          }

          // Existing logic for mobile menu flyout (if any)
          // This might need to be re-evaluated, but let's fix the desktop first
          const aFlyoutIsOpen =
            !this.isOpen && this.navItems.some((item) => !!item.isOpen);
          if (aFlyoutIsOpen && !this.openFlyoutItem) { // Only run if not handled by CDK
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

      // Always close flyouts and reset accordions when sidebar state changes
      this.closeFlyout();
      const isNowOpen = changes['isOpen'].currentValue;

      if (isNowOpen) {
        this.hideAllSubmenus(); // Resets visual state
        this.restoreAccordionState();
      } else {
        this.hideAllSubmenus();
      }
    }
  }

  ngOnDestroy(): void {
    if (this.globalClickListener) {
      this.globalClickListener();
    }
    this.closeFlyout(); // Clean up overlay ref
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
    const triggerElement = event.currentTarget as HTMLElement;

    if (this.isOpen) {
      // --- ACCORDION LOGIC (Sidebar Open) ---
      this.closeFlyout(); // Ensure no flyouts are open
      if (this.openAccordionItems.has(item)) {
        this.openAccordionItems.delete(item);
      } else {
        this.openAccordionItems.add(item);
      }
      item.isOpen = this.openAccordionItems.has(item);
    } else {
      // --- FLYOUT LOGIC (Sidebar Collapsed) ---
      if (this.openFlyoutItem === item) {
        // Clicked the same item, so close it
        this.closeFlyout();
      } else {
        // Clicked a new item, so open it (and close any previous)
        this.openFlyout(item, triggerElement);
      }
    }
  }

  private openFlyout(item: NavItem, trigger: HTMLElement): void {
    this.closeFlyout(); // Close any existing flyout

    // 1. Define the positioning
    const positionStrategy = this.overlay
      .position()
      .flexibleConnectedTo(trigger)
      .withPositions([
        {
          originX: 'end',
          originY: 'top',
          overlayX: 'start',
          overlayY: 'top',
          offsetX: 8, // 0.5rem
        } as ConnectedPosition,
      ]);

    // 2. Create the overlay
    this.flyoutOverlayRef = this.overlay.create({
      positionStrategy: positionStrategy,
      hasBackdrop: false, 
      scrollStrategy: this.overlay.scrollStrategies.reposition(), // Reposition on scroll
      panelClass: 'sidebar-flyout-panel', // Class for styling
    });

    // 3. Create and attach the portal
    const portal = new TemplatePortal(this.flyoutTemplate, this.viewContainerRef, {
      $implicit: item.children, // Pass children to the template
    });
    this.flyoutOverlayRef.attach(portal);

    // 4. Set state
    this.openFlyoutItem = item;
    item.isOpen = true; // Use isOpen to track visual state of the *trigger*
  }

  private closeFlyout(): void {
    if (this.flyoutOverlayRef) {
      this.flyoutOverlayRef.detach();
      this.flyoutOverlayRef.dispose();
      this.flyoutOverlayRef = null;
    }
    if (this.openFlyoutItem) {
      this.openFlyoutItem.isOpen = false;
      this.openFlyoutItem = null;
    }
  }

  // Helper to be called from the template when a link in the flyout is clicked
  onFlyoutLinkClick(): void {
    // This will bubble to the ul(click) and close
    this.closeFlyout();
  }
}