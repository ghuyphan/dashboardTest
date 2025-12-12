import {
  Component,
  OnInit,
  ViewEncapsulation,
  Inject,
  inject,
  DestroyRef,
} from '@angular/core';
import { CommonModule, CurrencyPipe, DOCUMENT } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { finalize, switchMap, of } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { QRCodeComponent } from 'angularx-qrcode';

import { Device } from '../../../shared/models/device.model';
import { FooterActionService } from '../../../core/services/footer-action.service';
import { ModalService } from '../../../core/services/modal.service';
import { ToastService } from '../../../core/services/toast.service';
import { FooterAction } from '../../../core/models/footer-action.model';
import { DeviceFormComponent } from '../device-form/device-form.component';
import { ConfirmationModalComponent } from '../../../shared/components/confirmation-modal/confirmation-modal.component';
import { CustomRouteReuseStrategy } from '../../../core/strategies/custom-route-reuse-strategy';
import { DateUtils } from '../../../shared/utils/date.utils';
import { NumberUtils } from '../../../shared/utils/number.utils';

// Services
import { PdfService } from '../../../core/services/pdf.service';
import { DeviceService } from '../../../core/services/device.service';

@Component({
  selector: 'app-device-detail',
  standalone: true,
  imports: [CommonModule, QRCodeComponent, CurrencyPipe],
  templateUrl: './device-detail.component.html',
  styleUrl: './device-detail.component.scss',
  encapsulation: ViewEncapsulation.None,
})
export class DeviceDetailComponent implements OnInit {
  private destroyRef = inject(DestroyRef);

  public device: Device | null = null;
  public isLoading = true;
  public qrCodeValue: string = '';

  public isWarrantyExpiring: boolean = false;
  public warrantyExpiresInDays: number = 0;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private deviceService: DeviceService,
    private footerService: FooterActionService,
    private modalService: ModalService,
    private toastService: ToastService,
    private pdfService: PdfService,
    @Inject(DOCUMENT) private document: Document
  ) {}

  ngOnInit(): void {
    this.route.params
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(params => {
        const deviceId = params['id'];
        if (deviceId) {
          this.loadDevice(deviceId);
        } else {
          this.toastService.showError('Không tìm thấy ID thiết bị.');
          this.goBack();
        }
      });
  }

  loadDevice(id: string): void {
    this.isLoading = true;

    this.deviceService
      .getDeviceById(id)
      .pipe(
        finalize(() => (this.isLoading = false)),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe({
        next: device => {
          this.device = device;
          this.qrCodeValue = window.location.href;

          this.setupFooterActions(this.device);
          this.checkWarrantyStatus(this.device);
        },
        error: (err: Error) => {
          console.error('Failed to load device details:', err);
          this.toastService.showError(
            err.message || 'Không thể tải chi tiết thiết bị.'
          );
          this.goBack();
        },
      });
  }

  private checkWarrantyStatus(device: Device): void {
    this.isWarrantyExpiring = false;
    this.warrantyExpiresInDays = 0;

    if (!device.NgayHetHanBH) {
      return;
    }

    try {
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

  formatDate(isoDate: string | null | undefined): string {
    return DateUtils.formatToDisplay(isoDate);
  }

  public getStatusClass(status: string | null | undefined): string {
    if (!status) return 'status-default';
    const lower = status.toLowerCase();

    if (lower.includes('đang sử dụng')) return 'status-in-use';
    if (lower.includes('sẵn sàng')) return 'status-ready';
    if (lower.includes('đang bảo trì') || lower.includes('đang sửa chữa'))
      return 'status-maintenance';
    if (lower.includes('bảo trì') || lower.includes('sửa chữa'))
      return 'status-repair';
    if (lower.includes('hỏng') || lower.includes('thanh lý'))
      return 'status-broken';
    return 'status-default';
  }

  public getDeviceIconClass(deviceType: string | null | undefined): string {
    if (!deviceType) return 'fas fa-question-circle';
    const lower = deviceType.toLowerCase();
    if (lower.includes('laptop') || lower.includes('máy tính'))
      return 'fas fa-laptop-medical';
    if (lower.includes('printer') || lower.includes('máy in'))
      return 'fas fa-print';
    if (lower.includes('server') || lower.includes('máy chủ'))
      return 'fas fa-server';
    if (lower.includes('monitor')) return 'fas fa-desktop';
    return 'fas fa-hdd';
  }

  async onPrintReport(device: Device): Promise<void> {
    if (!device) return;

    // Map device data to schema inputs
    // Ensure these keys match what is defined in your 'device-report.json' schema
    const reportData = {
      deviceName: device.Ten || '',
      deviceId: device.Ma || '',
      model: device.Model || '',
      serial: device.SerialNumber || '',
      department: device.ViTri || '',
      status: device.TrangThai_Ten || '',
      description: device.MoTa || '',
      price: NumberUtils.formatCurrency(device.GiaMua || 0),
      createdDate: new Date().toLocaleDateString('vi-VN'),
    };

    try {
      this.toastService.showInfo('Đang tạo báo cáo PDF...');

      await this.pdfService.generateReport(
        'assets/schemas/device-report.json',
        reportData,
        `Bien_Ban_${device.Ma}.pdf`
      );

      this.toastService.showSuccess('Đã tải xuống báo cáo thành công');
    } catch (error) {
      console.error(error);
      this.toastService.showError('Lỗi khi tạo PDF. Vui lòng kiểm tra lại.');
    }
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
        icon: 'fas fa-file-pdf',
        action: () => this.onPrintReport(device),
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
    this.modalService
      .open(DeviceFormComponent, {
        title: `Sửa thiết bị`,
        context: { device: { ...device }, title: 'Sửa thiết bị' },
      })
      .subscribe(result => {
        if (result) {
          CustomRouteReuseStrategy.clearCache('equipment/catalog');
          this.loadDevice(device.Id!.toString());
        }
      });
  }

  onDelete(device: Device): void {
    this.modalService
      .open(ConfirmationModalComponent, {
        title: 'Xác nhận Xóa',
        size: 'sm',
        context: {
          message: `Bạn có chắc chắn muốn xóa thiết bị "${device.Ten}" (Mã: ${device.Ma}) không?`,
          confirmText: 'Xác nhận Xóa',
          cancelText: 'Hủy bỏ',
        },
      })
      .pipe(
        switchMap(confirmed => {
          if (confirmed) {
            this.isLoading = true;
            return this.deviceService.deleteDevice(device.Id!);
          }
          return of(null);
        }),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe({
        next: response => {
          if (response) {
            CustomRouteReuseStrategy.clearCache('equipment/catalog');
            this.toastService.showSuccess('Xóa thiết bị thành công!');
            this.goBack();
          }
        },
        error: (err: any) => {
          this.isLoading = false;
          const msg = err.error?.TenKetQua || err.message || 'Xóa thất bại.';
          this.toastService.showError(msg, 0);
        },
        complete: () => {
          if (this.isLoading) this.isLoading = false;
        },
      });
  }
}
