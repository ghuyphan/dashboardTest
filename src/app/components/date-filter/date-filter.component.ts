/* src/app/components/date-filter/date-filter.component.ts */
import {
  Component,
  inject,
  signal,
  output,
  input,
  ViewEncapsulation,
  computed,
  OnInit
} from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ToastService } from '../../core/services/toast.service';
import { DateUtils } from '../../shared/utils/date.utils';

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
export class DateFilterComponent implements OnInit {
  private datePipe = inject(DatePipe);
  private toastService = inject(ToastService);

  // INPUTS
  public isLoading = input<boolean>(false);
  public buttonLabel = input<string>('Xem Báo Cáo');
  
  // Allow configuring the default range (Default: 'thisWeek')
  public defaultRange = input<QuickRange>('thisWeek');

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

  private readonly todayStr = new Date().toISOString().split('T')[0];

  public effectiveMax = computed(() => {
    return this.maxDate() ? this.maxDate() : this.todayStr;
  });

  public fromMax = computed(() => {
    const to = this.toDate();
    const max = this.effectiveMax();
    if (to && to < max) return to;
    return max;
  });

  public toMin = computed(() => {
    const from = this.fromDate();
    const min = this.minDate();
    if (from && (!min || from > min)) return from;
    return min || '';
  });

  public toMax = computed(() => this.effectiveMax());

  constructor() {
    // Constructor logic moved to ngOnInit to respect inputs
  }

  ngOnInit(): void {
    // Initialize with the provided default range
    this.setRange(this.defaultRange(), false);
  }

  onDateChange(type: 'from' | 'to', value: string) {
    if (value > this.effectiveMax()) {
      this.toastService.showWarning('Ngày chọn không được vượt quá hôm nay (hoặc giới hạn cho phép).');
      value = this.effectiveMax();
      
      if (type === 'from') this.fromDate.set(value);
      else this.toDate.set(value);
    }

    if (type === 'from') {
      this.fromDate.set(value);
      if (this.toDate() && value > this.toDate()) {
        this.toDate.set(value);
      }
    } 
    else if (type === 'to') {
      this.toDate.set(value);
      if (this.fromDate() && value < this.fromDate()) {
        this.fromDate.set(value);
      }
    }
    
    this.activeRange.set('custom');
  }

  setRange(range: QuickRange, emit: boolean = false) {
    this.activeRange.set(range);
    const now = new Date();
    
    let startStr = '';
    let endStr = '';

    switch (range) {
      case 'today':
        startStr = endStr = this.todayStr;
        break;

      case 'thisWeek':
        const weekRange = DateUtils.getReportingWeekRange();
        startStr = weekRange.fromDate;
        endStr = weekRange.toDate;
        break;
        
      case 'thisMonth':
        const mStart = new Date(now.getFullYear(), now.getMonth(), 1);
        const mEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        startStr = this.formatDate(mStart);
        endStr = this.formatDate(mEnd);
        break;

      case 'thisQuarter':
        const qMonth = Math.floor(now.getMonth() / 3) * 3;
        const qStart = new Date(now.getFullYear(), qMonth, 1);
        const qEnd = new Date(now.getFullYear(), qMonth + 3, 0);
        startStr = this.formatDate(qStart);
        endStr = this.formatDate(qEnd);
        break;

      case 'thisYear':
        const yStart = new Date(now.getFullYear(), 0, 1);
        const yEnd = new Date(now.getFullYear(), 11, 31);
        startStr = this.formatDate(yStart);
        endStr = this.formatDate(yEnd);
        break;
    }

    const finalStart = this.applyConstraints(startStr);
    const finalEnd = this.applyConstraints(endStr);

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
    const max = this.effectiveMax();

    if (min && dateStr < min) return min;
    if (max && dateStr > max) return max;
    
    return dateStr;
  }
}