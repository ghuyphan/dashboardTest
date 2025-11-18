import {
  Directive,
  Input,
  ElementRef,
  Renderer2,
  HostListener,
  NgZone,
  Inject,
  OnDestroy,
  OnInit,
  Output,
  EventEmitter,
} from '@angular/core';
import { DOCUMENT } from '@angular/common';

/**
 * Flyout Directive
 * 
 * Creates a floating menu that appears next to a collapsed sidebar item.
 * When enabled, clicking the host element positions the menu as a fixed overlay.
 * Handles collision detection, auto-closing on outside clicks, and proper cleanup.
 * 
 * @example
 * <button [appFlyout]="submenuElement" [flyoutEnabled]="isSidebarCollapsed">
 *   Menu Item
 * </button>
 */
@Directive({
  selector: '[appFlyout]',
  standalone: true,
})
export class FlyoutDirective implements OnInit, OnDestroy {
  /** The submenu element (typically a <ul>) to show/hide as a flyout */
  @Input('appFlyout') flyoutMenu: HTMLElement | null = null;

  /** 
   * Enables or disables the flyout behavior
   * Set to true when sidebar is collapsed, false when expanded
   */
  @Input() flyoutEnabled: boolean = false;

  /** Emits when the flyout opens (true) or closes (false) */
  @Output() flyoutToggled = new EventEmitter<boolean>();

  /** Event listener cleanup functions */
  private listeners: {
    globalClick?: () => void;
    menuClick?: () => void;
  } = {};

  /** Original DOM position to restore when closing */
  private originalPosition: {
    parent: Node | null;
    nextSibling: Node | null;
  } = {
    parent: null,
    nextSibling: null,
  };

  /** Tracks the currently open flyout to ensure only one is active */
  private static activeFlyout: FlyoutDirective | null = null;

  /** Spacing constants */
  private readonly VIEWPORT_PADDING = 10;
  private readonly HORIZONTAL_OFFSET = 8;
  private readonly DEFAULT_SIDEBAR_WIDTH = 60;

  constructor(
    @Inject(DOCUMENT) private document: Document,
    private el: ElementRef<HTMLElement>,
    private renderer: Renderer2,
    private zone: NgZone
  ) {}

  ngOnInit(): void {
    this.registerGlobalClickListener();
  }

  ngOnDestroy(): void {
    this.cleanupListeners();
    this.closeFlyout();
  }

  @HostListener('click', ['$event'])
  onClick(event: Event): void {
    if (!this.flyoutEnabled) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    // Toggle: close if already open, open if closed
    if (this.isOpen()) {
      this.closeFlyout();
    } else {
      this.openFlyout();
    }
  }

  /**
   * Registers a global click listener to close the flyout when clicking outside
   */
  private registerGlobalClickListener(): void {
    this.zone.runOutsideAngular(() => {
      this.listeners.globalClick = this.renderer.listen(
        this.document,
        'click',
        (event: Event) => {
          // Only close if flyout is open and click is outside both host and menu
          if (
            this.isOpen() &&
            !this.isClickInsideHostOrMenu(event)
          ) {
            this.zone.run(() => {
              this.closeFlyout();
            });
          }
        }
      );
    });
  }

  /**
   * Opens the flyout menu with proper positioning
   */
  private openFlyout(): void {
    // Close any other active flyout first
    this.closeOtherFlyouts();

    // Validation checks
    if (!this.canOpenFlyout()) {
      return;
    }

    // Save original DOM position for restoration later
    this.saveOriginalPosition();

    // Move menu to body for proper z-index layering
    this.renderer.appendChild(this.document.body, this.flyoutMenu);

    // Prepare menu for measurement (hidden but rendered)
    this.prepareMenuForPositioning();

    // Calculate and apply position
    this.positionFlyout();

    // Show the menu
    this.renderer.removeStyle(this.flyoutMenu!, 'visibility');

    // Update state and register menu click listener
    this.flyoutToggled.emit(true);
    FlyoutDirective.activeFlyout = this;
    this.registerMenuClickListener();
  }

  /**
   * Closes the flyout menu and restores original DOM position
   */
  private closeFlyout(): void {
    if (!this.isOpen()) {
      return;
    }

    // Remove menu click listener
    if (this.listeners.menuClick) {
      this.listeners.menuClick();
      this.listeners.menuClick = undefined;
    }

    // Remove open styling
    this.renderer.removeClass(this.flyoutMenu!, 'open');

    // Restore original DOM position
    this.restoreOriginalPosition();

    // Clean up positioning styles
    this.removePositioningStyles();

    // Clear state
    this.clearOriginalPosition();
    this.flyoutToggled.emit(false);

    if (FlyoutDirective.activeFlyout === this) {
      FlyoutDirective.activeFlyout = null;
    }
  }

  /**
   * Closes any other active flyout instance
   */
  private closeOtherFlyouts(): void {
    if (FlyoutDirective.activeFlyout && FlyoutDirective.activeFlyout !== this) {
      FlyoutDirective.activeFlyout.closeFlyout();
    }
  }

  /**
   * Validates if the flyout can be opened
   */
  private canOpenFlyout(): boolean {
    return this.flyoutEnabled && 
           this.flyoutMenu !== null && 
           !this.isOpen();
  }

  /**
   * Checks if the flyout is currently open
   */
  private isOpen(): boolean {
    return this.originalPosition.parent !== null;
  }

  /**
   * Saves the menu's original DOM position for later restoration
   */
  private saveOriginalPosition(): void {
    this.originalPosition.parent = this.flyoutMenu!.parentNode;
    this.originalPosition.nextSibling = this.flyoutMenu!.nextSibling;
  }

  /**
   * Restores the menu to its original DOM position
   */
  private restoreOriginalPosition(): void {
    if (this.originalPosition.parent && this.flyoutMenu) {
      this.renderer.insertBefore(
        this.originalPosition.parent,
        this.flyoutMenu,
        this.originalPosition.nextSibling
      );
    }
  }

  /**
   * Clears the saved original position data
   */
  private clearOriginalPosition(): void {
    this.originalPosition.parent = null;
    this.originalPosition.nextSibling = null;
  }

  /**
   * Prepares the menu for positioning by making it fixed but hidden
   */
  private prepareMenuForPositioning(): void {
    this.renderer.setStyle(this.flyoutMenu, 'position', 'fixed');
    this.renderer.setStyle(this.flyoutMenu, 'visibility', 'hidden');
    this.renderer.addClass(this.flyoutMenu, 'open');
  }

  /**
   * Calculates and applies the optimal position for the flyout menu
   */
  private positionFlyout(): void {
    const hostRect = this.el.nativeElement.getBoundingClientRect();
    const menuRect = this.flyoutMenu!.getBoundingClientRect();
    const viewportHeight = window.innerHeight;

    const top = this.calculateVerticalPosition(hostRect, menuRect, viewportHeight);
    const left = this.calculateHorizontalPosition();

    this.renderer.setStyle(this.flyoutMenu, 'top', `${top}px`);
    this.renderer.setStyle(this.flyoutMenu, 'left', `${left}px`);
  }

  /**
   * Calculates the vertical position with collision detection
   */
  private calculateVerticalPosition(
    hostRect: DOMRect,
    menuRect: DOMRect,
    viewportHeight: number
  ): number {
    let top = hostRect.top;

    // Check if menu would overflow bottom of viewport
    const wouldOverflowBottom = top + menuRect.height > viewportHeight - this.VIEWPORT_PADDING;

    if (wouldOverflowBottom) {
      // Try aligning bottom-to-bottom (menu grows upward from button)
      const topAlignedBottom = hostRect.bottom - menuRect.height;

      if (topAlignedBottom >= this.VIEWPORT_PADDING) {
        // Fits when aligned upward
        top = topAlignedBottom;
      } else {
        // Doesn't fit either way, pin to bottom of viewport
        top = viewportHeight - menuRect.height - this.VIEWPORT_PADDING;

        // If menu is taller than viewport, pin to top instead
        if (top < this.VIEWPORT_PADDING) {
          top = this.VIEWPORT_PADDING;
        }
      }
    }

    return top;
  }

  /**
   * Calculates the horizontal position based on sidebar width
   */
  private calculateHorizontalPosition(): number {
    const rootStyle = getComputedStyle(this.document.documentElement);
    const collapsedWidthValue = rootStyle.getPropertyValue('--sidebar-width-collapsed');
    const collapsedWidth = collapsedWidthValue 
      ? parseFloat(collapsedWidthValue) 
      : this.DEFAULT_SIDEBAR_WIDTH;

    return collapsedWidth + this.HORIZONTAL_OFFSET;
  }

  /**
   * Removes all positioning-related inline styles
   */
  private removePositioningStyles(): void {
    const stylesToRemove = ['position', 'top', 'left', 'visibility'];
    stylesToRemove.forEach(style => {
      this.renderer.removeStyle(this.flyoutMenu!, style);
    });
  }

  /**
   * Registers click listener on menu items to close flyout when selecting an item
   */
  private registerMenuClickListener(): void {
    this.zone.runOutsideAngular(() => {
      this.listeners.menuClick = this.renderer.listen(
        this.flyoutMenu as HTMLElement,
        'click',
        (event: Event) => {
          if (this.isClickableElement(event.target as HTMLElement)) {
            this.zone.run(() => {
              this.closeFlyout();
            });
          }
        }
      );
    });
  }

  /**
   * Checks if the clicked element is a clickable item (link or button)
   */
  private isClickableElement(element: HTMLElement): boolean {
    return (
      element.tagName === 'A' ||
      element.tagName === 'BUTTON' ||
      element.closest('A') !== null ||
      element.closest('BUTTON') !== null
    );
  }

  /**
   * Checks if the click event occurred inside the host element or flyout menu
   */
  private isClickInsideHostOrMenu(event: Event): boolean {
    const target = event.target as Node;
    return (
      this.el.nativeElement.contains(target) ||
      this.flyoutMenu?.contains(target) ||
      false
    );
  }

  /**
   * Cleans up all registered event listeners
   */
  private cleanupListeners(): void {
    Object.values(this.listeners).forEach(listener => {
      if (listener) {
        listener();
      }
    });
    this.listeners = {};
  }
}