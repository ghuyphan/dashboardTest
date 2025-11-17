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

@Directive({
  selector: '[appFlyout]',
  standalone: true,
})
export class FlyoutDirective implements OnInit, OnDestroy {
  /**
   * The <ul> submenu element to show/hide.
   */
  @Input('appFlyout') flyoutMenu: HTMLElement | null = null;
  /**
   * Enables or disables the flyout logic.
   * (e.g., true when sidebar is collapsed, false when open)
   */
  @Input() flyoutEnabled: boolean = false;

  /**
   * Emits the open (true) or closed (false) state.
   */
  @Output() flyoutToggled = new EventEmitter<boolean>();

  private globalClickListener!: () => void;
  private menuClickListener!: () => void;

  private originalParent: Node | null = null;
  private nextSibling: Node | null = null;

  /**
   * Tracks the currently open flyout directive instance.
   */
  private static activeFlyout: FlyoutDirective | null = null;

  constructor(
    @Inject(DOCUMENT) private document: Document,
    private el: ElementRef, // This is the host element (the <button>)
    private renderer: Renderer2,
    private zone: NgZone
  ) {}

  ngOnInit(): void {
    this.zone.runOutsideAngular(() => {
      // This listener handles clicks OUTSIDE the menu
      this.globalClickListener = this.renderer.listen(
        this.document,
        'click',
        (event: Event) => {
          if (
            this.originalParent &&
            !this.el.nativeElement.contains(event.target) &&
            !this.flyoutMenu?.contains(event.target as Node)
          ) {
            this.zone.run(() => {
              this.closeFlyout();
            });
          }
        }
      );
    });
  }

  ngOnDestroy(): void {
    if (this.globalClickListener) {
      this.globalClickListener();
    }
    this.closeFlyout();
  }

  @HostListener('click', ['$event'])
  onClick(event: Event) {
    if (!this.flyoutEnabled) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();

    if (this.originalParent) {
      this.closeFlyout();
    } else {
      this.openFlyout();
    }
  }

  private openFlyout() {
    // If another flyout is open, close it first.
    if (
      FlyoutDirective.activeFlyout &&
      FlyoutDirective.activeFlyout !== this
    ) {
      FlyoutDirective.activeFlyout.closeFlyout();
    }

    if (!this.flyoutEnabled || !this.flyoutMenu || this.originalParent) {
      return;
    }

    // 1. Save original location
    this.originalParent = this.flyoutMenu.parentNode;
    this.nextSibling = this.flyoutMenu.nextSibling;

    // 2. Append to body so it can float above everything
    this.renderer.appendChild(this.document.body, this.flyoutMenu);

    // 3. Set initial styles to measure dimensions (hidden)
    this.renderer.setStyle(this.flyoutMenu, 'position', 'fixed');
    this.renderer.setStyle(this.flyoutMenu, 'visibility', 'hidden');
    this.renderer.addClass(this.flyoutMenu, 'open');

    // 4. Measure positions
    const hostPos = this.el.nativeElement.getBoundingClientRect();
    const menuRect = this.flyoutMenu.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    
    // 5. Calculate Top Position (Collision Detection)
    let top = hostPos.top;
    const bottomPadding = 10; // Space from bottom edge

    // If the menu extends past the bottom of the screen...
    if (top + menuRect.height > viewportHeight - bottomPadding) {
      // Shift it up so the bottom of the menu sits at the bottom safe area
      top = viewportHeight - menuRect.height - bottomPadding;
      
      // Optional: Ensure it doesn't go off the top edge
      if (top < bottomPadding) {
        top = bottomPadding;
      }
    }

    // 6. Calculate Left Position
    const offset = 8; // 8px (0.5rem) gap
    const rootStyle = getComputedStyle(this.document.documentElement);
    const collapsedWidthVal = rootStyle.getPropertyValue('--sidebar-width-collapsed');
    // Fallback to 60 if variable is missing or parse fails
    const collapsedWidth = collapsedWidthVal ? parseFloat(collapsedWidthVal) : 60;
    const left = collapsedWidth + offset;

    // 7. Apply Final Coordinates and Show
    this.renderer.setStyle(this.flyoutMenu, 'top', `${top}px`);
    this.renderer.setStyle(this.flyoutMenu, 'left', `${left}px`);
    this.renderer.removeStyle(this.flyoutMenu, 'visibility');

    this.flyoutToggled.emit(true);
    FlyoutDirective.activeFlyout = this;

    // 8. Add listener for inner clicks
    this.zone.runOutsideAngular(() => {
      this.menuClickListener = this.renderer.listen(
        this.flyoutMenu as HTMLElement,
        'click',
        (event: Event) => {
          const target = event.target as HTMLElement;
          if (
            target.tagName === 'A' ||
            target.tagName === 'BUTTON' ||
            target.closest('A') ||
            target.closest('BUTTON')
          ) {
            this.zone.run(() => {
              this.closeFlyout();
            });
          }
        }
      );
    });
  }

  private closeFlyout() {
    if (!this.originalParent || !this.flyoutMenu) {
      return;
    }

    if (this.menuClickListener) {
      this.menuClickListener();
      (this.menuClickListener as any) = null;
    }

    // 1. Remove visibility class
    this.renderer.removeClass(this.flyoutMenu, 'open');

    // 2. Put the menu back where it came from
    this.renderer.insertBefore(
      this.originalParent,
      this.flyoutMenu,
      this.nextSibling
    );

    // 3. Clean up styles
    this.renderer.removeStyle(this.flyoutMenu, 'position');
    this.renderer.removeStyle(this.flyoutMenu, 'top');
    this.renderer.removeStyle(this.flyoutMenu, 'left');
    this.renderer.removeStyle(this.flyoutMenu, 'visibility'); // Ensure visibility reset

    // 4. Clear state
    this.originalParent = null;
    this.nextSibling = null;
    this.flyoutToggled.emit(false);

    if (FlyoutDirective.activeFlyout === this) {
      FlyoutDirective.activeFlyout = null;
    }
  }
}