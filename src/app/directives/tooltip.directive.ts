import {
  Directive,
  Input,
  ElementRef,
  HostListener,
  Renderer2,
  OnDestroy,
} from '@angular/core';

@Directive({
  selector: '[appTooltip]',
  standalone: true,
})
export class TooltipDirective implements OnDestroy {
  @Input('appTooltip') tooltipText: string = '';
  private tooltipElement: HTMLDivElement | null = null;
  private scrollListener: (() => void) | null = null;
  private resizeListener: (() => void) | null = null;

  constructor(private el: ElementRef, private renderer: Renderer2) {}

  @HostListener('mouseenter')
  onMouseEnter() {
    if (!this.tooltipText || this.tooltipElement) {
      return;
    }
    this.createTooltip();
  }

  @HostListener('mouseleave')
  onMouseLeave() {
    this.destroyTooltip();
  }

  /**
   * Fix 1: Close tooltip immediately on click.
   * This prevents it from getting stuck if the click triggers
   * navigation or a modal (which might stop mouseleave from firing).
   */
  @HostListener('click')
  onClick() {
    this.destroyTooltip();
  }

  ngOnDestroy() {
    this.destroyTooltip();
  }

  private createTooltip() {
    // 1. Create the element
    this.tooltipElement = this.renderer.createElement('div');
    this.renderer.appendChild(
      this.tooltipElement,
      this.renderer.createText(this.tooltipText)
    );
    this.renderer.addClass(this.tooltipElement, 'app-tooltip-container');

    // 2. Append to body to avoid overflow issues
    this.renderer.appendChild(document.body, this.tooltipElement);

    // 3. Position it
    this.updatePosition();
    this.renderer.addClass(this.tooltipElement, 'show');

    // Fix 2: Listen to global scroll and resize events to hide tooltip
    // capturing these events ensures we clear the tooltip if the user scrolls away
    this.scrollListener = this.renderer.listen('window', 'scroll', () => this.destroyTooltip());
    this.resizeListener = this.renderer.listen('window', 'resize', () => this.destroyTooltip());
  }

  private updatePosition() {
    if (!this.tooltipElement) return;

    const hostPos = this.el.nativeElement.getBoundingClientRect();
    const tooltipPos = this.tooltipElement.getBoundingClientRect();

    // Position to the right of the element
    const top = hostPos.top + (hostPos.height - tooltipPos.height) / 2;
    const left = hostPos.right + 8; // 8px offset

    this.renderer.setStyle(this.tooltipElement, 'top', `${top}px`);
    this.renderer.setStyle(this.tooltipElement, 'left', `${left}px`);
  }

  private destroyTooltip() {
    if (this.tooltipElement) {
      this.renderer.removeClass(this.tooltipElement, 'show');
      this.renderer.removeChild(document.body, this.tooltipElement);
      this.tooltipElement = null;
    }

    // Clean up global listeners
    if (this.scrollListener) {
      this.scrollListener();
      this.scrollListener = null;
    }
    if (this.resizeListener) {
      this.resizeListener();
      this.resizeListener = null;
    }
  }
}