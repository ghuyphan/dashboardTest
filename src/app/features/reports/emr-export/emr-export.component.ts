import {
  Component,
  OnInit,
  OnDestroy,
  inject,
  signal,
  computed,
  effect,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';

import {
  DateFilterComponent,
  DateRange,
} from '@shared/components/date-filter/date-filter.component';
import {
  ReusableTableComponent,
  GridColumn,
  TableAction,
  RowActionEvent,
} from '@shared/components/reusable-table/reusable-table.component';
import { PdfService } from '@core/services/pdf.service';
import { ToastService } from '@core/services/toast.service';
import { FooterActionService } from '@core/services/footer-action.service';
import { DateUtils } from '@shared/utils/date.utils';
import { EmrService } from '@core/services/emr.service';
import { environment } from '../../../../environments/environment';

export interface EmrAdmission {
  STT: number;
  mayte: string;
  tenBenhNhan: string;
  soTiepNhan: string;
  soBenhAn: string;
  ngayTiepNhan: string;
  thoiGianTiepNhan: string;
}

export interface EmrSignedFile {
  STT: number;
  mayte: string;
  tenBenhNhan: string;
  soTiepNhan: string;
  soBenhAn: string;
  nhomDichVu: string;
  tenDichVu: string;
  thoiGianThucHien: string;
  fileName: string;
  fileId: string;
  urlFile?: string;
}

@Component({
  selector: 'app-emr-export',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatCheckboxModule,
    MatIconModule,
    MatMenuModule,
    DateFilterComponent,
    ReusableTableComponent,
  ],
  templateUrl: './emr-export.component.html',
  styleUrl: './emr-export.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EmrExportComponent implements OnInit, OnDestroy {
  private readonly router = inject(Router);
  private readonly pdfService = inject(PdfService);
  private readonly toastService = inject(ToastService);
  private readonly cd = inject(ChangeDetectorRef);
  private readonly emrService = inject(EmrService);
  private readonly footerService = inject(FooterActionService);

  // Filter States
  public fromDate = signal<string>('');
  public toDate = signal<string>('');
  public searchPatientId = signal<string>('260219667'); // Default matching the user's new API testing patient

  // Table columns definition
  public readonly admissionColumns: GridColumn[] = [
    { key: 'mayte', label: 'Mã Y Tế', sortable: true, width: '130px' },
    {
      key: 'tenBenhNhan',
      label: 'Tên Bệnh Nhân',
      sortable: true,
      width: '180px',
    },
    {
      key: 'ngayTiepNhan',
      label: 'Ngày Tiếp Nhận',
      sortable: true,
      width: '130px',
      type: 'date',
    },
  ];

  public readonly signedFileColumns: GridColumn[] = [
    {
      key: 'nhomDichVu',
      label: 'Nhóm Dịch Vụ',
      sortable: true,
      width: '120px',
    },
    { key: 'tenDichVu', label: 'Tên Dịch Vụ', sortable: true, width: '180px' },
    {
      key: 'thoiGianThucHien',
      label: 'Thời Gian Thực Hiện',
      sortable: true,
      width: '160px',
    },
    { key: 'fileName', label: 'File Name', sortable: true, width: '280px' },
    {
      key: 'actions',
      label: '',
      sortable: false,
      width: '50px',
      type: 'actions',
    },
  ];

  // Actions for files
  public readonly fileRowActions: TableAction<EmrSignedFile>[] = [
    {
      action: 'print',
      label: 'In file này',
      icon: 'print',
      color: 'primary',
    },
    {
      action: 'download',
      label: 'Tải xuống',
      icon: 'download',
      color: 'accent',
    },
  ];

  // UI State Signals
  public admissions = signal<EmrAdmission[]>([]);
  public signedFiles = signal<EmrSignedFile[]>([]);
  public selectedAdmission = signal<EmrAdmission | null>(null);
  public selectedFiles = signal<EmrSignedFile[]>([]);

  public isLoading = signal<boolean>(false);
  public isFilesLoading = signal<boolean>(false);
  public isExporting = signal<boolean>(false);
  public isPrinting = signal<boolean>(false);

  constructor() {
    effect(() => {
      this.updateFooterActions();
    });
  }

  ngOnInit(): void {
    // Left empty since [autoLoad]="true" on DateFilterComponent will trigger initial load via (filterSubmit)
  }

  ngOnDestroy(): void {
    this.footerService.clearActions();
  }

  private updateFooterActions(): void {
    const loading = this.isLoading();
    const filesLoading = this.isFilesLoading();
    const admission = this.selectedAdmission();
    const exporting = this.isExporting();
    const selected = this.selectedFiles();
    const printing = this.isPrinting();

    this.footerService.setActions([
      {
        label: 'Kết xuất file EMR',
        icon: exporting ? 'fas fa-spinner fa-spin' : 'fas fa-file-medical',
        action: () => this.onExportEMR(),
        className: 'btn-secondary',
        disabled: loading || filesLoading || !admission || exporting,
      },
      {
        label: 'In',
        icon: printing ? 'fas fa-spinner fa-spin' : 'fas fa-print',
        action: () => this.onPrintSelectedFiles(),
        className: 'btn-primary',
        disabled: loading || filesLoading || selected.length === 0 || printing,
      },
    ]);
  }

  // Called when filter is submitted (including initial autoLoad)
  public onFilterSubmit(range: DateRange): void {
    this.fromDate.set(range.fromDate);
    this.toDate.set(range.toDate);
    this.onSearch();
  }

  // Trigger query/search for admissions
  public onSearch(): void {
    const pid = this.searchPatientId().trim();
    if (!pid) {
      this.toastService.showWarning('Vui lòng nhập mã y tế để tìm kiếm.');
      return;
    }

    this.isLoading.set(true);
    this.selectedAdmission.set(null);
    this.signedFiles.set([]);
    this.selectedFiles.set([]);
    this.cd.markForCheck();

    const start = this.fromDate();
    const end = this.toDate();

    this.emrService.getEmrAdmissions(start, end, pid).subscribe({
      next: res => {
        const mapped = (res || []).map((item: any, index: number) => {
          return {
            STT: index + 1,
            mayte: item.MaYTe || item.mayte || item.MAYTE || item.maYTe || pid,
            tenBenhNhan:
              item.TenBenhNhan || item.tenBenhNhan || item.TEN_BENH_NHAN || '',
            soTiepNhan:
              item.SoTiepNhan || item.soTiepNhan || item.SO_TIEP_NHAN || '',
            soBenhAn: item.SoBenhAn || item.soBenhAn || item.SO_BENH_AN || '',
            ngayTiepNhan:
              item.NgayTiepNhan ||
              item.ngayTiepNhan ||
              item.NGAY_TIEP_NHAN ||
              '',
            thoiGianTiepNhan:
              item.ThoiGianTiepNhan ||
              item.thoiGianTiepNhan ||
              item.THOI_GIAN_TIEP_NHAN ||
              '',
            tiepNhan_Id:
              item.TiepNhan_Id ||
              item.tiepNhan_Id ||
              item.TIEPNHAN_ID ||
              item.soTiepNhan ||
              item.SoTiepNhan ||
              '',
          };
        });

        this.admissions.set(mapped);
        this.isLoading.set(false);

        // Auto-select first admission if available to enhance double-grid experience
        if (mapped.length > 0) {
          this.onAdmissionSelected(mapped[0]);
        }

        this.cd.markForCheck();
      },
      error: err => {
        console.error('Failed to load EMR admissions:', err);
        this.toastService.showError('Không thể tải danh sách tiếp nhận.');
        this.admissions.set([]);
        this.isLoading.set(false);
        this.cd.markForCheck();
      },
    });
  }

  // Handle Admission Click (Master selection)
  public onAdmissionSelected(admission: EmrAdmission | undefined): void {
    if (!admission) {
      this.selectedAdmission.set(null);
      this.signedFiles.set([]);
      this.selectedFiles.set([]);
      this.cd.markForCheck();
      return;
    }

    this.selectedAdmission.set(admission);
    this.selectedFiles.set([]);
    this.isFilesLoading.set(true);
    this.cd.markForCheck();

    const tiepNhanId = (admission as any).tiepNhan_Id || admission.soTiepNhan;

    this.emrService.getEmrSignedFiles(tiepNhanId).subscribe({
      next: res => {
        const files = (res || []).map((item: any, index: number) => {
          return {
            STT: index + 1,
            mayte:
              item.MaYTe ||
              item.mayte ||
              item.MAYTE ||
              item.maYTe ||
              admission.mayte ||
              '',
            tenBenhNhan:
              item.TenBenhNhan ||
              item.tenBenhNhan ||
              item.TEN_BENH_NHAN ||
              item.TENBENHNHAN ||
              admission.tenBenhNhan ||
              '',
            soTiepNhan:
              item.SoTiepNhan ||
              item.soTiepNhan ||
              item.SO_TIEP_NHAN ||
              item.SOTIEPNHAN ||
              admission.soTiepNhan ||
              '',
            soBenhAn:
              item.SoBenhAn ||
              item.soBenhAn ||
              item.SO_BENH_AN ||
              item.SOBENHAN ||
              admission.soBenhAn ||
              '',
            nhomDichVu:
              item.NhomDichVu || item.nhomDichVu || item.NHOM_DICH_VU || '',
            tenDichVu:
              item.TenDichVu || item.tenDichVu || item.TEN_DICH_VU || '',
            thoiGianThucHien:
              item.ThoiGianThucHien ||
              item.thoiGianThucHien ||
              item.THOI_GIAN_THUC_HIEN ||
              item.THOI_GIAN_TH ||
              '',
            fileName: item.FileName || item.fileName || item.FILE_NAME || '',
            fileId:
              item.FileId ||
              item.fileId ||
              item.FILE_ID ||
              (item.URL_FILE
                ? item.URL_FILE.substring(item.URL_FILE.lastIndexOf('/') + 1)
                : ''),
            urlFile: item.URL_FILE || item.urlFile || '',
          };
        });
        this.signedFiles.set(files);
        this.isFilesLoading.set(false);
        this.cd.markForCheck();
      },
      error: err => {
        console.error('Failed to load EMR signed files:', err);
        this.toastService.showError('Không thể tải danh sách file đã ký.');
        this.signedFiles.set([]);
        this.isFilesLoading.set(false);
        this.cd.markForCheck();
      },
    });
  }

  // Handle Files multiple selection change
  public onFilesSelectionChanged(files: EmrSignedFile[]): void {
    this.selectedFiles.set(files || []);
    this.cd.markForCheck();
  }

  // Handle Print Action for all selected files
  public async onPrintSelectedFiles(): Promise<void> {
    const files = this.selectedFiles();
    if (files.length === 0) {
      this.toastService.showWarning('Vui lòng chọn ít nhất một file để in.');
      return;
    }

    this.isPrinting.set(true);
    this.cd.markForCheck();

    try {
      this.toastService.showInfo(`Đang chuẩn bị in ${files.length} file...`);
      for (const file of files) {
        const downloadUrl =
          file.urlFile || `${environment.fileDownloadUrl}/${file.fileId}`;
        await this.pdfService.printPdfFromApi(downloadUrl);
      }
      this.toastService.showSuccess('Hoàn thành lệnh in.');
    } catch (err) {
      console.error('Failed to print EMR files:', err);
      this.toastService.showError('Có lỗi xảy ra khi tải và in file EMR.');
    } finally {
      this.isPrinting.set(false);
      this.cd.markForCheck();
    }
  }

  // Handle Export EMR Mock action
  public onExportEMR(): void {
    const admission = this.selectedAdmission();
    if (!admission) {
      this.toastService.showWarning(
        'Vui lòng chọn một lượt tiếp nhận để kết xuất.'
      );
      return;
    }

    this.isExporting.set(true);
    this.cd.markForCheck();

    setTimeout(() => {
      this.isExporting.set(false);
      this.toastService.showSuccess(
        `Kết xuất file EMR thành công cho bệnh nhân: ${admission.tenBenhNhan}`
      );
      this.cd.markForCheck();
    }, 1500);
  }

  // Handle Inline Actions for specific rows in the Detail Files Grid
  public handleFileAction(event: RowActionEvent<EmrSignedFile>): void {
    const file = event.data;
    const downloadUrl =
      file.urlFile || `${environment.fileDownloadUrl}/${file.fileId}`;

    if (event.action === 'print') {
      this.pdfService
        .printPdfFromApi(downloadUrl)
        .then(() =>
          this.toastService.showSuccess(
            `Đã mở hộp thoại in cho file: ${file.fileName}`
          )
        )
        .catch(err => {
          console.error(err);
          this.toastService.showError('Không thể in file.');
        });
    } else if (event.action === 'download') {
      this.toastService.showInfo('Đang tải file...');
      // Simple anchor download trigger
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = file.fileName;
      link.target = '_blank';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      this.toastService.showSuccess(`Đang tải xuống file: ${file.fileName}`);
    }
  }

  // Navigation Back Home
  public onClose(): void {
    this.router.navigate(['/app/home']);
  }
}
