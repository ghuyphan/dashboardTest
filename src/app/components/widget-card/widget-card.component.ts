import { Component, Input, ElementRef, ViewChild, OnChanges, AfterViewInit, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-widget-card',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './widget-card.component.html',
  styleUrl: './widget-card.component.scss'
})
export class WidgetCardComponent implements OnChanges, AfterViewInit {
  @Input() icon: string = 'fas fa-question-circle';
  @Input() title: string = 'Title';
  @Input() value: string = '0';
  @Input() caption: string = 'Caption';
  @Input() accentColor: string = '#64748B';
  @Input() isLoading: boolean = false; // New input for skeleton state

  @ViewChild('valueDisplay', { static: false }) valueDisplay!: ElementRef<HTMLDivElement>;

  private currentValue: number = 0;
  private viewInitialized = false;

  private originalFormat: 'number' | 'currency' | 'string' | 'percent' = 'number';
  private detectedCurrency: string = 'VND'; 

  ngAfterViewInit(): void {
    this.viewInitialized = true;
    // If data is already present on init, animate it immediately
    if (!this.isLoading) {
      this.updateValue(this.value, true);
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (!this.viewInitialized) return;

    // 1. Handle Loading State Transitions
    if (changes['isLoading']) {
      const prev = changes['isLoading'].previousValue;
      const curr = changes['isLoading'].currentValue;

      // If transition: Loading (true) -> Loaded (false)
      if (prev === true && curr === false) {
        // Wait a tick for *ngIf to switch templates, then animate
        setTimeout(() => {
          this.updateValue(this.value, true); // true = animate
        });
        return;
      }
    }

    // 2. Handle Value Changes (only if not currently loading)
    if (changes['value'] && !this.isLoading) {
      this.updateValue(changes['value'].currentValue, true);
    }
  }

  private updateValue(newValue: string, animate: boolean): void {
    // Safety check if element exists (it might not if we are still in skeleton mode)
    if (!this.valueDisplay?.nativeElement) return;

    // 1. Handle Percentage
    if (typeof newValue === 'string' && newValue.includes('%')) {
        this.originalFormat = 'percent';
        let cleanStr = newValue.replace(/[%]/g, '').trim().replace(/,/g, '.');
        const parsed = parseFloat(cleanStr);

        if (!isNaN(parsed)) {
             if (animate) {
                 this.animateValue(this.currentValue, parsed);
             } else {
                 this.currentValue = parsed;
                 this.updateDisplayNumber(parsed);
             }
        } else {
             this.updateDisplayString(newValue);
        }
        return; 
    }

    // 2. Handle Numbers / Currency
    const parsedNumber = this.parseValue(newValue);

    if (isNaN(parsedNumber)) {
      this.originalFormat = 'string';
      this.currentValue = 0;
      this.updateDisplayString(newValue);
    } else {
      this.detectFormat(newValue); // Helper to set currency/number format

      if (animate) {
        this.animateValue(this.currentValue, parsedNumber);
      } else {
        this.updateDisplayNumber(parsedNumber);
        this.currentValue = parsedNumber;
      }
    }
  }
  
  private detectFormat(newValue: string) {
    if (/[₫]|VND/.test(newValue)) {
      this.originalFormat = 'currency';
      this.detectedCurrency = 'VND';
    } else if (/\$/.test(newValue)) {
      this.originalFormat = 'currency';
      this.detectedCurrency = 'USD';
    } else if (/\€/.test(newValue)) {
      this.originalFormat = 'currency';
      this.detectedCurrency = 'EUR';
    } else {
      this.originalFormat = 'number';
      this.detectedCurrency = 'VND';
    }
  }

  private parseValue(val: string): number {
    const cleaned = (val?.replace(/[^0-9,.-]/g, '') || '0').replace(/[.,]/g, '').trim();
    if (/[^0-9]/.test(cleaned)) return NaN;
    return parseFloat(cleaned);
  }

  private animateValue(start: number, end: number): void {
    if (start === end) {
      this.updateDisplayNumber(end);
      this.currentValue = end;
      return;
    }

    const duration = 1000; // Slower animation looks better after skeleton
    const startTime = performance.now();
    const easeOutQuart = (t: number) => 1 - Math.pow(1 - t, 4);

    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const easedProgress = easeOutQuart(progress);
      
      let val = start + (end - start) * easedProgress;

      if (this.originalFormat !== 'percent') {
         val = Math.round(val);
      }

      this.updateDisplayNumber(val);

      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        this.currentValue = end;
        this.updateDisplayNumber(end);
      }
    };

    requestAnimationFrame(animate);
  }

  private updateDisplayNumber(value: number): void {
    if (!this.valueDisplay?.nativeElement) return;

    let formattedValue: string;

    if (this.originalFormat === 'currency') {
      formattedValue = new Intl.NumberFormat('vi-VN', {
        style: 'currency',
        currency: this.detectedCurrency, 
        maximumFractionDigits: 0, 
        minimumFractionDigits: 0,
      }).format(value);
    } else if (this.originalFormat === 'percent') {
      formattedValue = new Intl.NumberFormat('vi-VN', {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      }).format(value) + '%';
    } else {
      formattedValue = new Intl.NumberFormat('vi-VN').format(value);
    }
    
    this.valueDisplay.nativeElement.textContent = formattedValue;
  }

  private updateDisplayString(value: string): void {
    if (this.valueDisplay?.nativeElement) {
      this.valueDisplay.nativeElement.textContent = value;
    }
  }
}