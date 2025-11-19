import { Component, OnInit, OnDestroy, ViewEncapsulation, Inject } from '@angular/core';
import { CommonModule, DatePipe, CurrencyPipe, DOCUMENT } from '@angular/common';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription, finalize, map, switchMap, of } from 'rxjs';
import { QRCodeComponent } from 'angularx-qrcode';

import { Device } from '../models/device.model';
import { environment } from '../../environments/environment.development';
import { FooterActionService } from '../services/footer-action.service';
import { ModalService } from '../services/modal.service';
import { ToastService } from '../services/toast.service';
import { FooterAction } from '../models/footer-action.model';
import { DeviceFormComponent } from '../device-list/device-form/device-form.component';
import { ConfirmationModalComponent } from '../components/confirmation-modal/confirmation-modal.component';
import { WordExportService } from '../services/word-export.service';
import { CustomRouteReuseStrategy } from '../custom-route-reuse-strategy';
import { DocxPrintViewerComponent } from '../components/docx-print-viewer/docx-print-viewer.component';
import { DateUtils } from '../utils/date.utils'; // <--- IMPORT DATE UTILS

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

  public isWarrantyExpiring: boolean = false;
  public warrantyExpiresInDays: number = 0;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private http: HttpClient,
    private footerService: FooterActionService,
    private modalService: ModalService,
    private toastService: ToastService,
    private wordExportService: WordExportService,
    @Inject(DOCUMENT) private document: Document
  ) { }

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
  }

  loadDevice(id: string): void {
    this.isLoading = true;
    const url = `${environment.equipmentCatUrl}/${id}`;

    this.deviceSub?.unsubscribe();

    this.deviceSub = this.http.get<Device[]>(url).pipe(
      map(dataArray => {
        if (dataArray && dataArray.length > 0) {
          return dataArray[0];
        }
        throw new Error('Không tìm thấy chi tiết cho thiết bị này.');
      }),
      finalize(() => this.isLoading = false)
    ).subscribe({
      next: (device) => {
        this.device = device;
        this.qrCodeValue = window.location.href;

        this.setupFooterActions(this.device);
        this.checkWarrantyStatus(this.device);
      },
      error: (err: Error) => {
        console.error('Failed to load device details:', err);
        this.toastService.showError(err.message || 'Không thể tải chi tiết thiết bị.');
        this.goBack();
      }
    });
  }

  // Removed private parseDate(...)

  private checkWarrantyStatus(device: Device): void {
    this.isWarrantyExpiring = false;
    this.warrantyExpiresInDays = 0;

    if (!device.NgayHetHanBH) {
      return;
    }

    try {
      // Use DateUtils.parse instead of local method
      const expiryDate = DateUtils.parse(device.NgayHetHanBH);
      if (!expiryDate) return;

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const msPerDay = 1000 * 60 * 60 * 24;
      const timeDiff = expiryDate.getTime() - today.getTime();
      const daysDiff = Math.ceil(timeDiff / msPerDay);

      if (daysDiff >= 0 && daysDiff <= 30) {
        this.isWarrantyExpiring = true;
        this.warrantyExpiresInDays = daysDiff;
      }
    } catch (e) {
      console.error('Error checking warranty status', e);
    }
  }

  // ... rest of the code remains the same

  formatDate(isoDate: string | null | undefined): string {
    // Use DateUtils for consistent formatting
    return DateUtils.formatToDisplay(isoDate);
  }

  // ... getStatusClass, getDeviceIconClass etc.
  public getStatusClass(status: string | null | undefined): string {
    if (!status) return 'status-default';
    const lower = status.toLowerCase();

    if (lower.includes('đang sử dụng')) return 'status-in-use';
    if (lower.includes('sẵn sàng')) return 'status-ready';
    if (lower.includes('đang bảo trì') || lower.includes('đang sửa chữa')) return 'status-maintenance';
    if (lower.includes('bảo trì') || lower.includes('sửa chữa')) return 'status-repair';
    if (lower.includes('hỏng') || lower.includes('thanh lý')) return 'status-broken';
    return 'status-default';
  }

  public getDeviceIconClass(deviceType: string | null | undefined): string {
    if (!deviceType) return 'fas fa-question-circle';
    const lower = deviceType.toLowerCase();
    if (lower.includes('laptop') || lower.includes('máy tính')) return 'fas fa-laptop-medical';
    if (lower.includes('printer') || lower.includes('máy in')) return 'fas fa-print';
    if (lower.includes('server') || lower.includes('máy chủ')) return 'fas fa-server';
    if (lower.includes('monitor')) return 'fas fa-desktop';
    return 'fas fa-hdd';
  }

  // --- Other methods (onPrintWordReport, onPrintQrCode, setupFooterActions, goBack, onEdit, onDelete) ---
  // Paste the rest of the original file content here if copying, or just ensure they are preserved.
  // For brevity, I assumed the existing methods are kept as is.
  onPrintWordReport(device: Device): void {
    if (!device) return;
    this.isLoading = true;

    const templatePath = 'assets/templates/01-10-2025 - Bien ban ban giao- Signpad - Khoa CĐHA.docx';
    const reportData = {
      ...device,
      PrintDate: new Date().toLocaleDateString('vi-VN'),
      GiaMuaFormatted: new Intl.NumberFormat('vi-VN', {
        style: 'currency',
        currency: 'VND'
      }).format(device.GiaMua || 0),
      Model: device.Model || '',
      SerialNumber: device.SerialNumber || '',
      ViTri: device.ViTri || '',
      TrangThai_Ten: device.TrangThai_Ten || '',
      MoTa: device.MoTa || ''
    };

    this.wordExportService.generateReportBlob(templatePath, reportData)
      .pipe(finalize(() => this.isLoading = false))
      .subscribe({
        next: (blob) => {
          this.modalService.open(DocxPrintViewerComponent, {
            title: 'Xem trước bản in',
            size: 'lg',
            hideHeader: true,
            disableBackdropClose: true,
            context: {
              docBlob: blob,
              fileName: `Bien_Ban_${device.Ma}.docx`
            }
          });
        },
        error: (err) => {
          this.toastService.showError('Không thể tạo báo cáo: ' + err.message);
        }
      });
  }

  onPrintQrCode(): void {
    this.document.body.classList.add('print-mode-qr');
    window.print();
    setTimeout(() => {
      this.document.body.classList.remove('print-mode-qr');
    }, 500);
  }

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
        label: 'In Mã QR',
        icon: 'fas fa-qrcode',
        action: () => this.onPrintQrCode(),
        permission: 'QLThietBi.DMThietBi.RPRINT',
        className: 'btn-ghost',
      },
      {
        label: 'In Biên Bản',
        icon: 'fas fa-file-word',
        action: () => this.onPrintWordReport(device),
        permission: 'QLThietBi.DMThietBi.RPRINT',
        className: 'btn-primary',
      },
    ];
    this.footerService.setActions(actions);
  }

  goBack(): void {
    this.router.navigate(['/app/equipment/catalog']);
  }

  onEdit(device: Device): void {
    this.modalService.open(DeviceFormComponent, {
      title: `Sửa thiết bị`,
      context: { device: { ...device }, title: 'Sửa thiết bị' },
    }).subscribe((result) => {
      if (result) {
        CustomRouteReuseStrategy.clearCache('equipment/catalog');
        this.loadDevice(device.Id!.toString());
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
        return of(null);
      })
    ).subscribe({
      next: (response) => {
        if (response) {
          CustomRouteReuseStrategy.clearCache('equipment/catalog');
          this.toastService.showSuccess('Xóa thiết bị thành công!');
          this.goBack();
        }
      },
      error: (err: HttpErrorResponse) => {
        this.isLoading = false;
        this.toastService.showError(err.error?.TenKetQua || 'Xóa thất bại.', 0);
      },
      complete: () => {
        this.isLoading = false;
      }
    });
  }
}