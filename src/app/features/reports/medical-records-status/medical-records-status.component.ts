import {
  Component,
  OnInit,
  inject,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  effect,
  DestroyRef,
} from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { finalize } from 'rxjs';
import type { EChartsCoreOption } from 'echarts/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import { ReportService } from '../../../core/services/report.service';
import { ToastService } from '../../../core/services/toast.service';
import {
  ThemeService,
  ThemePalette,
} from '../../../core/services/theme.service';
import {
  ExcelExportService,
  ExportColumn,
} from '../../../core/services/excel-export.service';
import { MedicalRecordSummary } from '../../../shared/models/medical-record-stat.model';

import { ChartCardComponent } from '../../../components/chart-card/chart-card.component';
import {
  DateFilterComponent,
  DateRange,
} from '../../../components/date-filter/date-filter.component';
import { HasPermissionDirective } from '../../../shared/directives/has-permission.directive';

const GLOBAL_FONT_FAMILY = 'Inter, sans-serif';

@Component({
  selector: 'app-medical-records-status',
  standalone: true,
  imports: [
    CommonModule,
    ChartCardComponent,
    DateFilterComponent,
    HasPermissionDirective,
  ],
  providers: [DatePipe],
  templateUrl: './medical-records-status.component.html',
  styleUrl: './medical-records-status.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MedicalRecordsStatusComponent implements OnInit {
  private reportService = inject(ReportService);
  private toastService = inject(ToastService);
  private excelService = inject(ExcelExportService);
  private cd = inject(ChangeDetectorRef);
  private datePipe = inject(DatePipe);
  private destroyRef = inject(DestroyRef);
  public readonly themeService = inject(ThemeService);

  public isLoading = false;
  public isExporting = false;

  public summaryData: MedicalRecordSummary[] = [];
  public fromDate: string = '';
  public toDate: string = '';
  public doctorChartOptions: EChartsCoreOption | null = null;
  private palette!: ThemePalette;

  constructor() {
    effect(() => {
      this.palette = this.themeService.currentPalette();
      if (!this.isLoading && this.summaryData.length > 0) {
        this.buildCharts(this.summaryData);
      }
      this.cd.markForCheck();
    });
  }

  ngOnInit(): void {
    this.setDefaultDateRange();
    this.loadData();
  }

  private setDefaultDateRange(): void {
    const now = new Date();
    const day = now.getDay();
    const diff = now.getDate() - day + (day == 0 ? -6 : 1);
    const start = new Date(now.setDate(diff));
    const end = new Date(now.setDate(start.getDate() + 6));
    this.fromDate = this.datePipe.transform(start, 'yyyy-MM-dd') || '';
    this.toDate = this.datePipe.transform(end, 'yyyy-MM-dd') || '';
  }

  public onDateFilter(range: DateRange): void {
    this.fromDate = range.fromDate;
    this.toDate = range.toDate;
    this.loadData();
  }

  public loadData(): void {
    if (!this.fromDate || !this.toDate) return;
    this.isLoading = true;
    this.doctorChartOptions = null;
    this.cd.markForCheck();

    this.reportService
      .getMedicalRecordStatusSummary(this.fromDate, this.toDate)
      .pipe(
        finalize(() => {
          this.isLoading = false;
          this.cd.markForCheck();
        }),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe({
        next: (data) => {
          this.summaryData = data || [];
          this.buildCharts(this.summaryData);
        },
        error: (err) => {
          console.error(err);
          this.toastService.showError('Không thể tải dữ liệu biểu đồ.');
          this.summaryData = [];
          this.doctorChartOptions = null;
        },
      });
  }

  private buildCharts(data: MedicalRecordSummary[]): void {
    if (!data || data.length === 0) {
      this.doctorChartOptions = null;
      return;
    }
    const sorted = [...data].sort((a, b) => b.SO_LUONG - a.SO_LUONG);
    const topList = sorted.slice(0, 15);
    const names = topList.map((i) => i.TEN_BS || 'N/A');
    const values = topList.map((i) => i.SO_LUONG);

    this.doctorChartOptions = {
      backgroundColor: 'transparent',
      textStyle: {
        fontFamily: GLOBAL_FONT_FAMILY,
        color: this.palette.textSecondary,
      },
      tooltip: {
        trigger: 'axis',
        backgroundColor: this.palette.bgCard,
        borderColor: this.palette.gray200,
        textStyle: { color: this.palette.textPrimary },
        axisPointer: { type: 'shadow' },
        confine: true, // Added to prevent cropping
      },
      grid: { left: '3%', right: '4%', top: '10%', containLabel: true },
      xAxis: {
        type: 'category',
        data: names,
        axisLabel: {
          width: 120,
          overflow: 'truncate',
          color: this.palette.textPrimary,
          rotate: 45,
          interval: 0,
        },
        axisLine: { lineStyle: { color: this.palette.gray200 } },
      },
      yAxis: {
        type: 'value',
        splitLine: {
          lineStyle: { type: 'dashed', color: this.palette.gray200 },
        },
        axisLabel: { color: this.palette.textSecondary },
      },
      series: [
        {
          name: 'Số lượng chưa tạo',
          type: 'bar',
          data: values,
          barWidth: '50%',
          itemStyle: {
            color: this.palette.primary,
            borderRadius: [4, 4, 0, 0],
          },
          label: {
            show: true,
            position: 'top',
            color: this.palette.textPrimary,
          },
        },
      ],
    };
  }

  public onExport(): void {
    if (this.isExporting) return;
    this.isExporting = true;
    this.cd.markForCheck();
    this.reportService
      .getMedicalRecordStatusDetail(this.fromDate, this.toDate)
      .pipe(
        finalize(() => {
          this.isExporting = false;
          this.cd.markForCheck();
        }),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe({
        next: (details) => {
          if (!details || details.length === 0) {
            this.toastService.showWarning('Không có dữ liệu chi tiết để xuất.');
            return;
          }
          const columns: ExportColumn[] = [
            { key: 'MAYTE', header: 'Mã Y Tế' },
            { key: 'TEN_BENH_NHAN', header: 'Tên Bệnh Nhân' },
            { key: 'NGAY_KHAM', header: 'Ngày Khám', type: 'date' },
            { key: 'DICH_VU', header: 'Dịch Vụ' },
            { key: 'CHUYEN_KHOA', header: 'Chuyên Khoa' },
            { key: 'MA_BS', header: 'Mã BS' },
            { key: 'TEN_BS', header: 'Tên Bác Sĩ' },
            { key: 'TEN_PHONG_KHAM', header: 'Phòng Khám' },
            { key: 'THOI_GIAN_KHAM', header: 'Thời Gian', type: 'date' },
            { key: 'TRANG_THAI_BA', header: 'Trạng Thái' },
            { key: 'TIEPNHAN_ID', header: 'Mã Tiếp Nhận' },
          ];
          this.excelService.exportToExcel(
            details,
            `BaoCao_ChuaTaoBA_${this.fromDate}_${this.toDate}`,
            columns
          );
          this.toastService.showSuccess(
            `Đã xuất ${details.length} dòng ra file Excel.`
          );
        },
        error: (err) => {
          console.error(err);
          this.toastService.showError(
            'Lỗi khi tải dữ liệu chi tiết để xuất Excel.'
          );
        },
      });
  }
}