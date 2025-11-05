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

  private isFlyoutOpen = false;
  private globalClickListener!: () => void;

  constructor(
    @Inject(DOCUMENT) private document: Document,
    private el: ElementRef, // This is the host element (the <li>)
    private renderer: Renderer2,
    private zone: NgZone
  ) {}

  ngOnInit(): void {
    // We run this outside angular to avoid triggering change detection on every click
    this.zone.runOutsideAngular(() => {
      this.globalClickListener = this.renderer.listen(
        this.document,
        'click',
        (event: Event) => {
          // If the flyout is open and the click was *outside* the host <li>
          if (
            this.isFlyoutOpen &&
            !this.el.nativeElement.contains(event.target)
          ) {
            // Run back inside angular to update the class
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
  }

  // --- ADDED: HostListener for click ---
  @HostListener('click', ['$event'])
  onClick(event: Event) {
    // Only handle clicks if the flyout logic is enabled
    if (!this.flyoutEnabled) {
      return;
    }

    // Stop the click from doing anything else (like navigating)
    event.preventDefault();
    event.stopPropagation();

    // Toggle the flyout
    if (this.isFlyoutOpen) {
      this.closeFlyout();
    } else {
      // Note: This will also open on hover, but a click
      // should be a definitive "open" action.
      this.openFlyout();
    }
  }
  // --- END: ADDED ---

  @HostListener('mouseenter')
  onMouseEnter() {
    this.openFlyout();
  }

  @HostListener('mouseleave')
  onMouseLeave() {
    this.closeFlyout();
  }

  private openFlyout() {
    // Do nothing if not enabled, no menu is provided, or already open
    if (!this.flyoutEnabled || !this.flyoutMenu || this.isFlyoutOpen) {
      return;
    }
    this.isFlyoutOpen = true;
    this.renderer.addClass(this.flyoutMenu, 'open');
  }

  private closeFlyout() {
    if (!this.isFlyoutOpen) {
      return;
    }
    this.isFlyoutOpen = false;
    this.renderer.removeClass(this.flyoutMenu, 'open');
  }
}