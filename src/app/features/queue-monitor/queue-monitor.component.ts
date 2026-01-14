import {
  Component,
  inject,
  signal,
  computed,
  ChangeDetectionStrategy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  DateFilterComponent,
  DateRange,
} from '../../shared/components/date-filter/date-filter.component';
import { QmsService, QueueItem } from '../../core/services/qms.service';
import { catchError, finalize } from 'rxjs/operators';
import { of } from 'rxjs';
import { ToastService } from '@core/services/toast.service';
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
export class QueueMonitorComponent {
  private qmsService = inject(QmsService);
  private toastService = inject(ToastService);

  public isLoading = signal<boolean>(false);
  public queueItems = signal<QueueItem[]>([]);
  public hasSearched = signal<boolean>(false);

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

  onFilterSubmit(range: DateRange) {
    this.isLoading.set(true);
    this.hasSearched.set(true);

    const queueId = range.queueId ?? 1;

    this.qmsService
      .getDanhSachSTT(range.fromDate, range.toDate, queueId)
      .pipe(
        catchError(err => {
          console.error('Error fetching queue data:', err);
          this.toastService.showError('Không thể tải dữ liệu hàng đợi.');
          return of([]);
        }),
        finalize(() => this.isLoading.set(false))
      )
      .subscribe(data => {
        this.queueItems.set(data);
      });
  }
}
