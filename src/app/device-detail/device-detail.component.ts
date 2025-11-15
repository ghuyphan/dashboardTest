import { Component, OnInit, OnDestroy, ViewEncapsulation } from '@angular/core';
import { CommonModule, DatePipe, CurrencyPipe } from '@angular/common';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, Router } from '@angular/router';
// --- MODIFIED: Added 'map' ---
import { Subscription, finalize, of, switchMap, map } from 'rxjs';
import { QRCodeComponent } from 'angularx-qrcode'; // <-- CORRECT IMPORT FOR STANDALONE

import { Device } from '../models/device.model';
import { environment } from '../../environments/environment.development';
import { FooterActionService } from '../services/footer-action.service';
import { ModalService } from '../services/modal.service';
import { ToastService } from '../services/toast.service';
import { FooterAction } from '../models/footer-action.model';
import { DeviceFormComponent } from '../device-list/device-form/device-form.component';
import { ConfirmationModalComponent } from '../components/confirmation-modal/confirmation-modal.component';

// --- 1. IMPORT the new strategy ---
import { CustomRouteReuseStrategy } from '../custom-route-reuse-strategy'; // Adjust path if needed

@Component({
  selector: 'app-device-detail',
  standalone: true,
  imports: [
    CommonModule,
    QRCodeComponent,
    DatePipe,
    CurrencyPipe
  ],
  templateUrl: './device-detail.component.html',
  styleUrl: './device-detail.component.scss',
  encapsulation: ViewEncapsulation.None
})
export class DeviceDetailComponent implements OnInit, OnDestroy {
  public device: Device | null = null;
  public isLoading = true;
  public qrCodeValue: string = '';
  private routeSub: Subscription | null = null;
  private deviceSub: Subscription | null = null;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private http: HttpClient,
    private footerService: FooterActionService,
    private modalService: ModalService,
    private toastService: ToastService
  ) {}

  ngOnInit(): void {
    this.routeSub = this.route.params.subscribe(params => {
      const deviceId = params['id'];
      if (deviceId) {
        this.loadDevice(deviceId);
      } else {
        this.toastService.showError('Không tìm thấy ID thiết bị.');
        this.goBack();
      }
    });
  }

  ngOnDestroy(): void {
    this.routeSub?.unsubscribe();
    this.deviceSub?.unsubscribe();
    // --- THIS LINE IS THE FIX: IT IS REMOVED ---
    // this.footerService.clearActions(); 
  }

  // --- MODIFIED: (Suggestion 3) ---
  loadDevice(id: string): void {
    this.isLoading = true;
    const url = `${environment.equipmentCatUrl}/${id}`;

    // Unsubscribe from previous load if any
    this.deviceSub?.unsubscribe();

    this.deviceSub = this.http.get<Device[]>(url).pipe(
      map(dataArray => {
        if (dataArray && dataArray.length > 0) {
          return dataArray[0]; // Transform the array to a single device
        }
        // If API returns empty array or null, throw an error
        throw new Error('Không tìm thấy chi tiết cho thiết bị này.');
      }),
      finalize(() => this.isLoading = false)
    ).subscribe({
      next: (device) => {
        this.device = device; // The device is now guaranteed to exist
        this.qrCodeValue = window.location.href; 
        this.setupFooterActions(this.device);
      },
      error: (err: Error) => { // Catch the error thrown from the map operator
        console.error('Failed to load device details:', err);
        this.toastService.showError(err.message || 'Không thể tải chi tiết thiết bị.');
        this.goBack();
      }
    });
  }
  // --- END MODIFICATION ---

  setupFooterActions(device: Device): void {
    const actions: FooterAction[] = [
      {
        label: 'Sửa',
        icon: 'fas fa-pencil-alt',
        action: () => this.onEdit(device),
        permission: 'QLThietBi.DMThietBi.RMODIFY',
        className: 'btn-secondary', 
      },
      {
        label: 'Xóa',
        icon: 'fas fa-trash-alt',
        action: () => this.onDelete(device),
        permission: 'QLThietBi.QLThietBiChiTiet.RDELETE',
        className: 'btn-danger',
      },
            {
        label: 'In',
        icon: 'fas fa-print',
        action: () => this.onPrint(),
        permission: 'QLThietBi.DMThietBi.RPRINT', // Example permission
        className: 'btn-ghost',
      },
    ];
    this.footerService.setActions(actions);
  }

  goBack(): void {
    this.router.navigate(['/app/equipment/catalog']);
  }

  onPrint(): void {
    // Give the browser a moment to prepare the print layout
    setTimeout(() => {
      window.print();
    }, 100);
  }

  onEdit(device: Device): void {
    this.modalService.open(DeviceFormComponent, {
      title: `Sửa thiết bị`,
      context: { device: { ...device }, title: 'Sửa thiết bị' }, // Pass a copy
    }).subscribe((result) => {
      if (result) {
        // --- CLEAR CACHE on success ---
        CustomRouteReuseStrategy.clearCache('equipment/catalog');
        
        this.toastService.showSuccess('Cập nhật thiết bị thành công.');
        this.loadDevice(device.Id!.toString()); // Reload data
      }
    });
  }

  onDelete(device: Device): void {
    this.modalService.open(ConfirmationModalComponent, {
      title: 'Xác nhận Xóa',
      size: 'sm',
      context: {
        message: `Bạn có chắc chắn muốn xóa thiết bị "${device.Ten}" (Mã: ${device.Ma}) không?`,
        confirmText: 'Xác nhận Xóa',
        cancelText: 'Hủy bỏ'
      }
    }).pipe(
      switchMap(confirmed => {
        if (confirmed) {
          this.isLoading = true;
          const deleteUrl = `${environment.equipmentCatUrl}/${device.Id}`;
          return this.http.delete(deleteUrl);
        }
        return of(null); // Return an empty observable if not confirmed
      })
    ).subscribe({
      next: (response) => {
        if (response) {
          // --- CLEAR CACHE on success ---
          CustomRouteReuseStrategy.clearCache('equipment/catalog');
          
          this.toastService.showSuccess('Xóa thiết bị thành công!');
          this.goBack(); // Navigate back to the list
        }
      },
      error: (err: HttpErrorResponse) => {
        this.isLoading = false;
        const errorMessage = err.error?.TenKetQua || err.error?.ErrorMessage || 'Xóa thất bại. Đã có lỗi xảy ra.';
        this.toastService.showError(errorMessage, 0);
        console.error('Failed to delete device:', err);
      },
      complete: () => {
        this.isLoading = false;
      }
    });
  }

  // Helper to format dates from API
  formatDate(isoDate: string | null | undefined): string {
    if (!isoDate || isoDate === '0001-01-01T00:00:00') return 'N/A';
    // Use 'en-GB' for dd/MM/yyyy format, 'vi' locale might use '.'
    return new DatePipe('en-GB').transform(isoDate, 'dd/MM/yyyy') || 'N/A';
  }

  /**
   * Returns the correct CSS class for a given status string.
   * (Copied from reusable-table.component)
   */
  public getStatusClass(status: string | null | undefined): string {
    if (!status) return 'status-default';
    const lowerStatus = status.toLowerCase();

    if (lowerStatus.includes('đang sử dụng')) return 'status-in-use';
    if (lowerStatus.includes('sẵn sàng')) return 'status-ready';
    if (lowerStatus.includes('bảo trì') || lowerStatus.includes('sửa chữa')) return 'status-repair';
    if (lowerStatus.includes('hỏng') || lowerStatus.includes('thanh lý')) return 'status-broken';

    return 'status-default';
  }

  // --- NEW: (Suggestion 2) ---
  /**
   * Returns a Font Awesome icon class based on the device type.
   */
  public getDeviceIconClass(deviceType: string | null | undefined): string {
    if (!deviceType) return 'fas fa-question-circle'; // Default icon
    
    const lowerType = deviceType.toLowerCase();

    if (lowerType.includes('laptop') || lowerType.includes('máy tính')) {
      return 'fas fa-laptop-medical';
    }
    if (lowerType.includes('printer') || lowerType.includes('máy in')) {
      return 'fas fa-print';
    }
    if (lowerType.includes('server') || lowerType.includes('máy chủ')) {
      return 'fas fa-server';
    }
    if (lowerType.includes('monitor') || lowerType.includes('màn hình')) {
      return 'fas fa-desktop';
    }
    if (lowerType.includes('phone') || lowerType.includes('điện thoại')) {
      return 'fas fa-mobile-alt';
    }
    
    return 'fas fa-hdd'; // A good generic hardware icon
  }
}