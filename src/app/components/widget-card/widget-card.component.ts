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

  @ViewChild('valueDisplay', { static: false }) valueDisplay!: ElementRef<HTMLDivElement>;

  private currentValue: number = 0;
  private viewInitialized = false;

  // Added 'percent' to supported formats
  private originalFormat: 'number' | 'currency' | 'string' | 'percent' = 'number';
  private detectedCurrency: string = 'VND'; 

  ngAfterViewInit(): void {
    this.viewInitialized = true;
    this.updateValue(this.value, false);
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (!this.viewInitialized) return;

    if (changes['value']) {
      this.updateValue(changes['value'].currentValue, true);
    }
  }

  private updateValue(newValue: string, animate: boolean): void {
    // 1. Handle Percentage specifically
    if (typeof newValue === 'string' && newValue.includes('%')) {
        this.originalFormat = 'percent';
        
        // Parse "89,96%" -> 89.96 (Remove %, replace comma with dot)
        let cleanStr = newValue.replace(/[%]/g, '').trim();
        cleanStr = cleanStr.replace(/,/g, '.'); 
        
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
        return; // Exit early for percentages
    }

    // 2. Handle Standard Numbers / Currency (Existing Logic)
    const parsedNumber = this.parseValue(newValue);

    if (isNaN(parsedNumber)) {
      this.originalFormat = 'string';
      this.currentValue = 0;
      this.updateDisplayString(newValue);
      
    } else {
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

      if (animate) {
        this.animateValue(this.currentValue, parsedNumber);
      } else {
        this.updateDisplayNumber(parsedNumber);
        this.currentValue = parsedNumber;
      }
    }
  }
  
  private parseValue(val: string): number {
    // This aggressively removes punctuation for integers/currency
    const cleaned = (val?.replace(/[^0-9,.-]/g, '') || '0')
                      .replace(/[.,]/g, '')
                      .trim();
    
    if (/[^0-9]/.test(cleaned)) { 
      return NaN;
    }
    
    const num = parseFloat(cleaned);
    return num;
  }

  private animateValue(start: number, end: number): void {
    if (start === end) {
      this.updateDisplayNumber(end);
      this.currentValue = end;
      return;
    }

    const duration = 800;
    const startTime = performance.now();
    const easeOutQuart = (t: number) => 1 - Math.pow(1 - t, 4);

    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const easedProgress = easeOutQuart(progress);
      
      let val = start + (end - start) * easedProgress;

      // Only round if NOT a percentage. Percentages need decimals (e.g. 45.52%)
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

    setTimeout(() => {
      requestAnimationFrame(animate);
    }, 300);
  }

  private updateDisplayNumber(value: number): void {
    if (this.valueDisplay?.nativeElement) {
      let formattedValue: string;

      if (this.originalFormat === 'currency') {
        formattedValue = new Intl.NumberFormat('vi-VN', {
          style: 'currency',
          currency: this.detectedCurrency, 
          maximumFractionDigits: 0, 
          minimumFractionDigits: 0,
        }).format(value);
      } else if (this.originalFormat === 'percent') {
        // Format percentage: 2 decimal places + % symbol
        formattedValue = new Intl.NumberFormat('vi-VN', {
          minimumFractionDigits: 1,
          maximumFractionDigits: 1,
        }).format(value) + '%';
      } else {
        formattedValue = new Intl.NumberFormat('vi-VN').format(value);
      }
      
      this.valueDisplay.nativeElement.textContent = formattedValue;
    }
  }

  private updateDisplayString(value: string): void {
    if (this.valueDisplay?.nativeElement) {
      this.valueDisplay.nativeElement.textContent = value;
    }
  }
}