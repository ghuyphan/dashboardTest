import {
  Component,
  inject,
  signal,
  output,
  input,
  ViewEncapsulation,
  computed
} from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ToastService } from '../../core/services/toast.service';

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
  private datePipe = inject(DatePipe);
  private toastService = inject(ToastService);

  // INPUTS
  public isLoading = input<boolean>(false);
  public buttonLabel = input<string>('Xem Báo Cáo');
  public minDate = input<string>(''); 
  public maxDate = input<string>(''); // Optional strict max limit from parent

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

  // --- COMPUTED CONSTRAINTS ---
  private todayStr = new Date().toISOString().split('T')[0];

  // Effective Max: Use parent's maxDate if provided, otherwise default to Today
  public effectiveMax = computed(() => this.maxDate() || this.todayStr);

  // From Date Max: Cannot exceed To Date (if selected) AND cannot exceed Today
  public fromMax = computed(() => {
    const to = this.toDate();
    const max = this.effectiveMax();
    if (to && to < max) return to;
    return max;
  });

  // To Date Min: Cannot be less than From Date
  public toMin = computed(() => {
    const from = this.fromDate();
    const min = this.minDate();
    if (from && (!min || from > min)) return from;
    return min || '';
  });

  // To Date Max: Cannot exceed Today
  public toMax = computed(() => this.effectiveMax());

  constructor() {
    this.setRange('thisWeek', false);
  }

  onDateChange(type: 'from' | 'to', value: string) {
    // 1. Validate Future Dates
    if (value > this.effectiveMax()) {
      this.toastService.showWarning('Không thể chọn ngày trong tương lai.');
      // Reset to Today if user types a future date
      value = this.effectiveMax();
      
      // Force UI update if needed (usually value re-assignment handles it)
      if (type === 'from') this.fromDate.set(value);
      else this.toDate.set(value);
    }

    if (type === 'from') {
      this.fromDate.set(value);
      // Ensure From <= To
      if (this.toDate() && value > this.toDate()) {
        this.toDate.set(value);
      }
    } 
    else if (type === 'to') {
      this.toDate.set(value);
      // Ensure To >= From
      if (this.fromDate() && value < this.fromDate()) {
        this.fromDate.set(value);
      }
    }
    
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

    // Apply constraints to calculated range (e.g. clip future dates to Today)
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

  private applyConstraints(dateStr: string): string {
    if (!dateStr) return dateStr;
    
    const min = this.minDate();
    const max = this.effectiveMax(); // Uses Today if maxDate is not provided

    if (min && dateStr < min) return min;
    if (max && dateStr > max) return max;
    
    return dateStr;
  }
}