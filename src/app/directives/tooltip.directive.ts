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
    const hostPos = this.el.nativeElement.getBoundingClientRect();
    const tooltipPos = this.tooltipElement!.getBoundingClientRect();

    // Position to the right of the element
    const top = hostPos.top + (hostPos.height - tooltipPos.height) / 2;
    const left = hostPos.right + 8; // 8px offset

    this.renderer.setStyle(this.tooltipElement, 'top', `${top}px`);
    this.renderer.setStyle(this.tooltipElement, 'left', `${left}px`);
    this.renderer.addClass(this.tooltipElement, 'show');
  }

  private destroyTooltip() {
    if (this.tooltipElement) {
      this.renderer.removeClass(this.tooltipElement, 'show');
      this.renderer.removeChild(document.body, this.tooltipElement);
      this.tooltipElement = null;
    }
  }
}