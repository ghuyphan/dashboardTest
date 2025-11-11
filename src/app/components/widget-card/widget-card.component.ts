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

  // --- START OF MODIFICATION ---
  /**
   * Checks if the value is numeric or a string, and displays it
   * accordingly (animating numbers, displaying strings directly).
   */
  private updateValue(newValue: string, animate: boolean): void {
    const parsedNumber = this.parseValue(newValue);

    if (isNaN(parsedNumber)) {
      // --- A) VALUE IS A STRING (like "85,12%") ---
      // Stop any previous animation and display the string directly.
      this.currentValue = 0; // Reset numeric tracker
      this.updateDisplayString(newValue);
      
    } else {
      // --- B) VALUE IS A NUMBER (like "1,250") ---
      if (animate) {
        this.animateValue(this.currentValue, parsedNumber);
      } else {
        this.updateDisplayNumber(parsedNumber);
        this.currentValue = parsedNumber;
      }
    }
  }
  
  /**
   * Parses a string to see if it's a valid number.
   * Returns NaN if it contains non-numeric characters (like '%').
   */
  private parseValue(val: string): number {
    // Remove thousand separators (commas)
    const cleaned = (val?.replace(/,/g, '') || '0').trim();

    // --- NEW CHECK ---
    // Check if the cleaned string still contains non-numeric chars (e.g., '%')
    if (/[^0-9.-]/.test(cleaned)) {
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

      this.updateDisplayNumber(val);

      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        this.currentValue = end;
      }
    };

    requestAnimationFrame(animate);
  }

  /**
   * Updates the display with a formatted NUMBER.
   */
  private updateDisplayNumber(value: number): void {
    if (this.valueDisplay?.nativeElement) {
      // Use 'vi-VN' locale for correct comma/dot separators
      this.valueDisplay.nativeElement.textContent = value.toLocaleString('vi-VN');
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
  // --- END OF MODIFICATION ---
}