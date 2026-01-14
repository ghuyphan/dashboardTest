import {
  Component,
  inject,
  signal,
  computed,
  ChangeDetectionStrategy,
  OnInit,
  DestroyRef,
} from '@angular/core';
import { toObservable, takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import {
  DateFilterComponent,
  DateRange,
} from '../../shared/components/date-filter/date-filter.component';
import { QmsService, QueueItem } from '../../core/services/qms.service';
import { catchError, finalize, debounceTime } from 'rxjs/operators';
import { of } from 'rxjs';
import { ToastService } from '@core/services/toast.service';
import { SearchService } from '../../core/services/search.service';
import {
  ReusableTableComponent,
  GridColumn,
} from '../../shared/components/reusable-table/reusable-table.component';

@Component({
  selector: 'app-queue-monitor',
  standalone: true,
  imports: [CommonModule, DateFilterComponent, ReusableTableComponent],
  templateUrl: './queue-monitor.component.html',
  styleUrls: ['./queue-monitor.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class QueueMonitorComponent implements OnInit {
  private qmsService = inject(QmsService);
  private toastService = inject(ToastService);
  private searchService = inject(SearchService);
  private destroyRef = inject(DestroyRef);

  public isLoading = signal<boolean>(false);
  public queueItems = signal<QueueItem[]>([]);
  public hasSearched = signal<boolean>(false);

  // Pagination & Search Signals
  public pageIndex = signal(0);
  public pageSize = signal(50);
  public totalCount = signal(0);
  public lastFilter = signal<DateRange | null>(null);
  public searchTerm = signal<string>('');

  // Mapped data for the table
  public tableData = computed(() => {
    return this.queueItems().map(item => ({
      ...item,
      STATE_TEXT: item.STATE === 1 ? 'Đang chờ' : 'Đã xử lý',
    }));
  });

  public columns: GridColumn[] = [
    {
      key: 'STT',
      label: 'STT',
      sortable: true,
      width: '80px',
      sticky: 'start',
    },
    {
      key: 'PHONG_BAN',
      label: 'Tên quầy/phòng',
      sortable: true,
      width: '250px',
    },

    { key: 'MA_YTE', label: 'Mã Y Tế', sortable: true, width: '150px' },
    {
      key: 'TEN_BENH_NHAN',
      label: 'Tên bệnh nhân',
      sortable: true,
      width: '200px',
    },
    { key: 'NAM_SINH', label: 'Năm sinh', sortable: true, width: '100px' },
    { key: 'DOI_TUONG', label: 'Đối tượng', sortable: true, width: '120px' },
    {
      key: 'QUEUE_NAME',
      label: 'Tên hàng đợi',
      sortable: true,
      width: '200px',
    },
    {
      key: 'QMS_PHONG_KHAM',
      label: 'QMS Phòng khám',
      sortable: true,
      width: '150px',
    },
    {
      key: 'COMPUTER_NAME',
      label: 'Tên máy tính',
      sortable: true,
      width: '150px',
    },
    {
      key: 'CREATEDATE',
      label: 'Ngày tạo',
      sortable: true,
      type: 'date',
      width: '160px',
    },
    {
      key: 'CREATEDATE1',
      label: 'Ngày tạo 1',
      sortable: true,
      type: 'date',
      width: '160px',
    },
    {
      key: 'STATE_TEXT',
      label: 'Trạng thái',
      sortable: true,
      type: 'status',
      statusClassFn: (value: string) => this.getStatusClass(value),
      width: '140px',
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

    if (normalized.includes('đang chờ')) {
      return 'status-in-use'; // Blue (matches Device List 'chờ')
    }

    if (normalized.includes('đã xử lý')) {
      return 'status-success'; // Green (#16a34a)
    }

    // Add more conditions if needed, e.g. 'đang khám' -> status-success

    return 'status-default'; // Gray for 'Đã xử lý' etc.
  }

  constructor() {
    // Subscribe to global search service
    toObservable(this.searchService.searchTerm)
      .pipe(debounceTime(500), takeUntilDestroyed())
      .subscribe(term => {
        if (term !== this.searchTerm()) {
          this.searchTerm.set(term);
          // Only reload if we have an active filter/search context
          if (this.hasSearched()) {
            this.pageIndex.set(0); // Reset to first page
            this.loadData();
          }
        }
      });
  }

  ngOnInit(): void {}

  onFilterSubmit(range: DateRange) {
    this.lastFilter.set(range);
    this.pageIndex.set(0); // Reset to first page on new filter
    this.loadData();
  }

  onPageChange(event: any) {
    this.pageIndex.set(event.pageIndex);
    this.pageSize.set(event.pageSize);
    this.loadData();
  }

  onSearchCleared() {
    this.searchService.setSearchTerm('');
  }

  loadData() {
    const range = this.lastFilter();
    if (!range) return;

    this.isLoading.set(true);
    this.hasSearched.set(true);

    const queueId = range.queueId ?? 1;

    // API uses 1-based page number, Material Paginator uses 0-based index
    const pageNumber = this.pageIndex() + 1;
    const currentSearch = this.searchTerm();

    this.qmsService
      .getDanhSachSTT(
        range.fromDate,
        range.toDate,
        queueId,
        currentSearch, // Use dynamic search term
        pageNumber,
        this.pageSize()
      )
      .pipe(
        catchError(err => {
          console.error('Error fetching queue data:', err);
          this.toastService.showError('Không thể tải dữ liệu hàng đợi.');
          // Return empty PagedResult structure on error
          return of({ Items: [], TotalCount: 0 });
        }),
        finalize(() => this.isLoading.set(false))
      )
      .subscribe((data: any) => {
        console.log('API Response:', data); // Debug log

        if (Array.isArray(data)) {
          // Handle legacy/raw array response
          this.queueItems.set(data);
          this.totalCount.set(data.length);
        } else if (data && data.Items) {
          // Handle PagedResult
          this.queueItems.set(data.Items);
          this.totalCount.set(data.TotalCount || 0);
        } else {
          // Fallback
          this.queueItems.set([]);
          this.totalCount.set(0);
        }
      });
  }
}
