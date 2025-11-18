import {
  Component,
  Input,
  ElementRef,
  ViewChild,
  OnChanges,
  AfterViewInit,
  SimpleChanges,
  ChangeDetectionStrategy,
} from '@angular/core';
import { CommonModule } from '@angular/common';

/**
 * Value format types supported by the widget
 */
type ValueFormat = 'number' | 'currency' | 'string' | 'percent';

/**
 * Supported currency codes
 */
type CurrencyCode = 'VND' | 'USD' | 'EUR';

/**
 * Widget Card Component
 * 
 * Displays a metric card with:
 * - Icon, title, value, and caption
 * - Animated value transitions with easing
 * - Automatic format detection (number, currency, percentage)
 * - Loading state with skeleton UI
 * - Customizable accent color
 * 
 * @example
 * <app-widget-card
 *   [icon]="'fas fa-dollar-sign'"
 *   [title]="'Revenue'"
 *   [value]="'1,234,567₫'"
 *   [caption]="'This month'"
 *   [accentColor]="'#00839B'"
 *   [isLoading]="loading">
 * </app-widget-card>
 */
@Component({
  selector: 'app-widget-card',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './widget-card.component.html',
  styleUrl: './widget-card.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WidgetCardComponent implements OnChanges, AfterViewInit {
  // ===================================
  // Inputs
  // ===================================

  /** FontAwesome icon class */
  @Input() icon: string = 'fas fa-question-circle';

  /** Widget title/label */
  @Input() title: string = 'Title';

  /** Display value (supports numbers, currency, percentages) */
  @Input() value: string = '0';

  /** Subtitle/description text */
  @Input() caption: string = 'Caption';

  /** Accent color for icon background */
  @Input() accentColor: string = '#64748B';

  /** Shows skeleton loader when true */
  @Input() isLoading: boolean = false;

  // ===================================
  // View References
  // ===================================

  @ViewChild('valueDisplay', { static: false })
  valueDisplay!: ElementRef<HTMLDivElement>;

  // ===================================
  // Internal State
  // ===================================

  /** Current numeric value for animation tracking */
  private currentValue: number = 0;

  /** Tracks if view has been initialized */
  private hasViewInitialized = false;

  /** Detected format of the input value */
  private valueFormat: ValueFormat = 'number';

  /** Detected currency code for formatting */
  private currencyCode: CurrencyCode = 'VND';

  /** Animation frame ID for cleanup */
  private animationFrameId?: number;

  // ===================================
  // Constants
  // ===================================

  /** Animation duration in milliseconds */
  private readonly ANIMATION_DURATION_MS = 1000;

  /** Delay before starting animation after loading completes */
  private readonly ANIMATION_DELAY_MS = 0;

  /** Locale for number formatting */
  private readonly LOCALE = 'vi-VN';

  // ===================================
  // Lifecycle Hooks
  // ===================================

  ngAfterViewInit(): void {
    this.hasViewInitialized = true;

    // Animate initial value if data is already loaded
    if (!this.isLoading) {
      this.processValue(this.value, true);
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (!this.hasViewInitialized) {
      return;
    }

    // Handle loading state transitions
    if (changes['isLoading']) {
      this.handleLoadingStateChange(changes['isLoading']);
      return;
    }

    // Handle value changes when not loading
    if (changes['value'] && !this.isLoading) {
      this.processValue(changes['value'].currentValue, true);
    }
  }

  // ===================================
  // Loading State Management
  // ===================================

  /**
   * Handles transitions between loading and loaded states
   */
  private handleLoadingStateChange(change: any): void {
    const wasLoading = change.previousValue === true;
    const isNowLoaded = change.currentValue === false;

    if (wasLoading && isNowLoaded) {
      // Wait for template to render before animating
      setTimeout(() => {
        this.processValue(this.value, true);
      }, this.ANIMATION_DELAY_MS);
    }
  }

  // ===================================
  // Value Processing
  // ===================================

  /**
   * Main entry point for value processing
   * Detects format and updates display with optional animation
   */
  private processValue(newValue: string, shouldAnimate: boolean): void {
    if (!this.isElementAvailable()) {
      return;
    }

    // Handle percentage values
    if (this.isPercentageValue(newValue)) {
      this.processPercentageValue(newValue, shouldAnimate);
      return;
    }

    // Handle numeric and currency values
    this.processNumericValue(newValue, shouldAnimate);
  }

  /**
   * Processes percentage values (e.g., "45.5%")
   */
  private processPercentageValue(value: string, shouldAnimate: boolean): void {
    this.valueFormat = 'percent';

    const cleanValue = value.replace(/[%]/g, '').trim().replace(/,/g, '.');
    const parsedValue = parseFloat(cleanValue);

    if (!isNaN(parsedValue)) {
      if (shouldAnimate) {
        this.animate(this.currentValue, parsedValue);
      } else {
        this.currentValue = parsedValue;
        this.renderNumericValue(parsedValue);
      }
    } else {
      this.renderStringValue(value);
    }
  }

  /**
   * Processes numeric and currency values
   */
  private processNumericValue(value: string, shouldAnimate: boolean): void {
    const parsedValue = this.parseNumericValue(value);

    if (isNaN(parsedValue)) {
      this.handleStringValue(value);
    } else {
      this.handleNumericValue(value, parsedValue, shouldAnimate);
    }
  }

  /**
   * Handles non-numeric string values
   */
  private handleStringValue(value: string): void {
    this.valueFormat = 'string';
    this.currentValue = 0;
    this.renderStringValue(value);
  }

  /**
   * Handles valid numeric values with animation
   */
  private handleNumericValue(
    rawValue: string,
    parsedValue: number,
    shouldAnimate: boolean
  ): void {
    this.detectValueFormat(rawValue);

    if (shouldAnimate) {
      this.animate(this.currentValue, parsedValue);
    } else {
      this.currentValue = parsedValue;
      this.renderNumericValue(parsedValue);
    }
  }

  // ===================================
  // Format Detection
  // ===================================

  /**
   * Checks if value is a percentage
   */
  private isPercentageValue(value: string): boolean {
    return typeof value === 'string' && value.includes('%');
  }

  /**
   * Detects if value is currency or plain number
   */
  private detectValueFormat(value: string): void {
    if (/[₫]|VND/.test(value)) {
      this.valueFormat = 'currency';
      this.currencyCode = 'VND';
    } else if (/\$/.test(value)) {
      this.valueFormat = 'currency';
      this.currencyCode = 'USD';
    } else if (/€/.test(value)) {
      this.valueFormat = 'currency';
      this.currencyCode = 'EUR';
    } else {
      this.valueFormat = 'number';
    }
  }

  /**
   * Parses string value to number, removing formatting characters
   */
  private parseNumericValue(value: string): number {
    const cleaned = (value?.replace(/[^0-9,.-]/g, '') || '0')
      .replace(/[.,]/g, '')
      .trim();

    // Check if contains non-numeric characters
    if (/[^0-9-]/.test(cleaned)) {
      return NaN;
    }

    return parseFloat(cleaned);
  }

  // ===================================
  // Animation
  // ===================================

  /**
   * Animates value transition from start to end with easing
   */
  private animate(start: number, end: number): void {
    // Cancel any existing animation
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
    }

    // No animation needed if values are the same
    if (start === end) {
      this.currentValue = end;
      this.renderNumericValue(end);
      return;
    }

    const startTime = performance.now();

    const animationStep = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / this.ANIMATION_DURATION_MS, 1);
      const easedProgress = this.easeOutQuart(progress);

      let interpolatedValue = start + (end - start) * easedProgress;

      // Round non-percentage values to whole numbers
      if (this.valueFormat !== 'percent') {
        interpolatedValue = Math.round(interpolatedValue);
      }

      this.renderNumericValue(interpolatedValue);

      if (progress < 1) {
        this.animationFrameId = requestAnimationFrame(animationStep);
      } else {
        this.currentValue = end;
        this.renderNumericValue(end);
        this.animationFrameId = undefined;
      }
    };

    this.animationFrameId = requestAnimationFrame(animationStep);
  }

  /**
   * Easing function for smooth animation
   * @param t Progress value between 0 and 1
   * @returns Eased value between 0 and 1
   */
  private easeOutQuart(t: number): number {
    return 1 - Math.pow(1 - t, 4);
  }

  // ===================================
  // Rendering
  // ===================================

  /**
   * Renders numeric value with appropriate formatting
   */
  private renderNumericValue(value: number): void {
    if (!this.isElementAvailable()) {
      return;
    }

    const formattedValue = this.formatNumericValue(value);
    this.valueDisplay.nativeElement.textContent = formattedValue;
  }

  /**
   * Formats numeric value based on detected format
   */
  private formatNumericValue(value: number): string {
    switch (this.valueFormat) {
      case 'currency':
        return this.formatCurrency(value);

      case 'percent':
        return this.formatPercent(value);

      case 'number':
      default:
        return this.formatNumber(value);
    }
  }

  /**
   * Formats value as currency
   */
  private formatCurrency(value: number): string {
    return new Intl.NumberFormat(this.LOCALE, {
      style: 'currency',
      currency: this.currencyCode,
      maximumFractionDigits: 0,
      minimumFractionDigits: 0,
    }).format(value);
  }

  /**
   * Formats value as percentage
   */
  private formatPercent(value: number): string {
    const formatted = new Intl.NumberFormat(this.LOCALE, {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    }).format(value);

    return `${formatted}%`;
  }

  /**
   * Formats value as plain number
   */
  private formatNumber(value: number): string {
    return new Intl.NumberFormat(this.LOCALE).format(value);
  }

  /**
   * Renders string value without formatting
   */
  private renderStringValue(value: string): void {
    if (this.isElementAvailable()) {
      this.valueDisplay.nativeElement.textContent = value;
    }
  }

  // ===================================
  // Utilities
  // ===================================

  /**
   * Checks if the value display element is available
   */
  private isElementAvailable(): boolean {
    return !!(this.valueDisplay?.nativeElement);
  }

  /**
   * Cleanup method to cancel ongoing animations
   */
  ngOnDestroy(): void {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
    }
  }
}