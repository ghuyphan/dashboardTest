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
  // INPUTS: Received from Parent
  public isLoading = input<boolean>(false);
  public buttonLabel = input<string>('Xem Báo Cáo');

  // OUTPUTS: Sent to Parent
  public filterSubmit = output<DateRange>();

  // Internal Signals
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
    // Initialize default view state (UI only, parent handles initial data load usually)
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
        // start/end are already now
        break;
      case 'thisWeek':
        const day = now.getDay();
        const diff = now.getDate() - day + (day == 0 ? -6 : 1); // Adjust when day is Sunday
        start = new Date(now.setDate(diff));
        // End of week (Sunday)
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

    this.fromDate.set(this.formatDate(start));
    this.toDate.set(this.formatDate(end));

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
}