import { Component, Input, ElementRef, ViewChild, OnChanges, AfterViewInit } from '@angular/core';
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
    const initial = this.parseValue(this.value);
    this.currentValue = initial;
    this.updateDisplay(initial);
  }

  ngOnChanges(): void {
    // Skip animation until the view is ready
    if (!this.viewInitialized) return;

    const newValue = this.parseValue(this.value);
    this.animateValue(this.currentValue, newValue);
  }

  private parseValue(val: string): number {
    // Handle formatted strings like "1,250" or plain numbers
    const cleaned = (val?.replace(/,/g, '') || '0').trim();
    const num = parseFloat(cleaned);
    return isNaN(num) ? 0 : num;
  }

  private animateValue(start: number, end: number): void {
    if (start === end) {
      this.updateDisplay(end);
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

      this.updateDisplay(val);

      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        this.currentValue = end;
      }
    };

    requestAnimationFrame(animate);
  }

  private updateDisplay(value: number): void {
    if (this.valueDisplay?.nativeElement) {
      this.valueDisplay.nativeElement.textContent = value.toLocaleString();
    }
  }
}