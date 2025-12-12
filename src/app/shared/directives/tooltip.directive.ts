import {
  Directive,
  ElementRef,
  HostListener,
  Renderer2,
  OnDestroy,
  NgZone,
  input,
} from '@angular/core';

@Directive({
  selector: '[appTooltip]',
  standalone: true,
})
export class TooltipDirective implements OnDestroy {
  public tooltipText = input<string>('', { alias: 'appTooltip' });

  private tooltipElement: HTMLDivElement | null = null;
  private listeners: Array<() => void> = [];
  private readonly SHOW_DELAY = 300;
  private readonly HORIZONTAL_OFFSET = 8;
  private showTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private el: ElementRef<HTMLElement>,
    private renderer: Renderer2,
    private zone: NgZone
  ) {}

  @HostListener('mouseenter')
  onMouseEnter(): void {
    // Check signal value
    if (!this.tooltipText()?.trim() || this.tooltipElement) {
      return;
    }

    this.showTimer = setTimeout(() => {
      this.createTooltip();
    }, this.SHOW_DELAY);
  }

  @HostListener('mouseleave')
  onMouseLeave(): void {
    this.clearShowTimer();
    this.destroyTooltip();
  }

  @HostListener('click')
  onClick(): void {
    this.clearShowTimer();
    this.destroyTooltip();
  }

  ngOnDestroy(): void {
    this.clearShowTimer();
    this.destroyTooltip();
  }

  private createTooltip(): void {
    if (this.tooltipElement) {
      return;
    }

    this.tooltipElement = this.renderer.createElement('div');
    // Use signal value
    const text = this.tooltipText() || '';
    const shortcutRegex = /(.*?)\s*\(([^)]+)\)$/;
    const match = text.match(shortcutRegex);

    if (match) {
      const description = match[1];
      const shortcut = match[2];

      const textNode = this.renderer.createText(description);
      this.renderer.appendChild(this.tooltipElement, textNode);

      const shortcutSpan = this.renderer.createElement('span');
      const shortcutText = this.renderer.createText(shortcut);
      this.renderer.appendChild(shortcutSpan, shortcutText);
      this.renderer.addClass(shortcutSpan, 'tooltip-shortcut');
      this.renderer.appendChild(this.tooltipElement, shortcutSpan);
    } else {
      const textNode = this.renderer.createText(text);
      this.renderer.appendChild(this.tooltipElement, textNode);
    }

    this.renderer.addClass(this.tooltipElement, 'app-tooltip-container');

    this.renderer.appendChild(document.body, this.tooltipElement);

    this.updatePosition();

    requestAnimationFrame(() => {
      if (this.tooltipElement) {
        this.renderer.addClass(this.tooltipElement, 'show');
      }
    });

    this.registerGlobalListeners();
  }

  private updatePosition(): void {
    if (!this.tooltipElement) {
      return;
    }

    const hostRect = this.el.nativeElement.getBoundingClientRect();
    const tooltipRect = this.tooltipElement.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let top = hostRect.top + (hostRect.height - tooltipRect.height) / 2;
    let left = hostRect.right + this.HORIZONTAL_OFFSET;

    if (left + tooltipRect.width > viewportWidth - this.HORIZONTAL_OFFSET) {
      left = hostRect.left - tooltipRect.width - this.HORIZONTAL_OFFSET;
    }

    if (top < this.HORIZONTAL_OFFSET) {
      top = this.HORIZONTAL_OFFSET;
    } else if (
      top + tooltipRect.height >
      viewportHeight - this.HORIZONTAL_OFFSET
    ) {
      top = viewportHeight - tooltipRect.height - this.HORIZONTAL_OFFSET;
    }

    this.renderer.setStyle(this.tooltipElement, 'top', `${top}px`);
    this.renderer.setStyle(this.tooltipElement, 'left', `${left}px`);
  }

  private registerGlobalListeners(): void {
    this.zone.runOutsideAngular(() => {
      const scrollListener = this.renderer.listen(
        'window',
        'scroll',
        () => {
          this.zone.run(() => this.destroyTooltip());
        },
        { capture: true, passive: true }
      );

      const resizeListener = this.renderer.listen(
        'window',
        'resize',
        () => {
          this.zone.run(() => this.destroyTooltip());
        },
        { passive: true }
      );

      this.listeners.push(scrollListener, resizeListener);
    });
  }

  private destroyTooltip(): void {
    if (!this.tooltipElement) {
      return;
    }
    this.renderer.removeClass(this.tooltipElement, 'show');
    setTimeout(() => {
      if (this.tooltipElement) {
        this.renderer.removeChild(document.body, this.tooltipElement);
        this.tooltipElement = null;
      }
    }, 150);
    this.cleanupListeners();
  }

  private clearShowTimer(): void {
    if (this.showTimer) {
      clearTimeout(this.showTimer);
      this.showTimer = null;
    }
  }

  private cleanupListeners(): void {
    this.listeners.forEach(unsubscribe => unsubscribe());
    this.listeners = [];
  }
}
