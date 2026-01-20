import {
  Component,
  OnInit,
  OnDestroy,
  inject,
  signal,
  computed,
  ChangeDetectionStrategy,
  DestroyRef,
} from '@angular/core';
import { toObservable, takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { timer } from 'rxjs';
import {
  DateFilterComponent,
  DateRange,
} from '../../shared/components/date-filter/date-filter.component';
import { QmsService, QueueItem } from '../../core/services/qms.service';
import { PageEvent } from '@angular/material/paginator';
import { catchError, finalize, debounceTime, switchMap } from 'rxjs/operators';
import { of } from 'rxjs';
import { ToastService } from '@core/services/toast.service';
import { SearchService } from '../../core/services/search.service';
import {
  ReusableTableComponent,
  GridColumn,
} from '../../shared/components/reusable-table/reusable-table.component';
import { WidgetCardComponent } from '../../shared/components/widget-card/widget-card.component';
import { ThemeService, ThemePalette } from '../../core/services/theme.service';

const AUTO_REFRESH_INTERVAL = 60_000; // 60 seconds

interface WidgetData {
  id: string;
  icon: string;
  title: string;
  value: string;
  caption: string;
  accentColor: string;
}

@Component({
  selector: 'app-queue-monitor',
  standalone: true,
  imports: [
    CommonModule,
    DateFilterComponent,
    ReusableTableComponent,
    WidgetCardComponent,
  ],
  templateUrl: './queue-monitor.component.html',
  styleUrls: ['./queue-monitor.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class QueueMonitorComponent implements OnInit, OnDestroy {
  private qmsService = inject(QmsService);
  private toastService = inject(ToastService);
  private searchService = inject(SearchService);
  private destroyRef = inject(DestroyRef);
  public themeService = inject(ThemeService);

  public isLoading = signal<boolean>(false);
  public queueItems = signal<QueueItem[]>([]);
  public hasSearched = signal<boolean>(false);

  // Pagination & Search Signals
  public pageIndex = signal(0);
  public pageSize = signal(50);
  public totalCount = signal(0);
  public lastFilter = signal<DateRange | null>(null);
  public searchTerm = signal<string>('');

  // Auto-refresh
  public currentDateTime = signal<string>('');
  public autoRefreshEnabled = signal(true);
  private isRefreshing = false;
  private refreshSubscription: any = null;

  // Widget data computed from stats - colors match status chips
  // SQL: STATE=1 (Đang chờ), STATE=2 (Gọi lại), STATE=3 (Gọi nhỡ), STATE=-1 (Đã khám xong), STATE=0 (Đang khám)
  public widgetData = computed<WidgetData[]>(() => {
    const items = this.queueItems();
    const palette = this.themeService.currentPalette();

    // Count by STATE_NAME from API
    const waiting = items.filter(i =>
      (i.STATE_NAME || '').toLowerCase().includes('đang chờ')
    ).length;
    const examining = items.filter(i =>
      (i.STATE_NAME || '').toLowerCase().includes('đang khám')
    ).length;
    const callback = items.filter(i =>
      (i.STATE_NAME || '').toLowerCase().includes('gọi lại')
    ).length;
    const missed = items.filter(i =>
      (i.STATE_NAME || '').toLowerCase().includes('gọi nhỡ')
    ).length;
    const finished = items.filter(i =>
      (i.STATE_NAME || '').toLowerCase().includes('đã khám xong')
    ).length;
    const total = this.totalCount();

    // Colors matching status-chip CSS classes
    const STATUS_COLORS = {
      waiting: '#006e96', // status-in-use (Đang chờ) - Blue
      examining: '#0891b2', // status-info (Đang khám) - Cyan
      callback: '#d97706', // status-warning (Gọi lại) - Amber
      missed: '#dc3545', // status-error (Gọi nhỡ) - Red
      finished: '#16a34a', // status-success (Đã khám xong) - Green
    };

    return [
      {
        id: 'total',
        icon: 'fas fa-users',
        title: 'Tổng số',
        value: String(total),
        caption: 'Total',
        accentColor: palette.widgetAccent,
      },
      {
        id: 'waiting',
        icon: 'fas fa-clock',
        title: 'Đang chờ',
        value: String(waiting),
        caption: 'Waiting',
        accentColor: STATUS_COLORS.waiting,
      },
      {
        id: 'examining',
        icon: 'fas fa-stethoscope',
        title: 'Đang khám',
        value: String(examining),
        caption: 'Examining',
        accentColor: STATUS_COLORS.examining,
      },
      {
        id: 'callback',
        icon: 'fas fa-phone',
        title: 'Gọi lại',
        value: String(callback),
        caption: 'Callback',
        accentColor: STATUS_COLORS.callback,
      },
      {
        id: 'missed',
        icon: 'fas fa-phone-slash',
        title: 'Gọi nhỡ',
        value: String(missed),
        caption: 'Missed',
        accentColor: STATUS_COLORS.missed,
      },
      {
        id: 'finished',
        icon: 'fas fa-check-circle',
        title: 'Đã khám xong',
        value: String(finished),
        caption: 'Finished',
        accentColor: STATUS_COLORS.finished,
      },
    ];
  });

  // Use STATE_NAME directly from API for status display
  public tableData = computed(() => {
    return this.queueItems().map(item => ({
      ...item,
      STATUS_DISPLAY: item.STATE_NAME || 'Không xác định',
    }));
  });

  // Column order: STT, Status, Patient Info, Room Info, Times
  public columns: GridColumn[] = [
    {
      key: 'STT',
      label: 'STT',
      sortable: true,
      width: '50px',
      sticky: 'start',
    },
    {
      key: 'STATUS_DISPLAY',
      label: 'Trạng thái',
      sortable: true,
      type: 'status',
      statusClassFn: (value: string) => this.getStatusClass(value),
      width: '100px',
    },
    // Patient info first
    { key: 'MA_YTE', label: 'Mã Y Tế', sortable: true, width: '100px' },
    {
      key: 'TEN_BENH_NHAN',
      label: 'Tên bệnh nhân',
      sortable: true,
      width: '200px',
    },
    { key: 'NAM_SINH', label: 'Năm sinh', sortable: true, width: '60px' },
    {
      key: 'DOI_TUONG',
      label: 'Đối tượng',
      sortable: true,
      type: 'status',
      statusClassFn: (value: string) => this.getDoiTuongClass(value),
      width: '50px',
    },
    // Room info
    {
      key: 'PHONG_BAN',
      label: 'Phòng ban',
      sortable: true,
      width: '150px',
    },
    // Time columns
    {
      key: 'NGAYTAO',
      label: 'Ngày tạo',
      sortable: true,
      type: 'date',
      width: '160px',
    },
    {
      key: 'ESTIMATETIME',
      label: 'Thời gian dự kiến',
      sortable: true,
      type: 'date',
      width: '160px',
    },
  ];

  private getStatusClass(statusName: string): string {
    if (!statusName) return 'status-default';
    const normalized = statusName.toLowerCase();

    // SQL STATE_NAME mapping:
    // STATE=1 (Đang chờ), STATE=2 (Gọi lại), STATE=3 (Gọi nhỡ), STATE=-1 (Đã khám xong), STATE=0 (Đang khám)
    if (normalized.includes('đang chờ')) return 'status-in-use'; // Waiting - Blue
    if (normalized.includes('đang khám')) return 'status-info'; // Examining - Cyan
    if (normalized.includes('gọi lại')) return 'status-warning'; // Callback - Amber
    if (normalized.includes('gọi nhỡ')) return 'status-error'; // Missed - Red
    if (normalized.includes('đã khám xong')) return 'status-success'; // Finished - Green
    return 'status-default';
  }

  private getDoiTuongClass(doiTuong: string): string {
    if (!doiTuong) return 'status-default';
    const normalized = doiTuong.toLowerCase();
    if (normalized.includes('ưu tiên')) return 'status-error';
    return 'status-default';
  }

  constructor() {
    // Subscribe to global search service
    toObservable(this.searchService.searchTerm)
      .pipe(debounceTime(500), takeUntilDestroyed())
      .subscribe(term => {
        if (term !== this.searchTerm()) {
          this.searchTerm.set(term);
          if (this.hasSearched()) {
            this.pageIndex.set(0);
            this.loadData(true); // Force refresh to show loading and fetch new data
          }
        }
      });
  }

  ngOnInit(): void {
    // Auto-refresh using timer (like bed-usage)
    // Note: We don't start auto-refresh until first manual filter is submitted
  }

  ngOnDestroy(): void {
    this.stopAutoRefresh();
  }

  public toggleAutoRefresh(): void {
    if (this.autoRefreshEnabled()) {
      this.stopAutoRefresh();
    } else {
      this.startAutoRefresh();
    }
  }

  private startAutoRefresh(): void {
    this.autoRefreshEnabled.set(true);
    this.refreshSubscription = timer(
      AUTO_REFRESH_INTERVAL,
      AUTO_REFRESH_INTERVAL
    )
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        if (this.hasSearched() && !this.isLoading()) {
          this.loadData();
        }
      });
  }

  private stopAutoRefresh(): void {
    this.autoRefreshEnabled.set(false);
    if (this.refreshSubscription) {
      this.refreshSubscription.unsubscribe();
      this.refreshSubscription = null;
    }
  }

  onFilterSubmit(range: DateRange): void {
    this.lastFilter.set(range);
    this.pageIndex.set(0);
    this.loadData();
    // Start auto-refresh on first filter submit
    if (!this.refreshSubscription && this.autoRefreshEnabled()) {
      this.startAutoRefresh();
    }
  }

  onPageChange(event: PageEvent): void {
    this.pageIndex.set(event.pageIndex);
    this.pageSize.set(event.pageSize);
    this.loadData();
  }

  onSearchCleared(): void {
    this.searchService.setSearchTerm('');
  }

  public loadData(forceRefresh = false): void {
    const range = this.lastFilter();
    if (!range) return;

    // Skip if already refreshing, unless forced (e.g., search changed)
    if (this.isRefreshing && !forceRefresh) return;

    // Show loading indicator for initial load or forced refresh
    if (this.queueItems().length === 0 || forceRefresh) {
      this.isLoading.set(true);
    }
    this.isRefreshing = true;

    this.hasSearched.set(true);

    const queueId = range.queueId ?? 1;
    const pageNumber = this.pageIndex() + 1;
    const currentSearch = this.searchTerm();

    this.qmsService
      .getDanhSachSTT(
        range.fromDate,
        range.toDate,
        queueId,
        currentSearch,
        pageNumber,
        this.pageSize()
      )
      .pipe(
        catchError(err => {
          console.error('Error fetching queue data:', err);
          this.toastService.showError('Không thể tải dữ liệu hàng đợi.');
          return of({ Items: [], TotalCount: 0 });
        }),
        finalize(() => this.handleRequestComplete())
      )
      .subscribe((data: any) => {
        if (Array.isArray(data)) {
          this.queueItems.set(data);
          this.totalCount.set(data.length);
        } else if (data && data.Items) {
          this.queueItems.set(data.Items);
          this.totalCount.set(data.TotalCount || 0);
        } else {
          this.queueItems.set([]);
          this.totalCount.set(0);
        }
      });
  }

  private handleRequestComplete(): void {
    this.isLoading.set(false);
    this.isRefreshing = false;
    this.updateCurrentDateTime();
  }

  private updateCurrentDateTime(): void {
    const now = new Date().toLocaleString('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
    this.currentDateTime.set(now);
  }

  public trackByWidgetId(_index: number, item: WidgetData): string {
    return item.id;
  }
}
