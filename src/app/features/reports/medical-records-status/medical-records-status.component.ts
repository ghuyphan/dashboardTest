import {
  Component,
  OnInit,
  inject,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  effect,
} from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { finalize } from 'rxjs';
import type { EChartsCoreOption } from 'echarts/core';
import { saveAs } from 'file-saver'; // Import saveAs for file download

import { ReportService } from '../../../core/services/report.service';
import { ToastService } from '../../../core/services/toast.service';
import { ThemeService, ThemePalette } from '../../../core/services/theme.service';
import { MedicalRecordSummary, MedicalRecordDetail } from '../../../shared/models/medical-record-stat.model';

import { ChartCardComponent } from '../../../components/chart-card/chart-card.component';
import { DateFilterComponent, DateRange } from '../../../components/date-filter/date-filter.component';

const GLOBAL_FONT_FAMILY = 'Inter, sans-serif';

@Component({
  selector: 'app-medical-records-status',
  standalone: true,
  imports: [
    CommonModule,
    ChartCardComponent,
    DateFilterComponent
  ],
  providers: [DatePipe],
  templateUrl: './medical-records-status.component.html',
  styleUrl: './medical-records-status.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MedicalRecordsStatusComponent implements OnInit {
  private reportService = inject(ReportService);
  private toastService = inject(ToastService);
  private cd = inject(ChangeDetectorRef);
  private datePipe = inject(DatePipe);
  public readonly themeService = inject(ThemeService);

  public isLoading = false;
  public isExporting = false; 
  
  // Data State
  public summaryData: MedicalRecordSummary[] = [];
  
  // Filters
  public fromDate: string = '';
  public toDate: string = '';

  // Chart Config
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
    // 1. Initialize Default Dates (This Week) to match Filter UI
    this.setDefaultDateRange();
    
    // 2. Load initial data
    this.loadData();
  }

  private setDefaultDateRange(): void {
    const now = new Date();
    const day = now.getDay(); 
    // Calculate Monday
    const diff = now.getDate() - day + (day == 0 ? -6 : 1); 
    const start = new Date(now.setDate(diff));
    // Calculate Sunday
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

    this.reportService.getMedicalRecordStatusSummary(this.fromDate, this.toDate)
      .pipe(
        finalize(() => {
          this.isLoading = false;
          this.cd.markForCheck();
        })
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
        }
      });
  }

  private buildCharts(data: MedicalRecordSummary[]): void {
    if (!data || data.length === 0) {
      this.doctorChartOptions = null;
      return;
    }

    // Sort by count descending and take Top 15
    const sorted = [...data].sort((a, b) => b.SO_LUONG - a.SO_LUONG);
    const topList = sorted.slice(0, 15);

    const names = topList.map(i => i.TEN_BS || 'N/A');
    const values = topList.map(i => i.SO_LUONG);

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
        axisPointer: { type: 'shadow' }
      },
      grid: {
        left: '3%',
        right: '4%',
        // bottom: '15%',
        top: '10%',
        containLabel: true,
      },
      xAxis: {
        type: 'category',
        data: names,
        axisLabel: {
          width: 120,
          overflow: 'truncate',
          color: this.palette.textPrimary,
          rotate: 45,
          interval: 0
        },
        axisLine: {
          lineStyle: { color: this.palette.gray200 }
        }
      },
      yAxis: {
        type: 'value',
        splitLine: {
          lineStyle: { type: 'dashed', color: this.palette.gray200 },
        },
        axisLabel: {
          color: this.palette.textSecondary
        }
      },
      series: [
        {
          name: 'Số lượng chưa tạo',
          type: 'bar',
          data: values,
          barWidth: '50%',
          itemStyle: {
            color: this.palette.primary,
            borderRadius: [4, 4, 0, 0]
          },
          label: {
            show: true,
            position: 'top',
            color: this.palette.textPrimary
          }
        }
      ]
    };
  }

  public onExport(): void {
    if (this.isExporting) return;

    this.isExporting = true;
    this.cd.markForCheck();

    this.reportService.getMedicalRecordStatusDetail(this.fromDate, this.toDate)
      .pipe(
        finalize(() => {
          this.isExporting = false;
          this.cd.markForCheck();
        })
      )
      .subscribe({
        next: (details) => {
          if (!details || details.length === 0) {
            this.toastService.showWarning('Không có dữ liệu chi tiết để xuất.');
            return;
          }
          
          // IMPLEMENTED: Actual CSV Export Logic
          this.exportToCsv(details, `BaoCao_ChuaTaoBA_${this.fromDate}_${this.toDate}`);
        },
        error: (err) => {
          console.error(err);
          this.toastService.showError('Lỗi khi tải dữ liệu chi tiết để xuất Excel.');
        }
      });
  }

  /**
   * Converts JSON data to CSV and triggers browser download.
   * Includes BOM for Excel UTF-8 compatibility.
   */
  private exportToCsv(data: MedicalRecordDetail[], fileName: string): void {
    const headerMap: Record<keyof MedicalRecordDetail, string> = {
      MAYTE: 'Mã Y Tế',
      TEN_BENH_NHAN: 'Tên Bệnh Nhân',
      NGAY_KHAM: 'Ngày Khám',
      DICH_VU: 'Dịch Vụ',
      CHUYEN_KHOA: 'Chuyên Khoa',
      MA_BS: 'Mã BS',
      TEN_BS: 'Tên Bác Sĩ',
      TEN_PHONG_KHAM: 'Phòng Khám',
      THOI_GIAN_KHAM: 'Thời Gian',
      TRANG_THAI_BA: 'Trạng Thái',
      TIEPNHAN_ID: 'Mã Tiếp Nhận'
    };

    const headers = Object.keys(headerMap) as (keyof MedicalRecordDetail)[];
    const headerRow = headers.map(key => headerMap[key]).join(',');

    const rows = data.map(row => {
      return headers.map(fieldName => {
        let val = row[fieldName] ?? '';
        
        // Format dates if necessary
        if (fieldName === 'NGAY_KHAM' || fieldName === 'THOI_GIAN_KHAM') {
             val = this.datePipe.transform(val, 'dd/MM/yyyy HH:mm') || val;
        }

        // Escape quotes for CSV
        const strVal = String(val).replace(/"/g, '""'); 
        return `"${strVal}"`;
      }).join(',');
    });

    const csvContent = [headerRow, ...rows].join('\n');
    
    // Add BOM for Excel UTF-8 support
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    
    saveAs(blob, `${fileName}.csv`);
    this.toastService.showSuccess(`Đã xuất ${data.length} dòng ra file Excel (CSV).`);
  }
}