import {
  Component,
  inject,
  signal,
  output,
  input,
  ViewEncapsulation,
  computed,
  OnInit,
  OnDestroy
} from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule, MAT_DATE_LOCALE, provideNativeDateAdapter } from '@angular/material/core';
import { BreakpointObserver, Breakpoints } from '@angular/cdk/layout'; // [IMPORT]
import { Subject, takeUntil } from 'rxjs'; // [IMPORT]
import { ToastService } from '../../../core/services/toast.service';
import { DateUtils } from '../../utils/date.utils';

export interface DateRange {
  fromDate: string;
  toDate: string;
}

export type QuickRange = 'today' | 'thisWeek' | 'thisMonth' | 'thisQuarter' | 'thisYear' | 'custom';

@Component({
  selector: 'app-date-filter',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatDatepickerModule,
    MatNativeDateModule
  ],
  providers: [
    DatePipe,
    provideNativeDateAdapter(),
    { provide: MAT_DATE_LOCALE, useValue: 'vi-VN' }
  ],
  templateUrl: './date-filter.component.html',
  styleUrl: './date-filter.component.scss',
  encapsulation: ViewEncapsulation.Emulated
})
export class DateFilterComponent implements OnInit, OnDestroy {
  private datePipe = inject(DatePipe);
  private toastService = inject(ToastService);
  private breakpointObserver = inject(BreakpointObserver); // [INJECT]
  private destroy$ = new Subject<void>();

  // INPUTS
  public isLoading = input<boolean>(false);
  public buttonLabel = input<string>('Xem Báo Cáo');
  public defaultRange = input<QuickRange>('thisWeek');
  public minDate = input<string>('');
  public maxDate = input<string>('');

  // OUTPUTS
  public filterSubmit = output<DateRange>();

  // SIGNALS
  public fromDate = signal<string>('');
  public toDate = signal<string>('');
  public activeRange = signal<QuickRange>('thisWeek');

  // [NEW] Signal to track if we are on mobile
  public isMobile = signal<boolean>(false);

  public quickRanges: { key: QuickRange, label: string }[] = [
    { key: 'today', label: 'Hôm nay' },
    { key: 'thisWeek', label: 'Tuần này' },
    { key: 'thisMonth', label: 'Tháng này' },
    { key: 'thisQuarter', label: 'Quý này' },
    { key: 'thisYear', label: 'Năm nay' },
  ];

  private readonly todayStr = new Date().toISOString().split('T')[0];

  public effectiveMax = computed(() => this.maxDate() ? this.maxDate() : this.todayStr);

  public fromMax = computed(() => {
    const to = this.toDate();
    const max = this.effectiveMax();
    return (to && to < max) ? to : max;
  });

  public toMin = computed(() => {
    const from = this.fromDate();
    const min = this.minDate();
    return (from && (!min || from > min)) ? from : (min || '');
  });

  public toMax = computed(() => this.effectiveMax());

  // --- Date Object Helpers for Material Datepicker ---
  public fromDateObj = computed(() => this.parseDateString(this.fromDate()));
  public toDateObj = computed(() => this.parseDateString(this.toDate()));
  public fromMaxDate = computed(() => this.parseDateString(this.fromMax()));
  public toMinDate = computed(() => this.parseDateString(this.toMin()));
  public toMaxDate = computed(() => this.parseDateString(this.toMax()));

  constructor() {
    // [LOGIC] Detect Mobile Screen
    this.breakpointObserver.observe([
      Breakpoints.Handset,
      Breakpoints.TabletPortrait
    ]).pipe(takeUntil(this.destroy$))
      .subscribe(result => {
        this.isMobile.set(result.matches);
      });
  }

  ngOnInit(): void {
    this.setRange(this.defaultRange(), false);
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // --- Parsing & Formatting Logic ---
  private parseDateString(dateStr: string): Date | null {
    if (!dateStr) return null;
    const parts = dateStr.split('-');
    if (parts.length !== 3) return null;
    return new Date(+parts[0], +parts[1] - 1, +parts[2]);
  }

  private formatDateString(date: Date): string {
    return this.datePipe.transform(date, 'yyyy-MM-dd') || '';
  }

  onDateChange(type: 'from' | 'to', dateValue: Date | null) {
    if (!dateValue) return;
    let value = this.formatDateString(dateValue);

    if (value > this.effectiveMax()) {
      this.toastService.showWarning('Ngày chọn không được vượt quá hôm nay.');
      value = this.effectiveMax();
    }

    if (type === 'from') {
      this.fromDate.set(value);
      if (this.toDate() && value > this.toDate()) this.toDate.set(value);
    } else {
      this.toDate.set(value);
      if (this.fromDate() && value < this.fromDate()) this.fromDate.set(value);
    }
    this.activeRange.set('custom');
  }

  setRange(range: QuickRange, emit: boolean = false) {
    this.activeRange.set(range);
    const now = new Date();
    let startStr = '', endStr = '';

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
        startStr = this.formatDate(new Date(now.getFullYear(), now.getMonth(), 1));
        endStr = this.formatDate(new Date(now.getFullYear(), now.getMonth() + 1, 0));
        break;
      case 'thisQuarter':
        const qMonth = Math.floor(now.getMonth() / 3) * 3;
        startStr = this.formatDate(new Date(now.getFullYear(), qMonth, 1));
        endStr = this.formatDate(new Date(now.getFullYear(), qMonth + 3, 0));
        break;
      case 'thisYear':
        startStr = this.formatDate(new Date(now.getFullYear(), 0, 1));
        endStr = this.formatDate(new Date(now.getFullYear(), 11, 31));
        break;
    }

    this.fromDate.set(this.applyConstraints(startStr));
    this.toDate.set(this.applyConstraints(endStr));

    if (emit) this.applyFilter();
  }

  applyFilter() {
    this.filterSubmit.emit({ fromDate: this.fromDate(), toDate: this.toDate() });
  }

  private formatDate(date: Date): string {
    return this.datePipe.transform(date, 'yyyy-MM-dd') || '';
  }

  private applyConstraints(dateStr: string): string {
    if (!dateStr) return dateStr;
    const min = this.minDate(), max = this.effectiveMax();
    if (min && dateStr < min) return min;
    if (max && dateStr > max) return max;
    return dateStr;
  }
}