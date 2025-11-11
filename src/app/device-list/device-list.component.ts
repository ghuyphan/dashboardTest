import { Component, OnInit, OnDestroy, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Subscription, finalize } from 'rxjs';

import {
  ReusableTableComponent,
  GridColumn,
  SortChangedEvent,
} from '../components/reusable-table/reusable-table.component';

import { FooterActionService } from '../services/footer-action.service';
import { FooterAction } from '../models/footer-action.model';
import { SearchService } from '../services/search.service';
import { environment } from '../../environments/environment.development';
import { ModalService } from '../services/modal.service';
import { DeviceFormComponent } from './device-form/device-form.component';
import { ToastService } from '../services/toast.service';
import { ConfirmationModalComponent } from '../components/confirmation-modal/confirmation-modal.component';
// --- ADDED: Import the Device model ---
import { Device } from '../models/device.model';

@Component({
  selector: 'app-device-list',
  standalone: true,
  imports: [CommonModule, ReusableTableComponent, DeviceFormComponent],
  templateUrl: './device-list.component.html',
  styleUrl: './device-list.component.scss',
})
export class DeviceListComponent implements OnInit, OnDestroy, AfterViewInit {
  // --- Grid Properties ---
  public deviceColumns: GridColumn[] = [];
  // --- MODIFIED: Use Device[] type ---
  public allDeviceData: Device[] = [];
  // --- MODIFIED: Use Device type ---
  public selectedDevice: Device | null = null;
  public isLoading: boolean = false;
  private deviceSub: Subscription | null = null;
  private searchSub: Subscription | null = null;
  public currentSearchTerm: string = '';

  constructor(
    private footerService: FooterActionService,
    private http: HttpClient,
    private searchService: SearchService,
    private modalService: ModalService,
    private toastService: ToastService
  ) {}

  ngOnInit(): void {
    this.deviceColumns = [
      { key: 'Ma', label: 'Mã Thiết Bị', sortable: true },
      { key: 'Ten', label: 'Tên Thiết Bị', sortable: true },
      // Note: The key 'TenLoaiThietBi' is not on the Device model, 
      // but the API GET request must be returning it. We'll cast to Device.
      { key: 'TenLoaiThietBi', label: 'Loại Thiết Bị', sortable: true },
      { key: 'TrangThai_Ten', label: 'Trạng Thái', sortable: true },
      { key: 'ViTri', label: 'Vị Trí', sortable: true },
      { key: 'Model', label: 'Model', sortable: true },
      { key: 'NgayMua', label: 'Ngày Mua', sortable: true },
      { key: 'GiaMua', label: 'Giá Mua', sortable: true },
      { key: 'actions', label: '', sortable: false, width: '40px' },
    ];

    this.updateFooterActions();
    this.searchSub = this.searchService.searchTerm$.subscribe((term) => {
      this.currentSearchTerm = term;
    });
  }

  ngAfterViewInit(): void {
    setTimeout(() => {
      this.loadDevices();
    }, 0);
  }

  ngOnDestroy(): void {
    this.footerService.clearActions();
    this.deviceSub?.unsubscribe();
    this.searchSub?.unsubscribe();
  }

  // --- MODIFIED: This function remains the same, but its usage is important ---
  private formatDate(dateString: string): string {
    if (!dateString) return '';
    try {
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

  private loadDevices(): void {
    this.isLoading = true;
    const url = environment.equipmentCatUrl;

    // --- MODIFIED: Still get<any[]> as API response may not perfectly match model (e.g., NgayTao)
    this.deviceSub = this.http
      .get<any[]>(url)
      .pipe(finalize(() => {
        this.isLoading = false;
      }))
      .subscribe({
        next: (data) => {
          // --- MODIFIED: Map and cast to Device[] ---
          const formattedData: Device[] = data.map((device) => ({
            ...device,
            // Keep your date formatting. This assumes API returns NgayTao,
            // even if not on the Device model, it will be on the object.
            NgayTao: this.formatDate(device.NgayTao),
            NgayMua: this.formatDate(device.NgayMua),
            NgayHetHanBH: this.formatDate(device.NgayHetHanBH),
          })) as Device[]; // Cast to Device[]
          
          this.allDeviceData = formattedData;
          console.log('Devices loaded and formatted:', formattedData);
        },
        error: (err) => {
          console.error('Failed to load devices:', err);
          this.toastService.showError('Không thể tải danh sách thiết bị.');
        },
      });
  }

  public onSortChanged(sortEvent: SortChangedEvent): void {
    console.log('Sort Changed (Handled by Table):', sortEvent);
  }

  // --- MODIFIED: Use Device type ---
  public onDeviceSelected(device: Device): void {
    this.selectedDevice = this.selectedDevice === device ? null : device;
    console.log('Selected device:', this.selectedDevice);
    this.updateFooterActions();
  }

  /**
   * --- UPDATED ---
   * This now includes the "Xóa" (Delete) button definition.
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
        label: 'Sửa',
        icon: 'fas fa-pencil-alt',
        action: () => this.onModify(this.selectedDevice!), // Pass non-null
        permission: 'QLThietBi.DMThietBi.RMODIFY',
        className: 'btn-secondary',
        disabled: !isRowSelected,
      },
      {
        label: 'Xóa',
        icon: 'fas fa-trash-alt',
        action: () => this.onDelete(this.selectedDevice!), // Pass non-null
        permission: 'QLThietBi.QLThietBiChiTiet.RDELETE', // Assuming this permission
        className: 'btn-danger',
        disabled: !isRowSelected,
      },
    ];
    this.footerService.setActions(actions);
  }

  /**
   * Handles click events from the ... menu on each row.
   * --- MODIFIED: Use Device type ---
   */
  public handleRowAction(event: { action: string; data: Device }): void {
    switch (event.action) {
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
    console.log('Create action triggered');

    this.modalService
      .open(DeviceFormComponent, {
        title: 'Tạo mới thiết bị',
        context: { device: null, title: 'Tạo mới Thiết bị' },
      })
      .subscribe((result) => {
        if (result) {
          console.log('Modal closed with new device:', result);
          this.loadDevices(); // Reload the list
        } else {
          console.log('Create modal was cancelled');
        }
      });
  }

  /**
   * Opens the modal in "Edit" mode.
   * --- MODIFIED: Use Device type ---
   */
  public onModify(device: Device): void {
    if (!device?.Id) return;
    this.isLoading = true;
    const fetchUrl = `${environment.equipmentCatUrl}/${device.Id}`;

    // API response for a single item is still an array [any]
    this.http
      .get<any[]>(fetchUrl)
      .pipe(finalize(() => (this.isLoading = false)))
      .subscribe({
        next: (response) => {
          const apiDevice = response[0]; 

          // --- MODIFIED: Map the API response to the Device model for the form ---
          const mappedDevice: Device = {
            ...apiDevice,
            // Map properties that are different in the GET /id response
            LoaiThietBi_Id: apiDevice.CategoryID,
            TrangThai_Id: apiDevice.TrangThai,
            // Ensure nulls are handled
            NgayMua: apiDevice.NgayMua || null,
            GiaMua: apiDevice.GiaMua || null,
            NgayHetHanBH: apiDevice.NgayHetHanBH || null,
            SerialNumber: apiDevice.SerialNumber || null,
            Model: apiDevice.Model || null,
            ViTri: apiDevice.ViTri || null,
            MoTa: apiDevice.MoTa || null,
            DeviceName: apiDevice.DeviceName || null,
          };

          console.log('Mapped device for edit:', mappedDevice);
          this.openEditModal(mappedDevice); // Pass mapped Device
        },
        error: (err) => {
          console.error('Failed to fetch device for edit:', err);
          this.toastService.showError(
            'Không thể tải thông tin thiết bị để chỉnh sửa.'
          );
        },
      });
  }

  // --- MODIFIED: Use Device type ---
  private openEditModal(device: Device): void {
    this.modalService
      .open(DeviceFormComponent, {
        title: `Sửa Thiết bị: ${device.Ten}`,
        context: { device, title: 'Sửa Thiết bị' }, // Pass Device to modal
      })
      .subscribe((result) => {
        if (result) {
          console.log('Modal closed with updated device:', result);
          this.loadDevices(); // Reload the list
        } else {
          console.log('Modify modal was cancelled');
        }
      });
  }

  /**
   * Opens a confirmation modal and deletes the device if confirmed.
   * --- MODIFIED: Use Device type ---
   */
  public onDelete(device: Device): void {
    if (!device) return;
    console.log('Delete action triggered for:', device.Ten);

    // 1. Open confirmation modal
    this.modalService
      .open(ConfirmationModalComponent, {
        title: 'Xác nhận Xóa',
        size: 'sm',
        context: {
          message: `Bạn có chắc chắn muốn xóa thiết bị "${device.Ten}" (Mã: ${device.Ma}) không? Hành động này không thể hoàn tác.`,
          confirmText: 'Xác nhận Xóa',
          cancelText: 'Hủy bỏ',
        },
      })
      .subscribe((confirmed) => {
        // 2. If user confirmed, proceed with deletion
        if (confirmed) {
          this.isLoading = true; // Show table spinner
          const deleteUrl = `${environment.equipmentCatUrl}/${device.Id}`;

          this.http
            .delete(deleteUrl)
            .pipe(
              finalize(() => {
                this.isLoading = false;
                // After deleting, clear selection and update footer
                this.selectedDevice = null;
                this.updateFooterActions();
              })
            )
            .subscribe({
              next: (response: any) => {
                const successMessage =
                  response?.TenKetQua || 'Xóa thiết bị thành công!';
                this.toastService.showSuccess(successMessage);
                this.loadDevices(); // Refresh the list
              },
              error: (err: HttpErrorResponse) => {
                const errorMessage =
                  err.error?.TenKetQua ||
                  err.error?.ErrorMessage ||
                  'Xóa thất bại. Đã có lỗi xảy ra.';
                this.toastService.showError(errorMessage, 0);
                console.error('Failed to delete device:', err);
              },
            });
        } else {
          console.log('Delete modal was cancelled');
        }
      });
  }
}