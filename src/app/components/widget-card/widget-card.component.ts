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
  @Input() accentColor: string = '#64748B'; // var(--gray-500)

  @ViewChild('valueDisplay', { static: false }) valueDisplay!: ElementRef<HTMLDivElement>;

  private currentValue: number = 0;
  private viewInitialized = false;

  // --- START OF MODIFICATION ---
  // Store the original format (number, currency, or string)
  private originalFormat: 'number' | 'currency' | 'string' = 'number';
  // Store the detected currency format
  private detectedCurrency: string = 'VND'; 
  // --- END OF MODIFICATION ---

  ngAfterViewInit(): void {
    this.viewInitialized = true;
    this.updateValue(this.value, false); // Pass initial value
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (!this.viewInitialized) return;

    if (changes['value']) {
      this.updateValue(changes['value'].currentValue, true); // Pass new value
    }
  }

  /**
   * Checks if the value is numeric or a string, and displays it
   * accordingly (animating numbers, displaying strings directly).
   */
  private updateValue(newValue: string, animate: boolean): void {
    const parsedNumber = this.parseValue(newValue);

    if (isNaN(parsedNumber)) {
      // --- A) VALUE IS A STRING (like "85,12%") ---
      this.originalFormat = 'string'; // Save format
      this.currentValue = 0; // Reset numeric tracker
      this.updateDisplayString(newValue);
      
    } else {
      // --- B) VALUE IS A NUMBER (like "1,250" or "1.250.000 ₫") ---
      
      // --- START OF MODIFICATION: Check for specific currency ---
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
        // Default to plain number
        this.originalFormat = 'number';
        this.detectedCurrency = 'VND'; // Default for formatting
      }
      // --- END OF MODIFICATION ---

      if (animate) {
        this.animateValue(this.currentValue, parsedNumber);
      } else {
        this.updateDisplayNumber(parsedNumber); // Use the new formatter
        this.currentValue = parsedNumber;
      }
    }
  }
  
  /**
   * Parses a string to see if it's a valid number.
   * Returns NaN if it contains non-numeric characters (like '%').
   */
  private parseValue(val: string): number {
    // This regex strips out all characters that are not digits or a decimal separator
    // It removes "₫", "$", "€", ".", ",", " ", etc.
    const cleaned = (val?.replace(/[^0-9,.-]/g, '') || '0')
                      .replace(/[.,]/g, '') // Remove thousand separators (both . and ,)
                      .trim();
    
    // Check if the original string (after light cleaning) still contains non-numeric chars (e.g., '%')
    // This handles the "85,12%" case
    if (/[^0-9]/.test(cleaned)) { 
      return NaN;
    }
    
    const num = parseFloat(cleaned);
    return num; // Will be NaN if parseFloat fails
  }

  /**
   * Animates from a start number to an end number.
   */
  private animateValue(start: number, end: number): void {
    if (start === end) {
      this.updateDisplayNumber(end);
      this.currentValue = end;
      return;
    }

    const duration = 800; // ms
    const startTime = performance.now();
    const easeOutQuart = (t: number) => 1 - Math.pow(1 - t, 4);

    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const easedProgress = easeOutQuart(progress);
      const val = Math.round(start + (end - start) * easedProgress);

      this.updateDisplayNumber(val); // Use the new formatter

      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        this.currentValue = end;
        this.updateDisplayNumber(end); // Ensure final value is accurate
      }
    };

    requestAnimationFrame(animate);
  }

  /**
   * Updates the display with a formatted NUMBER.
   */
  private updateDisplayNumber(value: number): void {
    if (this.valueDisplay?.nativeElement) {
      let formattedValue: string;

      // --- START OF MODIFICATION ---
      // Format based on the original type detected
      if (this.originalFormat === 'currency') {
        // Use the detected currency
        formattedValue = new Intl.NumberFormat('vi-VN', {
          style: 'currency',
          currency: this.detectedCurrency, 
          maximumFractionDigits: 0, 
          minimumFractionDigits: 0,
        }).format(value);
      } else {
        // Default to plain number formatting
        formattedValue = new Intl.NumberFormat('vi-VN').format(value);
      }
      // --- END OF MODIFICATION ---
      
      this.valueDisplay.nativeElement.textContent = formattedValue;
    }
  }

  /**
   * Updates the display with a raw STRING (e.g., "85,12%").
   */
  private updateDisplayString(value: string): void {
    if (this.valueDisplay?.nativeElement) {
      this.valueDisplay.nativeElement.textContent = value;
    }
  }
}