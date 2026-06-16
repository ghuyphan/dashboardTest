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

  // Count Signals from API Response
  public dangChoCount = signal<number>(0);
  public dangThucHienCount = signal<number>(0);
  public goiLaiCount = signal<number>(0);
  public goiNhoCount = signal<number>(0);
  public daThucHienCount = signal<number>(0);

  // Auto-refresh
  public currentDateTime = signal<string>('');
  public autoRefreshEnabled = signal(true);
  private isRefreshing = false;
  private refreshSubscription: any = null;

  // Widget data computed from stats - colors match status chips
  // SQL: STATE=1 (Đang chờ), STATE=2 (Gọi lại), STATE=3 (Gọi nhỡ), STATE=-1 (Đã khám xong), STATE=0 (Đang khám)
  public widgetData = computed<WidgetData[]>(() => {
    const palette = this.themeService.currentPalette();
    const total = this.totalCount();

    // Colors matching status-chip CSS classes
    const STATUS_COLORS = {
      waiting: '#006e96', // status-in-use (Đang chờ) - Blue
      examining: '#0891b2', // status-info (Đang thực hiện) - Cyan
      callback: '#d97706', // status-warning (Gọi lại) - Amber
      missed: '#dc3545', // status-error (Gọi nhỡ) - Red
      finished: '#16a34a', // status-success (Đã thực hiện) - Green
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
        value: String(this.dangChoCount()),
        caption: 'Waiting',
        accentColor: STATUS_COLORS.waiting,
      },
      {
        id: 'examining',
        icon: 'fas fa-stethoscope',
        title: 'Đang thực hiện',
        value: String(this.dangThucHienCount()),
        caption: 'Examining',
        accentColor: STATUS_COLORS.examining,
      },
      {
        id: 'callback',
        icon: 'fas fa-phone',
        title: 'Gọi lại',
        value: String(this.goiLaiCount()),
        caption: 'Callback',
        accentColor: STATUS_COLORS.callback,
      },
      {
        id: 'missed',
        icon: 'fas fa-phone-slash',
        title: 'Gọi nhỡ',
        value: String(this.goiNhoCount()),
        caption: 'Missed',
        accentColor: STATUS_COLORS.missed,
      },
      {
        id: 'finished',
        icon: 'fas fa-check-circle',
        title: 'Đã thực hiện',
        value: String(this.daThucHienCount()),
        caption: 'Finished',
        accentColor: STATUS_COLORS.finished,
      },
    ];
  });

  // Use STATE_NAME directly from API for status display
  public tableData = computed(() => {
    return this.queueItems().map(item => {
      let statusDisplay = item.STATE_NAME || 'Không xác định';
      if (statusDisplay.toLowerCase() === 'bỏ qua') {
        statusDisplay = 'Gọi lại';
      }
      return {
        ...item,
        STATUS_DISPLAY: statusDisplay,
      };
    });
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
      width: '100px',
    },
    // Room info
    {
      key: 'PHONG_BAN',
      label: 'Phòng ban',
      sortable: true,
      width: '150px',
    },
    {
      key: 'QMS_PHONG_KHAM',
      label: 'Phòng khám QMS',
      sortable: true,
      width: '120px',
    },
    {
      key: 'QUEUE_NAME',
      label: 'Tên hàng đợi',
      sortable: true,
      width: '200px',
    },
    {
      key: 'TEN_DICH_VU',
      label: 'Tên dịch vụ',
      sortable: true,
      width: '180px',
    },
    // Time columns
    {
      key: 'NGAYTAO',
      label: 'Ngày tạo',
      sortable: true,
      type: 'date',
      dateFormat: 'dd/MM/yyyy HH:mm',
      width: '160px',
    },
    {
      key: 'ESTIMATETIME',
      label: 'Thời gian dự kiến',
      sortable: true,
      type: 'date',
      dateFormat: 'dd/MM/yyyy HH:mm',
      width: '160px',
    },
  ];

  private getStatusClass(statusName: string): string {
    if (!statusName) return 'status-default';
    const normalized = statusName.toLowerCase();

    // SQL STATE_NAME mapping:
    // STATE=1 (Đang chờ), STATE=2 (Gọi lại), STATE=3 (Gọi nhỡ), STATE=-1 (Đã khám xong), STATE=0 (Đang khám)
    if (normalized.includes('đang chờ')) return 'status-in-use'; // Waiting - Blue
    if (
      normalized.includes('đang khám') ||
      normalized.includes('đang thực hiện')
    )
      return 'status-info'; // Examining/In progress - Cyan
    if (normalized.includes('gọi lại')) return 'status-warning'; // Callback - Amber
    if (normalized.includes('gọi nhỡ')) return 'status-error'; // Missed - Red
    if (
      normalized.includes('đã khám xong') ||
      normalized.includes('đã thực hiện')
    )
      return 'status-success'; // Finished/Done - Green
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
    console.log('=== Paging Event Triggered ===', event);
    this.pageIndex.set(event.pageIndex);
    this.pageSize.set(event.pageSize);
    this.loadData(true);
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

    console.log('=== loadData Called ===', {
      pageIndex: this.pageIndex(),
      pageSize: this.pageSize(),
      pageNumber: pageNumber,
      queueId,
      currentSearch,
    });

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
        console.log('=== QMS API Response Received ===', data);
        if (Array.isArray(data)) {
          this.queueItems.set(data);
          this.totalCount.set(data.length);
          this.dangChoCount.set(
            data.filter(i =>
              (i.STATE_NAME || '').toLowerCase().includes('đang chờ')
            ).length
          );
          this.dangThucHienCount.set(
            data.filter(
              i =>
                (i.STATE_NAME || '').toLowerCase().includes('đang thực hiện') ||
                (i.STATE_NAME || '').toLowerCase().includes('đang khám')
            ).length
          );
          this.goiLaiCount.set(
            data.filter(
              i =>
                (i.STATE_NAME || '').toLowerCase().includes('gọi lại') ||
                (i.STATE_NAME || '').toLowerCase().includes('bỏ qua')
            ).length
          );
          this.goiNhoCount.set(
            data.filter(i =>
              (i.STATE_NAME || '').toLowerCase().includes('gọi nhỡ')
            ).length
          );
          this.daThucHienCount.set(
            data.filter(
              i =>
                (i.STATE_NAME || '').toLowerCase().includes('đã thực hiện') ||
                (i.STATE_NAME || '').toLowerCase().includes('đã khám xong')
            ).length
          );
        } else if (data && data.Items) {
          this.queueItems.set(data.Items);

          // Protect totalCount from being set to 0 if TOTAL_COUNT/TotalCount is missing or 0 on pagination pages
          const apiTotal = data.TOTAL_COUNT ?? data.TotalCount;
          if (apiTotal !== undefined && apiTotal !== null && apiTotal > 0) {
            console.log('Setting totalCount to:', apiTotal);
            this.totalCount.set(apiTotal);
          } else if (apiTotal === 0 && this.pageIndex() === 0) {
            console.log('Setting totalCount to 0 (first page empty)');
            this.totalCount.set(0);
          } else {
            console.log(
              'API did not return valid total count, keeping current totalCount:',
              this.totalCount()
            );
          }

          this.dangChoCount.set(data.DANG_CHO ?? data.DangCho ?? 0);
          this.dangThucHienCount.set(
            data.DANG_THUC_HIEN ?? data.DangThucHien ?? 0
          );
          this.goiLaiCount.set(data.BO_QUA ?? data.BoQua ?? data.GoiLai ?? 0);
          this.goiNhoCount.set(data.GOI_NHO ?? data.GoiNho ?? 0);
          this.daThucHienCount.set(data.DA_THUC_HIEN ?? data.DaThucHien ?? 0);
        } else {
          this.queueItems.set([]);
          this.totalCount.set(0);
          this.dangChoCount.set(0);
          this.dangThucHienCount.set(0);
          this.goiLaiCount.set(0);
          this.goiNhoCount.set(0);
          this.daThucHienCount.set(0);
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
