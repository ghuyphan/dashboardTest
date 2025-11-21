import {
  Directive,
  Input,
  ElementRef,
  HostListener,
  Renderer2,
  OnDestroy,
  NgZone,
} from '@angular/core';

/**
 * Tooltip Directive
 * 
 * Displays a tooltip on hover that's positioned to the right of the host element.
 * Automatically handles cleanup on scroll, resize, click, and navigation events.
 * 
 * @example
 * <button [appTooltip]="'Click to save'">Save</button>
 */
@Directive({
  selector: '[appTooltip]',
  standalone: true,
})
export class TooltipDirective implements OnDestroy {
  /** The text content to display in the tooltip */
  @Input('appTooltip') tooltipText: string = '';

  /** The tooltip DOM element */
  private tooltipElement: HTMLDivElement | null = null;

  /** Event listener cleanup functions */
  private listeners: Array<(() => void)> = [];

  /** Delay before showing tooltip (in milliseconds) */
  private readonly SHOW_DELAY = 300;

  /** Horizontal offset from the host element (in pixels) */
  private readonly HORIZONTAL_OFFSET = 8;

  /** Timer for delayed tooltip display */
  private showTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private el: ElementRef<HTMLElement>,
    private renderer: Renderer2,
    private zone: NgZone
  ) {}

  @HostListener('mouseenter')
  onMouseEnter(): void {
    if (!this.tooltipText?.trim() || this.tooltipElement) {
      return;
    }

    // Add slight delay to prevent tooltips from flashing during quick hovers
    this.showTimer = setTimeout(() => {
      this.createTooltip();
    }, this.SHOW_DELAY);
  }

  @HostListener('mouseleave')
  onMouseLeave(): void {
    this.clearShowTimer();
    this.destroyTooltip();
  }

  /**
   * Close tooltip on click to prevent it from getting stuck
   * when navigation or modals are triggered
   */
  @HostListener('click')
  onClick(): void {
    this.clearShowTimer();
    this.destroyTooltip();
  }

  ngOnDestroy(): void {
    this.clearShowTimer();
    this.destroyTooltip();
  }

  /**
   * Creates and displays the tooltip element
   */
  private createTooltip(): void {
    if (this.tooltipElement) {
      return;
    }

    // Create tooltip element
    this.tooltipElement = this.renderer.createElement('div');
    const textNode = this.renderer.createText(this.tooltipText);
    this.renderer.appendChild(this.tooltipElement, textNode);
    this.renderer.addClass(this.tooltipElement, 'app-tooltip-container');

    // Append to body to avoid overflow/z-index issues
    this.renderer.appendChild(document.body, this.tooltipElement);

    // Position and show
    this.updatePosition();
    
    // Use requestAnimationFrame to ensure positioning is complete before showing
    requestAnimationFrame(() => {
      if (this.tooltipElement) {
        this.renderer.addClass(this.tooltipElement, 'show');
      }
    });

    // Register global event listeners outside Angular zone for better performance
    this.registerGlobalListeners();
  }

  /**
   * Updates the tooltip position relative to the host element
   */
  private updatePosition(): void {
    if (!this.tooltipElement) {
      return;
    }

    const hostRect = this.el.nativeElement.getBoundingClientRect();
    const tooltipRect = this.tooltipElement.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    // Calculate vertical position (centered relative to host)
    let top = hostRect.top + (hostRect.height - tooltipRect.height) / 2;

    // Calculate horizontal position (to the right of host)
    let left = hostRect.right + this.HORIZONTAL_OFFSET;

    // Boundary detection: if tooltip overflows viewport right edge, show on left
    if (left + tooltipRect.width > viewportWidth - this.HORIZONTAL_OFFSET) {
      left = hostRect.left - tooltipRect.width - this.HORIZONTAL_OFFSET;
    }

    // Vertical boundary detection: keep within viewport
    if (top < this.HORIZONTAL_OFFSET) {
      top = this.HORIZONTAL_OFFSET;
    } else if (top + tooltipRect.height > viewportHeight - this.HORIZONTAL_OFFSET) {
      top = viewportHeight - tooltipRect.height - this.HORIZONTAL_OFFSET;
    }

    // Apply calculated position
    this.renderer.setStyle(this.tooltipElement, 'top', `${top}px`);
    this.renderer.setStyle(this.tooltipElement, 'left', `${left}px`);
  }

  /**
   * Registers global event listeners to auto-hide tooltip
   */
  private registerGlobalListeners(): void {
    // Run outside Angular zone to avoid triggering change detection
    this.zone.runOutsideAngular(() => {
      // Hide on scroll (any scrollable element)
      const scrollListener = this.renderer.listen('window', 'scroll', () => {
        this.zone.run(() => this.destroyTooltip());
      }, { capture: true, passive: true });

      // Hide on resize
      const resizeListener = this.renderer.listen('window', 'resize', () => {
        this.zone.run(() => this.destroyTooltip());
      }, { passive: true });

      this.listeners.push(scrollListener, resizeListener);
    });
  }

  /**
   * Removes the tooltip from the DOM and cleans up listeners
   */
  private destroyTooltip(): void {
    if (!this.tooltipElement) {
      return;
    }

    // Remove show class for fade-out animation
    this.renderer.removeClass(this.tooltipElement, 'show');

    // Wait for animation to complete before removing from DOM
    setTimeout(() => {
      if (this.tooltipElement) {
        this.renderer.removeChild(document.body, this.tooltipElement);
        this.tooltipElement = null;
      }
    }, 150); // Match CSS transition duration

    // Clean up all event listeners
    this.cleanupListeners();
  }

  /**
   * Clears the show timer if it exists
   */
  private clearShowTimer(): void {
    if (this.showTimer) {
      clearTimeout(this.showTimer);
      this.showTimer = null;
    }
  }

  /**
   * Removes all registered event listeners
   */
  private cleanupListeners(): void {
    this.listeners.forEach(unsubscribe => unsubscribe());
    this.listeners = [];
  }
}