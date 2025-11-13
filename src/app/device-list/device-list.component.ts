import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Subscription, Subject, of, Observable } from 'rxjs';
// --- 1. IMPORT filter and skip ---
import { finalize, switchMap, tap, catchError, startWith, debounceTime, skip, filter } from 'rxjs/operators';
// --- 2. IMPORT NavigationEnd ---
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

/**
 * Defines the expected shape of the paged API response.
 */
export interface PagedResult<T> {
  Items: T[];
  TotalCount: number;
}

@Component({
  selector: 'app-device-list',
  standalone: true,
  imports: [CommonModule, ReusableTableComponent, DeviceFormComponent],
  templateUrl: './device-list.component.html',
  styleUrl: './device-list.component.scss',
})
export class DeviceListComponent implements OnInit, OnDestroy {
  // --- Grid Properties ---
  public deviceColumns: GridColumn[] = [];
  public isLoading: boolean = true;
  
  // --- Paged Data ---
  public pagedDeviceData: Device[] = [];
  public totalDeviceCount: number = 0;

  // --- Paging & Sorting State ---
  public currentPageIndex: number = 0; // MatPaginator is 0-indexed
  public currentPageSize: number = 15; // Default page size
  public currentSortColumn: string = 'Id';
  public currentSortDirection: SortDirection = 'asc';
  public currentSearchTerm: string = '';

  // --- Subscriptions ---
  private dataLoadSub: Subscription | null = null;
  private searchSub: Subscription | null = null;
  // --- 3. ADD a subscription for the router ---
  private routerSub: Subscription | null = null; 

  // --- Event Triggers ---
  /** Triggers the data loading pipeline to re-run */
  private reloadTrigger = new Subject<void>();

  public selectedDevice: any | null = null;

  constructor(
    private footerService: FooterActionService,
    private http: HttpClient,
    private searchService: SearchService,
    private modalService: ModalService,
    private toastService: ToastService,
    private router: Router
  ) {}

  ngOnInit(): void {
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

    // Listen for search term changes from the header
    this.searchSub = this.searchService.searchTerm$.pipe(
      // We no longer skip(1) because the header component now
      // subscribes first and holds the initial value,
      // so this subscription will receive the correct current term.
      // skip(1), 
      debounceTime(300) // Wait 300ms after user stops typing
    ).subscribe((term) => {
      // Only trigger a reload if the term has actually changed
      if (term !== this.currentSearchTerm) {
        this.currentSearchTerm = term;
        this.currentPageIndex = 0; // Reset to first page on new search
        this.reloadTrigger.next(); // Trigger a reload
      }
    });

    // Main data loading pipeline
    this.dataLoadSub = this.reloadTrigger.pipe(
      startWith(null), // Trigger initial load on component init
      tap(() => {
        this.isLoading = true;
        this.selectedDevice = null; // Clear selection on reload
        this.updateFooterActions();
      }),
      // Switch to the loadDevices API call
      switchMap(() => this.loadDevices()) 
    ).subscribe();

    // --- 4. ADD THIS SUBSCRIPTION ---
    // This listens for when we navigate *back* to this component
    this.routerSub = this.router.events.pipe(
      filter(event => event instanceof NavigationEnd)
    ).subscribe((event: any) => {
      // --- 5. THE CRITICAL FIX ---
      // Check for an EXACT URL match, not just 'includes'
      if (event.urlAfterRedirects === '/app/equipment/catalog') {
        // Re-set the footer actions
        this.updateFooterActions();
      }
    });
  }

  ngOnDestroy(): void {
    this.footerService.clearActions();
    this.dataLoadSub?.unsubscribe();
    this.searchSub?.unsubscribe();
    // --- 6. UNUBSCRIBE from the router ---
    this.routerSub?.unsubscribe();
  }

  /**
   * Formats a date string from the API.
   */
  private formatDate(dateString: string | null | undefined): string {
    if (!dateString) return '';
    try {
      // Check if the string already contains "dd/MM/yyyy"
      if (dateString.includes('/') && dateString.length >= 10) {
        // If it's already in the correct format (like from API response), just return the date part
        return dateString.substring(0, 10);
      }
      
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return '';
      const day = date.getDate().toString().padStart(2, '0');
      const month = (date.getMonth() + 1).toString().padStart(2, '0');
      const year = date.getFullYear();
      return `${day}/${month}/${year}`;
    } catch (error) {
      console.error('Error formatting date:', dateString, error);
      return dateString;
    }
  }

  /**
   * Fetches paged device data from the backend.
   */
  private loadDevices(): Observable<any> {
    // API uses 1-based indexing for PageNumber
    const pageNumber = this.currentPageIndex + 1;

    // --- YOUR NEW LOGIC ---
    let url: string;
    let params: HttpParams;

    if (this.currentSearchTerm) {
      // 1. Use the SEARCH endpoint
      url = `${environment.equipmentCatUrl}/page/search`;
      params = new HttpParams()
        .set('PageNumber', pageNumber.toString())
        .set('PageSize', this.currentPageSize.toString())
        .set('sortColumn', this.currentSortColumn)
        .set('sortDirection', this.currentSortDirection)
        .set('TextSearch', this.currentSearchTerm);

    } else {
      // 2. Use the normal PAGING endpoint
      url = `${environment.equipmentCatUrl}/page`;
      params = new HttpParams()
        .set('PageNumber', pageNumber.toString())
        .set('PageSize', this.currentPageSize.toString())
        .set('sortColumn', this.currentSortColumn)
        .set('sortDirection', this.currentSortDirection);
        // No 'filter' or 'TextSearch' parameter when search term is empty
    }
    // --- END OF YOUR LOGIC ---

    return this.http.get<PagedResult<Device>>(url, { params }).pipe(
      tap((response) => {
        const formattedData = response.Items.map((device) => ({
          ...device,
          NgayTao: this.formatDate(device.NgayTao), // This now works
          NgayMua: this.formatDate(device.NgayMua),
          NgayHetHanBH: this.formatDate(device.NgayHetHanBH)
        }));
        
        this.pagedDeviceData = formattedData;
        this.totalDeviceCount = response.TotalCount;

        console.log('total devices:', this.totalDeviceCount)
        
        this.isLoading = false;
        console.log('Paged devices loaded:', response);
      }),
      catchError((err: HttpErrorResponse) => {
        console.error('Failed to load devices:', err);
        this.toastService.showError('Không thể tải danh sách thiết bị.');
        this.isLoading = false;
        this.pagedDeviceData = []; // Clear data on error
        this.totalDeviceCount = 0; // Reset count on error
        return of(null); // Handle error gracefully
      })
    );
  }

  /**
   * Handles sort changes from the table component.
   */
  public onSortChanged(sortEvent: SortChangedEvent): void {
    this.currentSortColumn = sortEvent.column;
    this.currentSortDirection = sortEvent.direction;
    this.currentPageIndex = 0; // Reset to first page
    this.reloadTrigger.next();
  }

  /**
   * Handles page changes from the table component.
   */
  public onPageChanged(pageEvent: PageEvent): void {
    this.currentPageIndex = pageEvent.pageIndex;
    this.currentPageSize = pageEvent.pageSize;
    this.reloadTrigger.next();
    
    // --- START OF MODIFICATION ---
    // This line was causing the error and is not needed here,
    // as the reusable-table component handles its own scrolling.
    // if (this.tableContainer?.nativeElement) {
    //   this.tableContainer.nativeElement.scrollTop = 0;
    // }
    // --- END OF MODIFICATION ---
  }

  /**
   * Handles row selection from the table component.
   */
  public onDeviceSelected(device: any): void {
    this.selectedDevice = this.selectedDevice === device ? null : device;
    console.log('Selected device:', this.selectedDevice);
    this.updateFooterActions();
  }

  /**
   * Updates the footer buttons based on selection state.
   */
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
        label: 'Xem',
        icon: 'fas fa-eye',
        action: () => this.onViewDetail(this.selectedDevice),
        permission: 'QLThietBi.DMThietBi.RVIEW',
        className: 'btn-secondary',
        disabled: !isRowSelected,
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
      }
    ];
    this.footerService.setActions(actions);
  }

  /**
   * Navigates to the detail page for the selected device.
   */
  public onViewDetail(device: any): void {
    if (!device) return;
    this.router.navigate(['/app/equipment/catalog', device.Id]);
  }

  /**
   * Handles action menu clicks from the table rows.
   */
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

  /**
   * Opens the modal in "Create" mode.
   */
  public onCreate(): void {
    this.modalService
      .open(DeviceFormComponent, {
        title: 'Tạo mới thiết bị',
        context: { device: null, title: 'Tạo mới Thiết bị' },
      })
      .subscribe((result) => {
        if (result) {
          this.toastService.showSuccess('Tạo mới thiết bị thành công.');
          this.currentPageIndex = 0; // Go to first page to see new item
          this.reloadTrigger.next(); // Reload data
        }
      });
  }

  /**
   * Opens the modal in "Edit" mode.
   */
  public onModify(device: any): void {
    if (!device) return;

    this.modalService
      .open(DeviceFormComponent, {
        title: `Sửa thiết bị`,
        // Pass a copy to avoid mutating the table data before save
        context: { device: { ...device }, title: 'Sửa thiết bị' }, 
      })
      .subscribe((result) => {
        if (result) {
          this.toastService.showSuccess('Cập nhật thiết bị thành công.');
          this.reloadTrigger.next(); // Reload current page
        }
      });
  }

  /**
   * Opens a confirmation modal and deletes the device if confirmed.
   */
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
        this.isLoading = true; // Show table spinner
        const deleteUrl = `${environment.equipmentCatUrl}/${device.Id}`;

        this.http.delete(deleteUrl)
          .pipe(finalize(() => {
            this.isLoading = false;
            this.selectedDevice = null;
            this.updateFooterActions();
          }))
          .subscribe({
            next: (response: any) => {
              const successMessage = response?.TenKetQua || 'Xóa thiết bị thành công!';
              this.toastService.showSuccess(successMessage);
              
              // Check if it was the last item on the current page
              if (this.pagedDeviceData.length === 1 && this.currentPageIndex > 0) {
                this.currentPageIndex--; // Go back one page
              }

              this.reloadTrigger.next(); // Refresh the list
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

  /**
   * Called when the "Reset Search" button is clicked in the reusable table.
   */
  public onSearchCleared(): void {
    // Calling this will trigger the searchSub subscription,
    // which will set this.currentSearchTerm = '' and reload the table.
    // It will ALSO trigger the subscription in the header to clear its input.
    this.searchService.setSearchTerm('');
  }
}