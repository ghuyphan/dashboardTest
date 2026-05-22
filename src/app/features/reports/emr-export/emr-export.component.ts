import {
  Component,
  OnInit,
  inject,
  signal,
  computed,
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
import { DateUtils } from '@shared/utils/date.utils';

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
export class EmrExportComponent implements OnInit {
  private readonly router = inject(Router);
  private readonly pdfService = inject(PdfService);
  private readonly toastService = inject(ToastService);
  private readonly cd = inject(ChangeDetectorRef);

  // Filter States
  public fromDate = signal<string>('');
  public toDate = signal<string>('');
  public searchPatientId = signal<string>('79071.140047048'); // Default matching the user's screenshot
  public selectedSearchType = signal<string>('mayte');

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

  // Raw mock database
  private allAdmissions: EmrAdmission[] = [
    {
      STT: 1,
      mayte: '79071.140047048',
      tenBenhNhan: 'ĐỖ THỊ CẨM THÀNH',
      soTiepNhan: 'TN260512.0000584',
      soBenhAn: '26.011339/CC',
      ngayTiepNhan: '2026-05-16',
      thoiGianTiepNhan: '16/05/2026 10:46',
    },
    {
      STT: 2,
      mayte: '79071.140047048',
      tenBenhNhan: 'ĐỖ THỊ CẨM THÀNH',
      soTiepNhan: 'TN260512.0000584',
      soBenhAn: '26.008782',
      ngayTiepNhan: '2026-05-16',
      thoiGianTiepNhan: '16/05/2026 10:46',
    },
    {
      STT: 3,
      mayte: '79071.140047048',
      tenBenhNhan: 'ĐỖ THỊ CẨM THÀNH',
      soTiepNhan: 'TN260512.0000584',
      soBenhAn: '26.000123/NOI',
      ngayTiepNhan: '2026-05-12',
      thoiGianTiepNhan: '12/05/2026 07:57',
    },
    {
      STT: 4,
      mayte: '79071.123456789',
      tenBenhNhan: 'NGUYỄN VĂN A',
      soTiepNhan: 'TN260510.0000123',
      soBenhAn: '26.007654/NGOAI',
      ngayTiepNhan: '2026-05-10',
      thoiGianTiepNhan: '10/05/2026 08:30',
    },
    {
      STT: 5,
      mayte: '79071.987654321',
      tenBenhNhan: 'TRẦN THỊ B',
      soTiepNhan: 'TN260511.0000456',
      soBenhAn: '26.006543/CC',
      ngayTiepNhan: '2026-05-11',
      thoiGianTiepNhan: '11/05/2026 14:15',
    },
  ];

  private allSignedFiles: Record<string, EmrSignedFile[]> = {
    '79071.140047048': [
      {
        STT: 1,
        mayte: '79071.140047048',
        tenBenhNhan: 'ĐỖ THỊ CẨM THÀNH',
        soTiepNhan: 'TN260512.0000584',
        soBenhAn: '26.011339/CC',
        nhomDichVu: 'XN Sinh Hóa',
        tenDichVu: 'Uric Acid [máu]',
        thoiGianThucHien: '12/05/2026 09:25',
        fileName: 'ĐỖ THỊ CẨM THÀNH_120526-358640_Ver1-signed.pdf',
        fileId: '6a092680642998db5bf01dca', // pointing to actual download url ID
      },
      {
        STT: 2,
        mayte: '79071.140047048',
        tenBenhNhan: 'ĐỖ THỊ CẨM THÀNH',
        soTiepNhan: 'TN260512.0000584',
        soBenhAn: '26.011339/CC',
        nhomDichVu: 'XN Sinh Hóa',
        tenDichVu: 'Glucose [máu]',
        thoiGianThucHien: '12/05/2026 09:25',
        fileName: 'ĐỖ THỊ CẨM THÀNH_120526-358640_Ver1-signed.pdf',
        fileId: '6a092680642998db5bf01dca',
      },
      {
        STT: 3,
        mayte: '79071.140047048',
        tenBenhNhan: 'ĐỖ THỊ CẨM THÀNH',
        soTiepNhan: 'TN260512.0000584',
        soBenhAn: '26.011339/CC',
        nhomDichVu: 'XN Sinh Hóa',
        tenDichVu: 'ION ĐỒ [máu]',
        thoiGianThucHien: '12/05/2026 09:25',
        fileName: 'ĐỖ THỊ CẨM THÀNH_120526-358640_Ver1-signed.pdf',
        fileId: '6a092680642998db5bf01dca',
      },
      {
        STT: 4,
        mayte: '79071.140047048',
        tenBenhNhan: 'ĐỖ THỊ CẨM THÀNH',
        soTiepNhan: 'TN260512.0000584',
        soBenhAn: '26.011339/CC',
        nhomDichVu: 'XÉT NGHIỆM',
        tenDichVu: 'Tổng phân tích nước tiểu',
        thoiGianThucHien: '12/05/2026 09:25',
        fileName: 'ĐỖ THỊ CẨM THÀNH_120526-358640_Ver1-signed.pdf',
        fileId: '6a092680642998db5bf01dca',
      },
      {
        STT: 5,
        mayte: '79071.140047048',
        tenBenhNhan: 'ĐỖ THỊ CẨM THÀNH',
        soTiepNhan: 'TN260512.0000584',
        soBenhAn: '26.011339/CC',
        nhomDichVu: 'Điện Tim',
        tenDichVu: 'ECG',
        thoiGianThucHien: '12/05/2026 08:28',
        fileName: 'HMSG.20260512.0000001978.01.pdf',
        fileId: '6a092680642998db5bf01dca',
      },
      {
        STT: 6,
        mayte: '79071.140047048',
        tenBenhNhan: 'ĐỖ THỊ CẨM THÀNH',
        soTiepNhan: 'TN260512.0000584',
        soBenhAn: '26.011339/CC',
        nhomDichVu: 'Nội Soi TMH',
        tenDichVu: 'Soi đáy mắt',
        thoiGianThucHien: '12/05/2026 09:30',
        fileName: 'HMSG.20260512.0000002798.01.pdf',
        fileId: '6a092680642998db5bf01dca',
      },
      {
        STT: 7,
        mayte: '79071.140047048',
        tenBenhNhan: 'ĐỖ THỊ CẨM THÀNH',
        soTiepNhan: 'TN260512.0000584',
        soBenhAn: '26.011339/CC',
        nhomDichVu: 'Siêu Âm',
        tenDichVu: 'Siêu âm Doppler màu tim',
        thoiGianThucHien: '12/05/2026 10:44',
        fileName: 'HMSG.20260512.0000004004.01.pdf',
        fileId: '6a092680642998db5bf01dca',
      },
    ],
    '79071.123456789': [
      {
        STT: 1,
        mayte: '79071.123456789',
        tenBenhNhan: 'NGUYỄN VĂN A',
        soTiepNhan: 'TN260510.0000123',
        soBenhAn: '26.007654/NGOAI',
        nhomDichVu: 'Khám bệnh',
        tenDichVu: 'Khám chuyên khoa Nội tổng quát',
        thoiGianThucHien: '10/05/2026 08:45',
        fileName: 'NGUYEN VAN A_100526_KhamNoi.pdf',
        fileId: '6a092680642998db5bf01dca',
      },
    ],
    '79071.987654321': [
      {
        STT: 1,
        mayte: '79071.987654321',
        tenBenhNhan: 'TRẦN THỊ B',
        soTiepNhan: 'TN260511.0000456',
        soBenhAn: '26.006543/CC',
        nhomDichVu: 'Xét nghiệm',
        tenDichVu: 'Công thức máu 24 chỉ số',
        thoiGianThucHien: '11/05/2026 14:30',
        fileName: 'TRAN THI B_110526_CongThucMau.pdf',
        fileId: '6a092680642998db5bf01dca',
      },
    ],
  };

  // UI State Signals
  public admissions = signal<EmrAdmission[]>([]);
  public signedFiles = signal<EmrSignedFile[]>([]);
  public selectedAdmission = signal<EmrAdmission | null>(null);
  public selectedFiles = signal<EmrSignedFile[]>([]);

  public isLoading = signal<boolean>(false);
  public isExporting = signal<boolean>(false);
  public isPrinting = signal<boolean>(false);

  ngOnInit(): void {
    this.setDefaultDateRange();
    this.onSearch(); // Load initial data
  }

  private setDefaultDateRange(): void {
    const range = DateUtils.getReportingWeekRange();
    this.fromDate.set(range.fromDate);
    this.toDate.set(range.toDate);
  }

  // Called when dates change in the DateFilterComponent
  public onDateFilterChange(range: DateRange): void {
    this.fromDate.set(range.fromDate);
    this.toDate.set(range.toDate);
  }

  // Trigger query/search for admissions
  public onSearch(): void {
    this.isLoading.set(true);
    this.selectedAdmission.set(null);
    this.signedFiles.set([]);
    this.selectedFiles.set([]);
    this.cd.markForCheck();

    setTimeout(() => {
      let filtered = [...this.allAdmissions];

      // Filter by Patient ID if entered
      const pid = this.searchPatientId().trim();
      if (pid) {
        filtered = filtered.filter(item =>
          item.mayte.toLowerCase().includes(pid.toLowerCase())
        );
      }

      // Filter by date range (from/to dates based on ngayTiepNhan)
      const start = this.fromDate();
      const end = this.toDate();
      if (start && end) {
        filtered = filtered.filter(item => {
          return item.ngayTiepNhan >= start && item.ngayTiepNhan <= end;
        });
      }

      this.admissions.set(filtered);
      this.isLoading.set(false);

      // Auto-select first admission if available to enhance double-grid experience
      if (filtered.length > 0) {
        this.onAdmissionSelected(filtered[0]);
      }

      this.cd.markForCheck();
    }, 400);
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
    this.isLoading.set(true);
    this.cd.markForCheck();

    // Fetch detail signed files based on Patient ID
    setTimeout(() => {
      const files = this.allSignedFiles[admission.mayte] || [];
      this.signedFiles.set(files);
      this.isLoading.set(false);
      this.cd.markForCheck();
    }, 300);
  }

  // Handle File Selection changed
  public onFilesSelectionChanged(files: EmrSignedFile[]): void {
    this.selectedFiles.set(files);
    this.cd.markForCheck();
  }

  // Handle Print Action (Loop through all selected files)
  public async onPrintSelectedFiles(): Promise<void> {
    const selected = this.selectedFiles();
    if (selected.length === 0) {
      this.toastService.showWarning('Vui lòng chọn ít nhất một file để in.');
      return;
    }

    this.isPrinting.set(true);
    this.cd.markForCheck();

    try {
      this.toastService.showInfo(`Đang chuẩn bị in ${selected.length} file...`);

      for (let i = 0; i < selected.length; i++) {
        const file = selected[i];
        const downloadUrl = `http://42.113.122.51:6060/Files/api/File/download/${file.fileId}`;

        // Print files sequentially with a short delay to allow iframe setup
        await this.pdfService.printPdfFromApi(downloadUrl);
        await new Promise(resolve => setTimeout(resolve, 800));
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
    const downloadUrl = `http://42.113.122.51:6060/Files/api/File/download/${file.fileId}`;

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
