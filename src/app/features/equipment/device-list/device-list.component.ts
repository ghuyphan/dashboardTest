import {
  Component,
  OnInit,
  OnDestroy,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  inject,
  DestroyRef,
  AfterViewInit,
  signal,
  computed,
} from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { Router, NavigationEnd } from '@angular/router';
import { PageEvent } from '@angular/material/paginator';
import { Subject, of, Observable } from 'rxjs';
import {
  finalize,
  switchMap,
  tap,
  catchError,
  debounceTime,
  map,
  filter,
} from 'rxjs/operators';

import {
  ReusableTableComponent,
  GridColumn,
  SortChangedEvent,
  SortDirection,
  RowActionEvent,
  TableAction, // Import this
} from '../../../shared/components/reusable-table/reusable-table.component';
import { FooterActionService } from '../../../core/services/footer-action.service';
import { FooterAction } from '../../../core/models/footer-action.model';
import { SearchService } from '../../../core/services/search.service';
import { ModalService } from '../../../core/services/modal.service';
import { ToastService } from '../../../core/services/toast.service';
import { DeviceFormComponent } from '../device-form/device-form.component';
import { ConfirmationModalComponent } from '../../../shared/components/confirmation-modal/confirmation-modal.component';
import { Device } from '../../../shared/models/device.model';
import {
  DeviceService,
  DeviceQueryParams,
} from '../../../core/services/device.service';
import { DEVICE_LIST_SHORTCUTS } from '../../../core/config/keyboard-shortcuts.config';

const DEFAULT_PAGE_SIZE = 25;
const DEFAULT_SORT_COLUMN = 'Id';
const DEFAULT_SORT_DIRECTION: SortDirection = 'asc';
const SEARCH_DEBOUNCE_TIME = 500;
const DEVICE_LIST_ROUTE = '/app/equipment/catalog';

@Component({
  selector: 'app-device-list',
  standalone: true,
  imports: [CommonModule, ReusableTableComponent],
  templateUrl: './device-list.component.html',
  styleUrl: './device-list.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DeviceListComponent implements OnInit, OnDestroy, AfterViewInit {
  private readonly footerService = inject(FooterActionService);
  private readonly deviceService = inject(DeviceService);
  private readonly searchService = inject(SearchService);
  private readonly modalService = inject(ModalService);
  private readonly toastService = inject(ToastService);
  private readonly router = inject(Router);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly destroyRef = inject(DestroyRef);

  // [UPDATED] Define the Row Actions for the dropdown menu
  public readonly tableActions: TableAction<Device>[] = [
    {
      action: 'view',
      label: 'Xem chi tiết',
      icon: 'visibility',
      color: 'primary',
    },
    {
      action: 'edit',
      label: 'Chỉnh sửa',
      icon: 'edit',
      color: 'accent',
    },
    {
      action: 'delete',
      label: 'Xóa',
      icon: 'delete',
      color: 'warn',
    },
  ];

  public readonly deviceColumns: GridColumn[] = this.initializeColumns();

  // Convert to signals for better reactivity
  public isLoading = signal(true);
  public pagedDeviceData = signal<Device[]>([]);
  public totalDeviceCount = signal(0);
  public currentPageIndex = signal(0);
  public currentPageSize = signal(DEFAULT_PAGE_SIZE);
  public currentSortColumn = signal(DEFAULT_SORT_COLUMN);
  public currentSortDirection = signal<SortDirection>(DEFAULT_SORT_DIRECTION);
  public currentSearchTerm = signal('');
  public selectedDevice = signal<Device | null>(null);

  private readonly reloadTrigger$ = new Subject<void>();
  private readonly searchTerm$ = toObservable(this.searchService.searchTerm);

  // ... [Keep deviceContextForAI and generateDeviceSummary as is] ...
  public deviceContextForAI = computed(() => {
    // (Existing code hidden for brevity - no changes needed here)
    const devices = this.pagedDeviceData();
    const total = this.totalDeviceCount();
    return {
      metadata: { totalDevices: total },
      devices: devices,
      summary: this.generateDeviceSummary(),
    };
  });

  private generateDeviceSummary() {
    // (Existing code hidden for brevity - no changes needed here)
    return {};
  }

  ngOnInit(): void {
    this.initializeSubscriptions();
    this.updateFooterActions();
  }

  ngAfterViewInit(): void {
    setTimeout(() => {
      this.triggerReload();
    }, 300);
  }

  ngOnDestroy(): void {
    this.footerService.clearActions();
  }

  // [UPDATED] Initialize columns with types and status class logic
  private initializeColumns(): GridColumn[] {
    return [
      { key: 'Id', label: 'ID', sortable: true, width: '50px' },
      { key: 'Ma', label: 'Mã Thiết Bị', sortable: true, width: '100px' },
      { key: 'Ten', label: 'Tên Thiết Bị', sortable: true, width: '150px' },
      { key: 'DeviceName', label: 'Tên Máy', sortable: true, width: '120px' },
      { key: 'Model', label: 'Model', sortable: true, width: '120px' },
      {
        key: 'SerialNumber',
        label: 'Số Serial',
        sortable: true,
        width: '120px',
      },
      {
        key: 'TenLoaiThietBi',
        label: 'Loại Thiết Bị',
        sortable: true,
        width: '120px',
      },

      // [UPDATED] Status Column
      {
        key: 'TrangThai_Ten',
        label: 'Trạng Thái',
        sortable: true,
        width: '120px',
        type: 'status',
        statusClassFn: value => this.getStatusClass(value),
      },

      { key: 'ViTri', label: 'Vị Trí', sortable: true, width: '80px' },
      { key: 'MoTa', label: 'Mô Tả', sortable: true, width: '180px' },

      // [UPDATED] Price as Currency
      {
        key: 'GiaMua',
        label: 'Giá Mua',
        sortable: true,
        width: '120px',
        type: 'currency',
      },

      // [UPDATED] Dates
      {
        key: 'NgayMua',
        label: 'Ngày Mua',
        sortable: true,
        width: '100px',
        type: 'date',
      },
      {
        key: 'NgayHetHanBH',
        label: 'Ngày Hết Hạn BH',
        sortable: true,
        width: '120px',
        type: 'date',
      },

      { key: 'NguoiTao', label: 'Người Tạo', sortable: true, width: '100px' },
      {
        key: 'NgayTao',
        label: 'Ngày Tạo',
        sortable: true,
        width: '100px',
        type: 'date',
      },

      // [UPDATED] Actions Column
      {
        key: 'actions',
        label: '',
        sortable: false,
        width: '60px',
        type: 'actions',
      },
    ];
  }

  // [NEW] Helper method for status colors
  private getStatusClass(statusName: string): string {
    if (!statusName) return 'status-default';

    const normalized = statusName.toLowerCase();

    if (
      normalized.includes('mới') ||
      normalized.includes('hoạt động') ||
      normalized.includes('tốt')
    ) {
      return 'status-success'; // Green
    }

    if (
      normalized.includes('hỏng') ||
      normalized.includes('lỗi') ||
      normalized.includes('bảo trì')
    ) {
      return 'status-broken'; // Red/Danger
    }

    if (
      normalized.includes('thanh lý') ||
      normalized.includes('cũ') ||
      normalized.includes('chờ')
    ) {
      return 'status-in-use'; // Blue/Info (or create a new status-warning class)
    }

    return 'status-default';
  }

  private initializeSubscriptions(): void {
    // ... (Existing code same as before) ...
    this.searchTerm$
      .pipe(
        debounceTime(SEARCH_DEBOUNCE_TIME),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe(term => {
        if (term !== this.currentSearchTerm()) {
          this.currentSearchTerm.set(term);
          this.resetToFirstPage();
        }
      });

    this.reloadTrigger$
      .pipe(
        tap(() => this.handleLoadStart()),
        switchMap(() => this.loadDevices()),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe();

    this.router.events
      .pipe(
        filter(event => event instanceof NavigationEnd),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe((event: NavigationEnd) => {
        if (
          event.urlAfterRedirects === DEVICE_LIST_ROUTE ||
          event.urlAfterRedirects.split('?')[0] === DEVICE_LIST_ROUTE
        ) {
          this.updateFooterActions();
          this.cdr.markForCheck();
        }
      });
  }

  // ... [Keep remaining methods: handleLoadStart, loadDevices, handleLoadSuccess, handleLoadError, etc.] ...

  private handleLoadStart(): void {
    this.isLoading.set(true);
    this.selectedDevice.set(null);
    this.updateFooterActions();
    this.cdr.markForCheck();
  }

  private loadDevices(): Observable<void> {
    const queryParams: DeviceQueryParams = {
      pageNumber: this.currentPageIndex() + 1,
      pageSize: this.currentPageSize(),
      sortColumn: this.currentSortColumn(),
      sortDirection: this.currentSortDirection(),
      textSearch: this.currentSearchTerm(),
    };

    return this.deviceService.getDevicesPaged(queryParams).pipe(
      tap(response => {
        this.pagedDeviceData.set(response.Items);
        this.totalDeviceCount.set(response.TotalCount);
        this.handleLoadSuccess();
      }),
      map(() => undefined),
      catchError(error => this.handleLoadError(error))
    );
  }

  private handleLoadSuccess(): void {
    this.isLoading.set(false);
    this.cdr.markForCheck();
  }

  private handleLoadError(error: any): Observable<void> {
    console.error('Failed to load devices:', error);
    this.isLoading.set(false);
    this.pagedDeviceData.set([]);
    this.totalDeviceCount.set(0);
    this.cdr.markForCheck();
    return of(undefined);
  }

  public onSortChanged(sortEvent: SortChangedEvent): void {
    this.currentSortColumn.set(sortEvent.column);
    this.currentSortDirection.set(sortEvent.direction);
    this.resetToFirstPage();
  }

  public onPageChanged(pageEvent: PageEvent): void {
    this.currentPageIndex.set(pageEvent.pageIndex);
    this.currentPageSize.set(pageEvent.pageSize);
    this.triggerReload();
  }

  public onDeviceSelected(device: Device | undefined): void {
    this.selectedDevice.set(device || null);
    this.updateFooterActions();
    this.cdr.markForCheck();
  }

  // [UPDATED] Handle Row Actions
  public handleRowAction(event: RowActionEvent<Device>): void {
    const actionHandlers: Record<string, (device: Device) => void> = {
      view: device => this.onViewDetail(device),
      edit: device => this.onModify(device),
      delete: device => this.onDelete(device),
    };

    const handler = actionHandlers[event.action];
    if (handler) handler(event.data);
  }

  public onSearchCleared(): void {
    this.searchService.setSearchTerm('');
  }

  public onViewDetail(device: Device): void {
    if (!device?.Id) return;
    this.router.navigate([DEVICE_LIST_ROUTE, device.Id]);
  }

  public onCreate(): void {
    this.modalService
      .open(DeviceFormComponent, {
        title: 'Tạo mới thiết bị',
        context: { device: null, title: 'Tạo mới Thiết bị' },
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(result => {
        if (result) this.resetToFirstPage();
      });
  }

  public onModify(device: Device): void {
    if (!device) return;
    this.modalService
      .open(DeviceFormComponent, {
        title: 'Sửa thiết bị',
        context: { device: { ...device }, title: 'Sửa thiết bị' },
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(result => {
        if (result) this.triggerReload();
      });
  }

  public onDelete(device: Device): void {
    if (!device) return;
    this.modalService
      .open(ConfirmationModalComponent, {
        title: 'Xác nhận Xóa',
        size: 'sm',
        context: {
          layout: 'standard',
          icon: 'fas fa-exclamation-triangle',
          iconColor: 'var(--color-warning)',
          title: 'Xóa thiết bị?',
          message: `Bạn có chắc chắn muốn xóa thiết bị "${device.Ten}" (Mã: ${device.Ma}) không?`,
          confirmText: 'Xóa',
          cancelText: 'Hủy bỏ',
        },
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(confirmed => {
        if (confirmed) this.performDeviceDeletion(device);
      });
  }

  private performDeviceDeletion(device: Device): void {
    if (!device.Id) return;

    this.isLoading.set(true);
    this.cdr.markForCheck();

    this.deviceService
      .deleteDevice(device.Id)
      .pipe(
        finalize(() => {
          this.isLoading.set(false);
          this.selectedDevice.set(null);
          this.updateFooterActions();
          this.cdr.markForCheck();
        }),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe({
        next: response => {
          this.toastService.showSuccess(
            response?.TenKetQua || 'Xóa thiết bị thành công!'
          );
          if (
            this.pagedDeviceData().length === 1 &&
            this.currentPageIndex() > 0
          ) {
            this.currentPageIndex.update(i => i - 1);
          }
          this.triggerReload();
        },
        error: error => {
          const msg =
            error.error?.TenKetQua ||
            error.error?.ErrorMessage ||
            'Xóa thất bại.';
          this.toastService.showError(msg, 0);
          console.error('Failed to delete device:', error);
        },
      });
  }

  private updateFooterActions(): void {
    const isRowSelected = this.selectedDevice() !== null;
    const actions: FooterAction[] = [
      {
        label: 'Tạo mới',
        icon: 'fas fa-plus',
        action: () => this.onCreate(),
        permission: 'QLThietBi.DMThietBi.RCREATE',
        className: 'btn-primary',
        shortcut: DEVICE_LIST_SHORTCUTS.CREATE,
      },
      {
        label: 'Sửa',
        icon: 'fas fa-pencil-alt',
        action: () => this.onModify(this.selectedDevice()!),
        permission: 'QLThietBi.DMThietBi.RMODIFY',
        className: 'btn-secondary',
        disabled: !isRowSelected,
        shortcut: DEVICE_LIST_SHORTCUTS.EDIT,
      },
      {
        label: 'Xóa',
        icon: 'fas fa-trash-alt',
        action: () => this.onDelete(this.selectedDevice()!),
        permission: 'QLThietBi.QLThietBiChiTiet.RDELETE',
        className: 'btn-danger',
        disabled: !isRowSelected,
        shortcut: DEVICE_LIST_SHORTCUTS.DELETE,
      },
      {
        label: 'Xem',
        icon: 'fas fa-eye',
        action: () => this.onViewDetail(this.selectedDevice()!),
        permission: 'QLThietBi.DMThietBi.RVIEW',
        className: 'btn-ghost',
        disabled: !isRowSelected,
        shortcut: DEVICE_LIST_SHORTCUTS.VIEW,
      },
    ];
    this.footerService.setActions(actions);
  }

  private resetToFirstPage(): void {
    this.currentPageIndex.set(0);
    this.triggerReload();
  }

  private triggerReload(): void {
    this.reloadTrigger$.next();
  }
}
