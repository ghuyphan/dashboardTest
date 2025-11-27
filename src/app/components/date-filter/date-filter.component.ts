import {
  Component,
  inject,
  signal,
  output,
  input,
  ViewEncapsulation
} from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';

export interface DateRange {
  fromDate: string;
  toDate: string;
}

export type QuickRange = 'today' | 'thisWeek' | 'thisMonth' | 'thisQuarter' | 'thisYear' | 'custom';

@Component({
  selector: 'app-date-filter',
  standalone: true,
  imports: [CommonModule, FormsModule],
  providers: [DatePipe],
  templateUrl: './date-filter.component.html',
  styleUrl: './date-filter.component.scss',
  encapsulation: ViewEncapsulation.Emulated
})
export class DateFilterComponent {
  // INPUTS
  public isLoading = input<boolean>(false);
  public buttonLabel = input<string>('Xem Báo Cáo');
  public minDate = input<string>(''); 
  public maxDate = input<string>('');

  // OUTPUTS
  public filterSubmit = output<DateRange>();

  // SIGNALS
  public fromDate = signal<string>('');
  public toDate = signal<string>('');
  public activeRange = signal<QuickRange>('thisWeek');

  public quickRanges: { key: QuickRange, label: string }[] = [
    { key: 'today', label: 'Hôm nay' },
    { key: 'thisWeek', label: 'Tuần này' },
    { key: 'thisMonth', label: 'Tháng này' },
    { key: 'thisQuarter', label: 'Quý này' },
    { key: 'thisYear', label: 'Năm nay' },
  ];

  private datePipe = inject(DatePipe);

  constructor() {
    this.setRange('thisWeek', false);
  }

  onDateChange(type: 'from' | 'to', value: string) {
    if (type === 'from') this.fromDate.set(value);
    if (type === 'to') this.toDate.set(value);
    this.activeRange.set('custom');
  }

  setRange(range: QuickRange, emit: boolean = false) {
    this.activeRange.set(range);
    const now = new Date();
    let start = new Date();
    let end = new Date();

    switch (range) {
      case 'today':
        // start/end are now
        break;
      case 'thisWeek':
        const day = now.getDay();
        const diff = now.getDate() - day + (day == 0 ? -6 : 1);
        start = new Date(now.setDate(diff));
        const lastDay = start.getDate() + 6;
        end = new Date(now.setDate(lastDay));
        break;
      case 'thisMonth':
        start = new Date(now.getFullYear(), now.getMonth(), 1);
        end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        break;
      case 'thisQuarter':
        const qMonth = Math.floor(now.getMonth() / 3) * 3;
        start = new Date(now.getFullYear(), qMonth, 1);
        end = new Date(now.getFullYear(), qMonth + 3, 0);
        break;
      case 'thisYear':
        start = new Date(now.getFullYear(), 0, 1);
        end = new Date(now.getFullYear(), 11, 31);
        break;
    }

    // [FIX] Apply constraints to calculated dates
    const finalStart = this.applyConstraints(this.formatDate(start));
    const finalEnd = this.applyConstraints(this.formatDate(end));

    this.fromDate.set(finalStart);
    this.toDate.set(finalEnd);

    if (emit) {
      this.applyFilter();
    }
  }

  applyFilter() {
    this.filterSubmit.emit({
      fromDate: this.fromDate(),
      toDate: this.toDate()
    });
  }

  private formatDate(date: Date): string {
    return this.datePipe.transform(date, 'yyyy-MM-dd') || '';
  }

  /**
   * Clamps a date string between minDate and maxDate
   */
  private applyConstraints(dateStr: string): string {
    if (!dateStr) return dateStr;
    
    const min = this.minDate();
    const max = this.maxDate();

    if (min && dateStr < min) return min;
    if (max && dateStr > max) return max;
    
    return dateStr;
  }
}