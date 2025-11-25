import {
  Component,
  ElementRef,
  AfterViewInit,
  ChangeDetectionStrategy,
  input,
  effect,
  computed,
  OnDestroy,
  inject,
  NgZone,
  viewChild
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ThemeService, ThemePalette } from '../../core/services/theme.service';

type ValueFormat = 'number' | 'currency' | 'string' | 'percent';
type CurrencyCode = 'VND' | 'USD' | 'EUR';

@Component({
  selector: 'app-widget-card',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './widget-card.component.html',
  styleUrl: './widget-card.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WidgetCardComponent implements AfterViewInit, OnDestroy {
  private ngZone = inject(NgZone);
  private themeService = inject(ThemeService);

  // Inputs
  public icon = input<string>('fas fa-question-circle');
  public title = input.required<string>();
  public value = input<string>('0');
  public caption = input<string>('Caption');
  public isLoading = input<boolean>(false);
  
  public enableAnimation = input<boolean>(true);

  public accentColor = input<string>('primary');

  public resolvedAccentColor = computed(() => {
    const rawInput = this.accentColor();
    const palette = this.themeService.currentPalette(); 
    
    if (rawInput in palette) {
      return palette[rawInput as keyof ThemePalette];
    }
    return rawInput;
  });

  public iconWrapperStyle = computed(() => ({
    'background-color': this.resolvedAccentColor() + '33'
  }));
  
  public iconStyle = computed(() => ({
    'color': this.resolvedAccentColor()
  }));

  public valueDisplay = viewChild.required<ElementRef<HTMLDivElement>>('valueDisplay');

  private currentValue: number = 0;
  private hasViewInitialized = false;
  private valueFormat: ValueFormat = 'number';
  private currencyCode: CurrencyCode = 'VND';
  private animationFrameId?: number;
  private readonly ANIMATION_DURATION_MS = 1000;
  private readonly LOCALE = 'vi-VN';

  constructor() {
    effect(() => {
      const val = this.value();
      if (this.hasViewInitialized) {
        this.processValue(val, true);
      }
    });
  }

  ngAfterViewInit(): void {
    this.hasViewInitialized = true;
    this.processValue(this.value(), false);
  }

  private processValue(newValue: string, shouldAnimate: boolean): void {
    if (!this.isElementAvailable()) return;

    if (this.isPercentageValue(newValue)) {
      this.processPercentageValue(newValue, shouldAnimate);
    } else {
      this.processNumericValue(newValue, shouldAnimate);
    }
  }

  private processPercentageValue(value: string, shouldAnimate: boolean): void {
    this.valueFormat = 'percent';
    // Basic cleanup for percentages, assuming standard dot decimal for now or localized
    const cleanValue = value.replace(/[%]/g, '').trim().replace(/,/g, '.');
    const parsedValue = parseFloat(cleanValue);

    if (!isNaN(parsedValue)) {
      shouldAnimate ? this.animate(this.currentValue, parsedValue) : this.renderNumericValue(parsedValue);
    } else {
      this.renderStringValue(value);
    }
  }

  private processNumericValue(value: string, shouldAnimate: boolean): void {
    const parsedValue = this.parseNumericValue(value);
    if (isNaN(parsedValue)) {
      this.handleStringValue(value);
    } else {
      this.handleNumericValue(value, parsedValue, shouldAnimate);
    }
  }

  private handleStringValue(value: string): void {
    this.valueFormat = 'string';
    this.currentValue = 0;
    this.renderStringValue(value);
  }

  private handleNumericValue(rawValue: string, parsedValue: number, shouldAnimate: boolean): void {
    this.detectValueFormat(rawValue);
    if (shouldAnimate) {
      this.animate(this.currentValue, parsedValue);
    } else {
      this.currentValue = parsedValue;
      this.renderNumericValue(parsedValue);
    }
  }

  private isPercentageValue(value: string): boolean {
    return typeof value === 'string' && value.includes('%');
  }

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

  private parseNumericValue(value: string): number {
    if (!value) return 0;

    // 1. Remove any character that is NOT a digit, dot, comma, or minus sign
    let cleaned = value.replace(/[^0-9,.-]/g, '');

    // 2. Heuristic to determine if it's 1.000,00 (Euro/Vietnamese) or 1,000.00 (Standard)
    const lastComma = cleaned.lastIndexOf(',');
    const lastDot = cleaned.lastIndexOf('.');

    if (lastComma > lastDot) {
      // Assume format: 1.234,56 -> Convert to 1234.56
      // Remove all dots (thousands), replace comma with dot
      cleaned = cleaned.replace(/\./g, '').replace(/,/g, '.');
    } else {
      // Assume format: 1,234.56 -> Convert to 1234.56
      // Remove all commas (thousands)
      cleaned = cleaned.replace(/,/g, '');
    }

    const parsed = parseFloat(cleaned);
    return isNaN(parsed) ? NaN : parsed;
  }

  private animate(start: number, end: number): void {
    if (this.animationFrameId) cancelAnimationFrame(this.animationFrameId);
    
    const prefersReducedMotion = typeof window !== 'undefined' && 
        window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (start === end || !this.enableAnimation() || prefersReducedMotion) {
      this.currentValue = end;
      this.renderNumericValue(end);
      return;
    }

    this.ngZone.runOutsideAngular(() => {
      const startTime = performance.now();
      const animationStep = (currentTime: number) => {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / this.ANIMATION_DURATION_MS, 1);
        const easedProgress = 1 - Math.pow(1 - progress, 4); 
        
        let interpolatedValue = start + (end - start) * easedProgress;
        
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
    });
  }

  private renderNumericValue(value: number): void {
    const el = this.valueDisplay()?.nativeElement;
    if (!el) return;
    el.textContent = this.formatNumericValue(value);
  }

  private formatNumericValue(value: number): string {
    switch (this.valueFormat) {
      case 'currency':
        return new Intl.NumberFormat(this.LOCALE, {
          style: 'currency', currency: this.currencyCode, maximumFractionDigits: 0, minimumFractionDigits: 0
        }).format(value);
      case 'percent':
        return `${new Intl.NumberFormat(this.LOCALE, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(value)}%`;
      default:
        return new Intl.NumberFormat(this.LOCALE).format(value);
    }
  }

  private renderStringValue(value: string): void {
    const el = this.valueDisplay()?.nativeElement;
    if (el) el.textContent = value;
  }

  private isElementAvailable(): boolean {
    return !!(this.valueDisplay()?.nativeElement);
  }

  ngOnDestroy(): void {
    if (this.animationFrameId) cancelAnimationFrame(this.animationFrameId);
  }
}