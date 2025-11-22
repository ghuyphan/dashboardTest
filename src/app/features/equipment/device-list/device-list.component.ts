import {
  Component,
  OnInit,
  OnDestroy,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  inject,
  DestroyRef,
  AfterViewInit,
} from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Router, NavigationEnd, Event as RouterEvent } from '@angular/router'; 
import { PageEvent } from '@angular/material/paginator';
import { Subject, of, Observable } from 'rxjs';
import {
  finalize,
  switchMap,
  tap,
  catchError,
  startWith,
  debounceTime,
  map,
  filter,
} from 'rxjs/operators';

import { ReusableTableComponent, GridColumn, SortChangedEvent, SortDirection } from '../../../components/reusable-table/reusable-table.component';
import { FooterActionService } from '../../../core/services/footer-action.service';
import { FooterAction } from '../../../core/models/footer-action.model';
import { SearchService } from '../../../core/services/search.service';
import { ModalService } from '../../../core/services/modal.service';
import { ToastService } from '../../../core/services/toast.service';
import { DeviceFormComponent } from '../device-form/device-form.component';
import { ConfirmationModalComponent } from '../../../components/confirmation-modal/confirmation-modal.component';
import { Device } from '../../../shared/models/device.model';
import { environment } from '../../../../environments/environment.development';
import { DateUtils } from '../../../shared/utils/date.utils';

// Constants
const DEFAULT_PAGE_SIZE = 25;
const DEFAULT_SORT_COLUMN = 'Id';
const DEFAULT_SORT_DIRECTION: SortDirection = 'asc';
const SEARCH_DEBOUNCE_TIME = 500;
const DEVICE_LIST_ROUTE = '/app/equipment/catalog';

// Interfaces
export interface PagedResult<T> {
  Items: T[];
  TotalCount: number;
}

interface RowActionEvent {
  action: string;
  data: Device;
}

@Component({
  selector: 'app-device-list',
  standalone: true,
  imports: [CommonModule, ReusableTableComponent],
  templateUrl: './device-list.component.html',
  styleUrl: './device-list.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DeviceListComponent implements OnInit, OnDestroy, AfterViewInit {
  // Dependency Injection
  private readonly footerService = inject(FooterActionService);
  private readonly http = inject(HttpClient);
  private readonly searchService = inject(SearchService);
  private readonly modalService = inject(ModalService);
  private readonly toastService = inject(ToastService);
  private readonly router = inject(Router);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly destroyRef = inject(DestroyRef);

  // Public Properties
  public readonly deviceColumns: GridColumn[] = this.initializeColumns();
  public isLoading = true;
  public pagedDeviceData: Device[] = [];
  public totalDeviceCount = 0;
  public currentPageIndex = 0;
  public currentPageSize = DEFAULT_PAGE_SIZE;
  public currentSortColumn = DEFAULT_SORT_COLUMN;
  public currentSortDirection: SortDirection = DEFAULT_SORT_DIRECTION;
  public currentSearchTerm = '';
  public selectedDevice: Device | null = null;

  // Private Properties
  private readonly reloadTrigger$ = new Subject<void>();
  private readonly searchTerm$ = toObservable(this.searchService.searchTerm);

  ngOnInit(): void {
    this.initializeSubscriptions();
    this.updateFooterActions();
  }

  ngAfterViewInit(): void {
    // [PERFORMANCE FIX]
    // Delay data loading slightly to allow the View Transition animation to complete smoothly.
    // Without this, the heavy table rendering blocks the main thread during the slide animation.
    setTimeout(() => {
      this.triggerReload();
    }, 300);
  }

  ngOnDestroy(): void {
    this.footerService.clearActions();
  }

  private initializeColumns(): GridColumn[] {
    return [
      { key: 'Id', label: 'ID', sortable: true, width: '50px' },
      { key: 'Ma', label: 'Mã Thiết Bị', sortable: true, width: '100px' },
      { key: 'Ten', label: 'Tên Thiết Bị', sortable: true, width: '150px' },
      { key: 'DeviceName', label: 'Tên Máy', sortable: true, width: '120px' },
      { key: 'Model', label: 'Model', sortable: true, width: '120px' },
      { key: 'SerialNumber', label: 'Số Serial', sortable: true, width: '120px' },
      { key: 'TenLoaiThietBi', label: 'Loại Thiết Bị', sortable: true, width: '120px' },
      { key: 'TrangThai_Ten', label: 'Trạng Thái', sortable: true, width: '120px' },
      { key: 'ViTri', label: 'Vị Trí', sortable: true, width: '80px' },
      { key: 'MoTa', label: 'Mô Tả', sortable: true, width: '180px' },
      { key: 'GiaMua', label: 'Giá Mua', sortable: true, width: '120px' },
      { key: 'NgayMua', label: 'Ngày Mua', sortable: true, width: '100px' },
      { key: 'NgayHetHanBH', label: 'Ngày Hết Hạn BH', sortable: true, width: '120px' },
      { key: 'NguoiTao', label: 'Người Tạo', sortable: true, width: '100px' },
      { key: 'NgayTao', label: 'Ngày Tạo', sortable: true, width: '100px' },
      { key: 'actions', label: '', sortable: false, width: '60px' },
    ];
  }

  private initializeSubscriptions(): void {
    // 1. Search Subscription
    this.searchTerm$
      .pipe(
        debounceTime(SEARCH_DEBOUNCE_TIME),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe((term) => {
        if (term !== this.currentSearchTerm) {
          this.currentSearchTerm = term;
          this.resetToFirstPage();
        }
      });

    // 2. Data Reload Subscription
    this.reloadTrigger$
      .pipe(
        // [PERFORMANCE FIX] Removed startWith(null) to prevent immediate loading during init
        tap(() => this.handleLoadStart()),
        switchMap(() => this.loadDevices()),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe();

    // 3. Router Subscription
    this.router.events
      .pipe(
        filter(event => event instanceof NavigationEnd),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe((event: NavigationEnd) => {
        if (event.urlAfterRedirects === DEVICE_LIST_ROUTE || 
            event.urlAfterRedirects.split('?')[0] === DEVICE_LIST_ROUTE) {
          this.updateFooterActions();
          this.cdr.markForCheck();
        }
      });
  }

  private handleLoadStart(): void {
    this.isLoading = true;
    this.selectedDevice = null;
    this.updateFooterActions();
    this.cdr.markForCheck();
  }

  private loadDevices(): Observable<void> {
    const params = this.buildHttpParams();
    const url = this.buildApiUrl();

    return this.http.get<PagedResult<Device>>(url, { params }).pipe(
      map((response) => this.processDeviceResponse(response)),
      tap(() => this.handleLoadSuccess()),
      catchError((error) => this.handleLoadError(error))
    );
  }

  private buildHttpParams(): HttpParams {
    const pageNumber = this.currentPageIndex + 1;
    let params = new HttpParams()
      .set('PageNumber', pageNumber.toString())
      .set('PageSize', this.currentPageSize.toString())
      .set('sortColumn', this.currentSortColumn)
      .set('sortDirection', this.currentSortDirection);

    if (this.currentSearchTerm) {
      params = params.set('TextSearch', this.currentSearchTerm);
    }
    return params;
  }

  private buildApiUrl(): string {
    const baseUrl = environment.equipmentCatUrl;
    return this.currentSearchTerm ? `${baseUrl}/page/search` : `${baseUrl}/page`;
  }

  private processDeviceResponse(response: PagedResult<Device>): void {
    const formattedData = response.Items.map((device) =>
      this.formatDeviceDates(device)
    );
    this.pagedDeviceData = formattedData;
    this.totalDeviceCount = response.TotalCount;
  }

  private formatDeviceDates(device: Device): Device {
    return {
      ...device,
      NgayTao: DateUtils.formatToDisplay(device.NgayTao),
      NgayMua: DateUtils.formatToDisplay(device.NgayMua),
      NgayHetHanBH: DateUtils.formatToDisplay(device.NgayHetHanBH),
    };
  }

  private handleLoadSuccess(): void {
    this.isLoading = false;
    this.cdr.markForCheck();
  }

  private handleLoadError(error: HttpErrorResponse): Observable<void> {
    console.error('Failed to load devices:', error);
    this.isLoading = false;
    this.pagedDeviceData = [];
    this.totalDeviceCount = 0;
    this.cdr.markForCheck();
    return of(undefined);
  }

  // --- Table Event Handlers ---

  public onSortChanged(sortEvent: SortChangedEvent): void {
    this.currentSortColumn = sortEvent.column;
    this.currentSortDirection = sortEvent.direction;
    this.resetToFirstPage();
  }

  public onPageChanged(pageEvent: PageEvent): void {
    this.currentPageIndex = pageEvent.pageIndex;
    this.currentPageSize = pageEvent.pageSize;
    this.triggerReload();
  }

  public onDeviceSelected(device: Device): void {
    this.selectedDevice = this.selectedDevice === device ? null : device;
    this.updateFooterActions();
    this.cdr.markForCheck();
  }

  public handleRowAction(event: RowActionEvent): void {
    const actionHandlers: Record<string, (device: Device) => void> = {
      view: (device) => this.onViewDetail(device),
      edit: (device) => this.onModify(device),
      delete: (device) => this.onDelete(device),
    };

    const handler = actionHandlers[event.action];
    if (handler) handler(event.data);
  }

  public onSearchCleared(): void {
    this.searchService.setSearchTerm('');
  }

  // --- CRUD Operations ---

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
      .subscribe((result) => {
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
      .subscribe((result) => {
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
      .subscribe((confirmed) => {
        if (confirmed) this.performDeviceDeletion(device);
      });
  }

  private performDeviceDeletion(device: Device): void {
    this.isLoading = true;
    this.cdr.markForCheck();
    const deleteUrl = `${environment.equipmentCatUrl}/${device.Id}`;

    this.http.delete<any>(deleteUrl)
      .pipe(finalize(() => {
        this.isLoading = false;
        this.selectedDevice = null;
        this.updateFooterActions();
        this.cdr.markForCheck();
      }))
      .subscribe({
        next: (response) => {
          this.toastService.showSuccess(response?.TenKetQua || 'Xóa thiết bị thành công!');
          if (this.pagedDeviceData.length === 1 && this.currentPageIndex > 0) {
            this.currentPageIndex--;
          }
          this.triggerReload();
        },
        error: (error) => {
          const msg = error.error?.TenKetQua || error.error?.ErrorMessage || 'Xóa thất bại.';
          this.toastService.showError(msg, 0);
          console.error('Failed to delete device:', error);
        },
      });
  }

  // --- Helpers ---

  private updateFooterActions(): void {
    const isRowSelected = this.selectedDevice !== null;
    const actions: FooterAction[] = [
      {
        label: 'Tạo mới',
        icon: 'fas fa-plus',
        action: () => this.onCreate(),
        permission: 'QLThietBi.DMThietBi.RCREATE',
        className: 'btn-primary',
      },
      {
        label: 'Sửa',
        icon: 'fas fa-pencil-alt',
        action: () => this.onModify(this.selectedDevice!),
        permission: 'QLThietBi.DMThietBi.RMODIFY',
        className: 'btn-secondary',
        disabled: !isRowSelected,
      },
      {
        label: 'Xóa',
        icon: 'fas fa-trash-alt',
        action: () => this.onDelete(this.selectedDevice!),
        permission: 'QLThietBi.QLThietBiChiTiet.RDELETE',
        className: 'btn-danger',
        disabled: !isRowSelected,
      },
      {
        label: 'Xem',
        icon: 'fas fa-eye',
        action: () => this.onViewDetail(this.selectedDevice!),
        permission: 'QLThietBi.DMThietBi.RVIEW',
        className: 'btn-ghost',
        disabled: !isRowSelected,
      },
    ];
    this.footerService.setActions(actions);
  }

  private resetToFirstPage(): void {
    this.currentPageIndex = 0;
    this.triggerReload();
  }

  private triggerReload(): void {
    this.reloadTrigger$.next();
  }
}