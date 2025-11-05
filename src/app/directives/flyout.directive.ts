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

  private originalParent: Node | null = null;
  private nextSibling: Node | null = null;

  /**
   * Tracks the currently open flyout directive instance.
   */
  private static activeFlyout: FlyoutDirective | null = null; // <-- ADDED

  constructor(
    @Inject(DOCUMENT) private document: Document,
    private el: ElementRef, // This is the host element (the <li>)
    private renderer: Renderer2,
    private zone: NgZone
  ) {}

  ngOnInit(): void {
    this.zone.runOutsideAngular(() => {
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
    // Ensure this flyout is closed and deregistered if destroyed
    this.closeFlyout(); // <-- This will also handle clearing the static ref
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
    // --- ADDED BLOCK: Close other flyouts ---
    // If another flyout is open, close it first.
    if (
      FlyoutDirective.activeFlyout &&
      FlyoutDirective.activeFlyout !== this
    ) {
      FlyoutDirective.activeFlyout.closeFlyout();
    }
    // --- END ADDED BLOCK ---

    if (!this.flyoutEnabled || !this.flyoutMenu || this.originalParent) {
      return;
    }

    // 1. Save original location
    this.originalParent = this.flyoutMenu.parentNode;
    this.nextSibling = this.flyoutMenu.nextSibling;

    // 2. Append to body
    this.renderer.appendChild(this.document.body, this.flyoutMenu);

    // 3. Position it
    const hostPos = this.el.nativeElement.getBoundingClientRect();
    const offset = 8; // 8px (0.5rem) gap, as per old CSS
    const top = hostPos.top;
    const left = hostPos.right + offset;

    this.renderer.setStyle(this.flyoutMenu, 'position', 'fixed');
    this.renderer.setStyle(this.flyoutMenu, 'top', `${top}px`);
    this.renderer.setStyle(this.flyoutMenu, 'left', `${left}px`);

    this.renderer.addClass(this.flyoutMenu, 'open');
    this.flyoutToggled.emit(true);

    FlyoutDirective.activeFlyout = this; // <-- ADDED: Set this as the active flyout
  }

  private closeFlyout() {
    if (!this.originalParent || !this.flyoutMenu) {
      return;
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

    // 4. Clear state
    this.originalParent = null;
    this.nextSibling = null;
    this.flyoutToggled.emit(false);

    // --- ADDED BLOCK: Clear static reference ---
    if (FlyoutDirective.activeFlyout === this) {
      FlyoutDirective.activeFlyout = null;
    }
    // --- END ADDED BLOCK ---
  }
}