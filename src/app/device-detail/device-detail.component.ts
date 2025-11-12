import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule, DatePipe, CurrencyPipe } from '@angular/common';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Subscription, finalize, of, switchMap } from 'rxjs';
import { QRCodeComponent } from 'angularx-qrcode'; // <-- CORRECT IMPORT FOR STANDALONE

import { Device } from '../models/device.model';
import { environment } from '../../environments/environment.development';
import { FooterActionService } from '../services/footer-action.service';
import { ModalService } from '../services/modal.service';
import { ToastService } from '../services/toast.service';
import { FooterAction } from '../models/footer-action.model';
import { DeviceFormComponent } from '../device-list/device-form/device-form.component';
import { ConfirmationModalComponent } from '../components/confirmation-modal/confirmation-modal.component';

@Component({
  selector: 'app-device-detail',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    QRCodeComponent, // <-- IMPORT THE COMPONENT DIRECTLY
    DatePipe,
    CurrencyPipe
  ],
  templateUrl: './device-detail.component.html',
  styleUrl: './device-detail.component.scss'
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
    this.footerService.clearActions(); // Clear footer actions when leaving
  }

  loadDevice(id: string): void {
    this.isLoading = true;
    const url = `${environment.equipmentCatUrl}/${id}`;

    // Unsubscribe from previous load if any
    this.deviceSub?.unsubscribe();

    this.deviceSub = this.http.get<Device>(url).pipe(
      finalize(() => this.isLoading = false)
    ).subscribe({
      next: (data) => {
        this.device = data;
        
        // --- START OF CHANGE ---
        // Use the page's current URL for the QR Code
        this.qrCodeValue = window.location.href; 
        // --- END OF CHANGE ---

        this.setupFooterActions(this.device);
      },
      error: (err) => {
        console.error('Failed to load device details:', err);
        this.toastService.showError('Không thể tải chi tiết thiết bị.');
        this.goBack();
      }
    });
  }

  setupFooterActions(device: Device): void {
    const actions: FooterAction[] = [
      {
        label: 'Quay lại',
        icon: 'fas fa-arrow-left',
        action: () => this.goBack(),
        className: 'btn-secondary',
      },
      {
        label: 'In',
        icon: 'fas fa-print',
        action: () => this.onPrint(),
        permission: 'QLThietBi.DMThietBi.RPRINT', // Example permission
        className: 'btn-secondary',
      },
      {
        label: 'Sửa',
        icon: 'fas fa-pencil-alt',
        action: () => this.onEdit(device),
        permission: 'QLThietBi.DMThietBi.RMODIFY',
        className: 'btn-primary',
      },
      {
        label: 'Xóa',
        icon: 'fas fa-trash-alt',
        action: () => this.onDelete(device),
        permission: 'QLThietBi.QLThietBiChiTiet.RDELETE',
        className: 'btn-danger',
      }
    ];
    this.footerService.setActions(actions);
  }

  goBack(): void {
    this.router.navigate(['/app/equipment/catalog']);
  }

  onPrint(): void {
    window.print();
  }

  onEdit(device: Device): void {
    this.modalService.open(DeviceFormComponent, {
      title: `Sửa thiết bị`,
      context: { device: device, title: 'Sửa thiết bị' },
    }).subscribe((result) => {
      if (result) {
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
          this.toastService.showSuccess('Xóa thiết bị thành công!');
          this.goBack(); // Navigate back to the list
        }
      },
      error: (err: HttpErrorResponse) => {
        this.isLoading = false;
        const errorMessage = err.error?.TenKetQua || err.error?.ErrorMessage || 'Xóa thất bại. Đã có lỗi xảy ra.';
        this.toastService.showError(errorMessage, 0);
        console.error('Failed to delete device:', err);
      }
    });
  }

  // Helper to format dates from API
  formatDate(isoDate: string | null | undefined): string {
    if (!isoDate || isoDate === '0001-01-01T00:00:00') return 'N/A';
    // Use 'en-GB' for dd/MM/yyyy format, 'vi' locale might use '.'
    return new DatePipe('en-GB').transform(isoDate, 'dd/MM/yyyy') || 'N/A';
  }
}