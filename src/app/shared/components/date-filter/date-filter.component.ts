import {
  Component,
  inject,
  signal,
  output,
  input,
  ViewEncapsulation,
  computed,
  OnInit,
  OnDestroy,
  ViewChild,
  ElementRef,
  AfterViewInit,
} from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  MatDatepickerModule,
  MatDatepicker,
} from '@angular/material/datepicker';
import { MatMenuModule } from '@angular/material/menu';
import { MatIconModule } from '@angular/material/icon';
import {
  MatNativeDateModule,
  MAT_DATE_LOCALE,
  provideNativeDateAdapter,
} from '@angular/material/core';
import { BreakpointObserver, Breakpoints } from '@angular/cdk/layout';
import { Subject, takeUntil } from 'rxjs';
import { ToastService } from '@core/services/toast.service';
import { DateUtils } from '../../utils/date.utils';
import {
  KeyboardShortcutService,
  ShortcutInput,
} from '@core/services/keyboard-shortcut.service';
import { TooltipDirective } from '../../directives/tooltip.directive';
import { DATE_FILTER_SHORTCUTS } from '@core/config/keyboard-shortcuts.config';

export interface DateRange {
  fromDate: string;
  toDate: string;
  rangeType?: QuickRange;
  queueId?: number;
}

export type QuickRange =
  | 'today'
  | 'thisWeek'
  | 'thisMonth'
  | 'thisQuarter'
  | 'thisYear'
  | 'custom';

@Component({
  selector: 'app-date-filter',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatMenuModule,
    MatIconModule,
    MatDatepickerModule,
    MatNativeDateModule,
    TooltipDirective,
  ],
  providers: [
    DatePipe,
    provideNativeDateAdapter(),
    { provide: MAT_DATE_LOCALE, useValue: 'vi-VN' },
  ],
  templateUrl: './date-filter.component.html',
  styleUrl: './date-filter.component.scss',
  encapsulation: ViewEncapsulation.Emulated,
})
export class DateFilterComponent implements OnInit, OnDestroy, AfterViewInit {
  private datePipe = inject(DatePipe);
  private toastService = inject(ToastService);
  private breakpointObserver = inject(BreakpointObserver);
  private shortcutService = inject(KeyboardShortcutService);
  private destroy$ = new Subject<void>();

  // INPUTS
  public isLoading = input<boolean>(false);
  public buttonLabel = input<string>('Xem Báo Cáo');
  public defaultRange = input<QuickRange>('thisWeek');
  public minDate = input<string>('');
  public maxDate = input<string>('');
  public showQueueFilter = input<boolean>(false);
  public showQuickRanges = input<boolean>(true);
  public autoLoad = input<boolean>(false);

  // OUTPUTS
  public filterSubmit = output<DateRange>();

  // SIGNALS
  public fromDate = signal<string>('');
  public toDate = signal<string>('');
  public activeRange = signal<QuickRange>('thisWeek');

  public selectedQueue = signal<number>(1);

  public selectedQueueLabel = computed(() => {
    return this.selectedQueue() === 1
      ? 'Khu vực 1 (Queue 1)'
      : 'Khu vực 2 (Queue 2)';
  });

  // Signal to track if we are on mobile
  public isMobile = signal<boolean>(false);

  // Scroll state signals for gradient visibility
  public canScrollLeft = signal<boolean>(false);
  public canScrollRight = signal<boolean>(false);

  // ViewChild for Datepicker
  @ViewChild('picker') private picker!: MatDatepicker<Date>;

  // ViewChild for quick actions scroll container
  @ViewChild('quickActionsScroll')
  private quickActionsScroll!: ElementRef<HTMLDivElement>;

  public quickRanges: { key: QuickRange; label: string }[] = [
    { key: 'today', label: 'Hôm nay' },
    { key: 'thisWeek', label: 'Tuần này' },
    { key: 'thisMonth', label: 'Tháng này' },
    { key: 'thisQuarter', label: 'Quý này' },
    { key: 'thisYear', label: 'Năm nay' },
  ];

  private readonly todayStr = new Date().toISOString().split('T')[0];

  public effectiveMax = computed(() =>
    this.maxDate() ? this.maxDate() : this.todayStr
  );

  public fromMax = computed(() => {
    const to = this.toDate();
    const max = this.effectiveMax();
    return to && to < max ? to : max;
  });

  public toMin = computed(() => {
    const from = this.fromDate();
    const min = this.minDate();
    return from && (!min || from > min) ? from : min || '';
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
    this.breakpointObserver
      .observe([Breakpoints.Handset, Breakpoints.TabletPortrait])
      .pipe(takeUntil(this.destroy$))
      .subscribe(result => {
        this.isMobile.set(result.matches);
      });
  }

  ngOnInit(): void {
    this.setRange(this.defaultRange(), this.autoLoad());

    // [SHORTCUT] Alt + F to focus/open date picker (From Date)
    this.shortcutService
      .listen(DATE_FILTER_SHORTCUTS.OPEN_PICKER)
      .pipe(takeUntil(this.destroy$))
      .subscribe(e => {
        e.event.preventDefault();
        this.picker.open();
      });

    // [SHORTCUT] Alt + Enter to apply filter
    this.shortcutService
      .listen(DATE_FILTER_SHORTCUTS.APPLY)
      .pipe(takeUntil(this.destroy$))
      .subscribe(e => {
        e.event.preventDefault();
        if (!this.isLoading()) {
          this.applyFilter();
        }
      });

    // [SHORTCUTS] Alt + 1-5 for quick ranges
    const quickRangeShortcuts: {
      shortcut: ShortcutInput;
      range: QuickRange;
    }[] = [
      { shortcut: DATE_FILTER_SHORTCUTS.QUICK_TODAY, range: 'today' },
      { shortcut: DATE_FILTER_SHORTCUTS.QUICK_THIS_WEEK, range: 'thisWeek' },
      { shortcut: DATE_FILTER_SHORTCUTS.QUICK_THIS_MONTH, range: 'thisMonth' },
      {
        shortcut: DATE_FILTER_SHORTCUTS.QUICK_THIS_QUARTER,
        range: 'thisQuarter',
      },
      { shortcut: DATE_FILTER_SHORTCUTS.QUICK_THIS_YEAR, range: 'thisYear' },
    ];

    quickRangeShortcuts.forEach(qr => {
      this.shortcutService
        .listen(qr.shortcut)
        .pipe(takeUntil(this.destroy$))
        .subscribe(e => {
          e.event.preventDefault();
          if (!this.isLoading()) {
            this.setRange(qr.range, true);
          }
        });
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  ngAfterViewInit(): void {
    // Check initial scroll state after view is ready
    setTimeout(() => this.updateScrollState(), 0);
  }

  /** Handle scroll event on quick actions container */
  onQuickActionsScroll(): void {
    this.updateScrollState();
  }

  /** Update scroll state signals based on current scroll position */
  private updateScrollState(): void {
    if (!this.quickActionsScroll?.nativeElement) return;

    const el = this.quickActionsScroll.nativeElement;
    const scrollLeft = el.scrollLeft;
    const scrollWidth = el.scrollWidth;
    const clientWidth = el.clientWidth;

    // Can scroll left if not at the beginning
    this.canScrollLeft.set(scrollLeft > 2);

    // Can scroll right if not at the end (with 2px threshold for rounding)
    this.canScrollRight.set(scrollLeft + clientWidth < scrollWidth - 2);
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

  onQueueChange(value: number) {
    this.selectedQueue.set(value);
  }

  setRange(range: QuickRange, emit: boolean = false) {
    this.activeRange.set(range);
    const now = new Date();
    let startStr = '',
      endStr = '';

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
        startStr = this.formatDate(
          new Date(now.getFullYear(), now.getMonth(), 1)
        );
        endStr = this.formatDate(
          new Date(now.getFullYear(), now.getMonth() + 1, 0)
        );
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
    this.filterSubmit.emit({
      fromDate: this.fromDate(),
      toDate: this.toDate(),
      rangeType: this.activeRange(),
      queueId: this.showQueueFilter() ? this.selectedQueue() : undefined,
    });
  }

  private formatDate(date: Date): string {
    return this.datePipe.transform(date, 'yyyy-MM-dd') || '';
  }

  private applyConstraints(dateStr: string): string {
    if (!dateStr) return dateStr;
    const min = this.minDate(),
      max = this.effectiveMax();
    if (min && dateStr < min) return min;
    if (max && dateStr > max) return max;
    return dateStr;
  }
}
