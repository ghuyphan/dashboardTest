import { Component, OnInit, OnDestroy, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Subscription, Subject, of, Observable } from 'rxjs';
import { finalize, switchMap, tap, catchError, startWith, debounceTime, skip, filter } from 'rxjs/operators';
import { Router, NavigationEnd } from '@angular/router';
import { PageEvent } from '@angular/material/paginator';

import {
  ReusableTableComponent,
  GridColumn,
  SortChangedEvent,
  SortDirection,
} from '../components/reusable-table/reusable-table.component';

import { FooterActionService } from '../services/footer-action.service';
import { FooterAction } from '../models/footer-action.model';
import { SearchService } from '../services/search.service';
import { environment } from '../../environments/environment.development';
import { ModalService } from '../services/modal.service';
import { DeviceFormComponent } from './device-form/device-form.component';
import { ToastService } from '../services/toast.service';
import { ConfirmationModalComponent } from '../components/confirmation-modal/confirmation-modal.component';
import { Device } from '../models/device.model';

export interface PagedResult<T> {
  Items: T[];
  TotalCount: number;
}

@Component({
  selector: 'app-device-list',
  standalone: true,
  imports: [CommonModule, ReusableTableComponent],
  templateUrl: './device-list.component.html',
  styleUrl: './device-list.component.scss',
  // PERFORMANCE FIX: Enable OnPush. This drastically reduces "Main thread work"
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class DeviceListComponent implements OnInit, OnDestroy {
  public deviceColumns: GridColumn[] = [];
  public isLoading: boolean = true;

  public pagedDeviceData: Device[] = [];
  public totalDeviceCount: number = 0;

  public currentPageIndex: number = 0;
  public currentPageSize: number = 25;
  public currentSortColumn: string = 'Id';
  public currentSortDirection: SortDirection = 'asc';
  public currentSearchTerm: string = '';

  private dataLoadSub: Subscription | null = null;
  private searchSub: Subscription | null = null;
  private routerSub: Subscription | null = null;

  private reloadTrigger = new Subject<void>();

  public selectedDevice: any | null = null;

  constructor(
    private footerService: FooterActionService,
    private http: HttpClient,
    private searchService: SearchService,
    private modalService: ModalService,
    private toastService: ToastService,
    private router: Router,
    // PERFORMANCE FIX: Inject ChangeDetectorRef to manually mark view dirty when data arrives
    private cdr: ChangeDetectorRef 
  ) { }

  ngOnInit(): void {
    // Define columns once
    this.deviceColumns = [
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
      { key: 'actions', label: '', sortable: false, width: '60px' }
    ];

    this.updateFooterActions();

    this.searchSub = this.searchService.searchTerm$.pipe(
      debounceTime(500)
    ).subscribe((term) => {
      if (term !== this.currentSearchTerm) {
        this.currentSearchTerm = term;
        this.currentPageIndex = 0;
        this.reloadTrigger.next();
      }
    });

    this.dataLoadSub = this.reloadTrigger.pipe(
      startWith(null),
      tap(() => {
        this.isLoading = true;
        this.selectedDevice = null;
        this.updateFooterActions();
        // PERFORMANCE FIX: Tell Angular UI needs update
        this.cdr.markForCheck(); 
      }),
      switchMap(() => this.loadDevices())
    ).subscribe();

    this.routerSub = this.router.events.pipe(
      filter(event => event instanceof NavigationEnd)
    ).subscribe((event: any) => {
      if (event.urlAfterRedirects === '/app/equipment/catalog') {
        this.updateFooterActions();
        // PERFORMANCE FIX: Ensure footer updates visually
        this.cdr.markForCheck(); 
      }
    });
  }

  ngOnDestroy(): void {
    this.footerService.clearActions();
    this.dataLoadSub?.unsubscribe();
    this.searchSub?.unsubscribe();
    this.routerSub?.unsubscribe();
  }

  private formatDate(dateString: string | null | undefined): string {
    if (!dateString) return '';
    // Simple optimization: Avoid Date object creation if possible
    if (dateString.length >= 10 && (dateString.includes('/') || dateString.includes('-'))) {
       // If it looks like ISO (yyyy-mm-dd), we might want to transform it, 
       // but typically formatted strings from API can be returned directly 
       // if format is acceptable.
       // For this specific case, your existing logic is fine, just wrapping try-catch
       try {
          const date = new Date(dateString);
          if (isNaN(date.getTime())) return dateString;
          const day = date.getDate().toString().padStart(2, '0');
          const month = (date.getMonth() + 1).toString().padStart(2, '0');
          const year = date.getFullYear();
          return `${day}/${month}/${year}`;
       } catch {
          return dateString;
       }
    }
    return '';
  }

  private loadDevices(): Observable<any> {
    const pageNumber = this.currentPageIndex + 1;
    let url: string;
    let params: HttpParams = new HttpParams()
      .set('PageNumber', pageNumber.toString())
      .set('PageSize', this.currentPageSize.toString())
      .set('sortColumn', this.currentSortColumn)
      .set('sortDirection', this.currentSortDirection);

    if (this.currentSearchTerm) {
      url = `${environment.equipmentCatUrl}/page/search`;
      params = params.set('TextSearch', this.currentSearchTerm);
    } else {
      url = `${environment.equipmentCatUrl}/page`;
    }

    return this.http.get<PagedResult<Device>>(url, { params }).pipe(
      tap((response) => {
        const formattedData = response.Items.map((device) => ({
          ...device,
          // Optimization: Move formatting to pipe in HTML if possible, but logic here is okay
          NgayTao: this.formatDate(device.NgayTao), 
          NgayMua: this.formatDate(device.NgayMua),
          NgayHetHanBH: this.formatDate(device.NgayHetHanBH)
        }));

        this.pagedDeviceData = formattedData;
        this.totalDeviceCount = response.TotalCount;
        this.isLoading = false;
        
        // PERFORMANCE FIX: Mark dirty so OnPush renders the new data
        this.cdr.markForCheck();
      }),
      catchError((err: HttpErrorResponse) => {
        console.error('Failed to load devices:', err);
        this.isLoading = false;
        this.pagedDeviceData = [];
        this.totalDeviceCount = 0;
        // PERFORMANCE FIX
        this.cdr.markForCheck();
        return of(null);
      })
    );
  }

  public onSortChanged(sortEvent: SortChangedEvent): void {
    this.currentSortColumn = sortEvent.column;
    this.currentSortDirection = sortEvent.direction;
    this.currentPageIndex = 0;
    this.reloadTrigger.next();
  }

  public onPageChanged(pageEvent: PageEvent): void {
    this.currentPageIndex = pageEvent.pageIndex;
    this.currentPageSize = pageEvent.pageSize;
    this.reloadTrigger.next();
  }

  public onDeviceSelected(device: any): void {
    this.selectedDevice = this.selectedDevice === device ? null : device;
    this.updateFooterActions();
    // PERFORMANCE FIX: Update UI for footer buttons state
    this.cdr.markForCheck();
  }

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
        action: () => this.onModify(this.selectedDevice),
        permission: 'QLThietBi.DMThietBi.RMODIFY',
        className: 'btn-secondary',
        disabled: !isRowSelected,
      },
      {
        label: 'Xóa',
        icon: 'fas fa-trash-alt',
        action: () => this.onDelete(this.selectedDevice),
        permission: 'QLThietBi.QLThietBiChiTiet.RDELETE',
        className: 'btn-danger',
        disabled: !isRowSelected,
      },
      {
        label: 'Xem',
        icon: 'fas fa-eye',
        action: () => this.onViewDetail(this.selectedDevice),
        permission: 'QLThietBi.DMThietBi.RVIEW',
        className: 'btn-ghost',
        disabled: !isRowSelected,
      },
    ];
    this.footerService.setActions(actions);
  }

  public onViewDetail(device: any): void {
    if (!device) return;
    this.router.navigate(['/app/equipment/catalog', device.Id]);
  }

  public handleRowAction(event: { action: string, data: any }): void {
    switch (event.action) {
      case 'view':
        this.onViewDetail(event.data);
        break;
      case 'edit':
        this.onModify(event.data);
        break;
      case 'delete':
        this.onDelete(event.data);
        break;
    }
  }

  public onCreate(): void {
    this.modalService
      .open(DeviceFormComponent, {
        title: 'Tạo mới thiết bị',
        context: { device: null, title: 'Tạo mới Thiết bị' },
      })
      .subscribe((result) => {
        if (result) {
          this.toastService.showSuccess('Tạo mới thiết bị thành công.');
          this.currentPageIndex = 0;
          this.reloadTrigger.next();
        }
      });
  }

  public onModify(device: any): void {
    if (!device) return;
    this.modalService
      .open(DeviceFormComponent, {
        title: `Sửa thiết bị`,
        context: { device: { ...device }, title: 'Sửa thiết bị' },
      })
      .subscribe((result) => {
        if (result) {
          // this.toastService.showSuccess('Cập nhật thiết bị thành công.');
          this.reloadTrigger.next();
        }
      });
  }

  public onDelete(device: any): void {
    if (!device) return;
    this.modalService.open(ConfirmationModalComponent, {
      title: 'Xác nhận Xóa',
      size: 'sm',
      context: {
        message: `Bạn có chắc chắn muốn xóa thiết bị "${device.Ten}" (Mã: ${device.Ma}) không? Hành động này không thể hoàn tác.`,
        confirmText: 'Xác nhận Xóa',
        cancelText: 'Hủy bỏ'
      }
    }).subscribe(confirmed => {
      if (confirmed) {
        this.isLoading = true;
        this.cdr.markForCheck(); // Ensure spinner shows

        const deleteUrl = `${environment.equipmentCatUrl}/${device.Id}`;
        this.http.delete(deleteUrl)
          .pipe(finalize(() => {
            this.isLoading = false;
            this.selectedDevice = null;
            this.updateFooterActions();
            this.cdr.markForCheck(); // Ensure spinner hides
          }))
          .subscribe({
            next: (response: any) => {
              const successMessage = response?.TenKetQua || 'Xóa thiết bị thành công!';
              this.toastService.showSuccess(successMessage);
              if (this.pagedDeviceData.length === 1 && this.currentPageIndex > 0) {
                this.currentPageIndex--;
              }
              this.reloadTrigger.next();
            },
            error: (err: HttpErrorResponse) => {
              const errorMessage = err.error?.TenKetQua || err.error?.ErrorMessage || 'Xóa thất bại. Đã có lỗi xảy ra.';
              this.toastService.showError(errorMessage, 0);
              console.error('Failed to delete device:', err);
            }
          });
      }
    });
  }

  public onSearchCleared(): void {
    this.searchService.setSearchTerm('');
  }
}