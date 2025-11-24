import {
  Directive,
  ElementRef,
  Renderer2,
  HostListener,
  NgZone,
  Inject,
  OnDestroy,
  OnInit,
  input,
  output,
} from '@angular/core';
import { DOCUMENT } from '@angular/common';

@Directive({
  selector: '[appFlyout]',
  standalone: true,
})
export class FlyoutDirective implements OnInit, OnDestroy {
  public flyoutMenu = input<HTMLElement | null>(null, { alias: 'appFlyout' });
  public flyoutEnabled = input<boolean>(false);
  
  public flyoutToggled = output<boolean>();

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
    if (!this.flyoutEnabled()) {
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

  private registerGlobalClickListener(): void {
    this.zone.runOutsideAngular(() => {
      this.listeners.globalClick = this.renderer.listen(
        this.document,
        'click',
        (event: Event) => {
          if (this.isOpen() && !this.isClickInsideHostOrMenu(event)) {
            this.zone.run(() => {
              this.closeFlyout();
            });
          }
        }
      );
    });
  }

  private openFlyout(): void {
    this.closeOtherFlyouts();

    if (!this.canOpenFlyout()) {
      return;
    }

    this.saveOriginalPosition();

    const menuEl = this.flyoutMenu();
    if (menuEl) {
      this.renderer.appendChild(this.document.body, menuEl);
    }

    this.prepareMenuForPositioning();
    this.positionFlyout();

    if (menuEl) {
      this.renderer.removeStyle(menuEl, 'visibility');
    }

    this.flyoutToggled.emit(true);
    FlyoutDirective.activeFlyout = this;
    this.registerMenuClickListener();
  }

  private closeFlyout(): void {
    if (!this.isOpen()) {
      return;
    }

    if (this.listeners.menuClick) {
      this.listeners.menuClick();
      this.listeners.menuClick = undefined;
    }

    const menuEl = this.flyoutMenu();
    if (menuEl) {
      this.renderer.removeClass(menuEl, 'open');
    }

    this.restoreOriginalPosition();
    this.removePositioningStyles();
    this.clearOriginalPosition();
    this.flyoutToggled.emit(false);

    if (FlyoutDirective.activeFlyout === this) {
      FlyoutDirective.activeFlyout = null;
    }
  }

  private closeOtherFlyouts(): void {
    if (FlyoutDirective.activeFlyout && FlyoutDirective.activeFlyout !== this) {
      FlyoutDirective.activeFlyout.closeFlyout();
    }
  }

  private canOpenFlyout(): boolean {
    return this.flyoutEnabled() && this.flyoutMenu() !== null && !this.isOpen();
  }

  private isOpen(): boolean {
    return this.originalPosition.parent !== null;
  }

  private saveOriginalPosition(): void {
    const menuEl = this.flyoutMenu();
    if (menuEl) {
      this.originalPosition.parent = menuEl.parentNode;
      this.originalPosition.nextSibling = menuEl.nextSibling;
    }
  }

  private restoreOriginalPosition(): void {
    const menuEl = this.flyoutMenu();
    if (this.originalPosition.parent && menuEl) {
      this.renderer.insertBefore(
        this.originalPosition.parent,
        menuEl,
        this.originalPosition.nextSibling
      );
    }
  }

  private clearOriginalPosition(): void {
    this.originalPosition.parent = null;
    this.originalPosition.nextSibling = null;
  }

  private prepareMenuForPositioning(): void {
    const menuEl = this.flyoutMenu();
    if (menuEl) {
      this.renderer.setStyle(menuEl, 'position', 'fixed');
      this.renderer.setStyle(menuEl, 'visibility', 'hidden');
      this.renderer.addClass(menuEl, 'open');
    }
  }

  private positionFlyout(): void {
    const menuEl = this.flyoutMenu();
    if (!menuEl) {
      return;
    }

    const hostRect = this.el.nativeElement.getBoundingClientRect();
    const menuRect = menuEl.getBoundingClientRect();
    const viewportHeight = window.innerHeight;

    const top = this.calculateVerticalPosition(
      hostRect,
      menuRect,
      viewportHeight
    );
    const left = this.calculateHorizontalPosition();

    this.renderer.setStyle(menuEl, 'top', `${top}px`);
    this.renderer.setStyle(menuEl, 'left', `${left}px`);
  }

  private calculateVerticalPosition(
    hostRect: DOMRect,
    menuRect: DOMRect,
    viewportHeight: number
  ): number {
    let top = hostRect.top;
    const wouldOverflowBottom =
      top + menuRect.height > viewportHeight - this.VIEWPORT_PADDING;

    if (wouldOverflowBottom) {
      const topAlignedBottom = hostRect.bottom - menuRect.height;

      if (topAlignedBottom >= this.VIEWPORT_PADDING) {
        top = topAlignedBottom;
      } else {
        top = viewportHeight - menuRect.height - this.VIEWPORT_PADDING;
        if (top < this.VIEWPORT_PADDING) {
          top = this.VIEWPORT_PADDING;
        }
      }
    }
    return top;
  }

  private calculateHorizontalPosition(): number {
    const rootStyle = getComputedStyle(this.document.documentElement);
    const collapsedWidthValue = rootStyle.getPropertyValue(
      '--sidebar-width-collapsed'
    );
    const collapsedWidth = collapsedWidthValue
      ? parseFloat(collapsedWidthValue)
      : this.DEFAULT_SIDEBAR_WIDTH;

    return collapsedWidth + this.HORIZONTAL_OFFSET;
  }

  private removePositioningStyles(): void {
    const menuEl = this.flyoutMenu();
    if (menuEl) {
      const stylesToRemove = ['position', 'top', 'left', 'visibility'];
      stylesToRemove.forEach((style) => {
        this.renderer.removeStyle(menuEl, style);
      });
    }
  }

  private registerMenuClickListener(): void {
    const menuEl = this.flyoutMenu();
    if (menuEl) {
      this.zone.runOutsideAngular(() => {
        this.listeners.menuClick = this.renderer.listen(
          menuEl,
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
  }

  private isClickableElement(element: HTMLElement): boolean {
    return (
      element.tagName === 'A' ||
      element.tagName === 'BUTTON' ||
      element.closest('A') !== null ||
      element.closest('BUTTON') !== null
    );
  }

  private isClickInsideHostOrMenu(event: Event): boolean {
    const target = event.target as Node;
    const menuEl = this.flyoutMenu();
    return (
      this.el.nativeElement.contains(target) ||
      (menuEl && menuEl.contains(target)) ||
      false
    );
  }

  private cleanupListeners(): void {
    Object.values(this.listeners).forEach((listener) => {
      if (listener) {
        listener();
      }
    });
    this.listeners = {};
  }
}