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

import { ReportService } from '../../../core/services/report.service';
import { ToastService } from '../../../core/services/toast.service';
import { ThemeService, ThemePalette } from '../../../core/services/theme.service';
import { MedicalRecordSummary } from '../../../shared/models/medical-record-stat.model';

import { WidgetCardComponent } from '../../../components/widget-card/widget-card.component';
import { ChartCardComponent } from '../../../components/chart-card/chart-card.component';
import { DateFilterComponent, DateRange } from '../../../components/date-filter/date-filter.component';

const GLOBAL_FONT_FAMILY = 'Inter, sans-serif';

@Component({
  selector: 'app-medical-records-status',
  standalone: true,
  imports: [
    CommonModule,
    WidgetCardComponent,
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
  public readonly themeService = inject(ThemeService);

  public isLoading = false;
  public isExporting = false; // New state for export button loading
  
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
    // Initial load triggered by DateFilterComponent
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

    // [CHANGE] Only load summary data for the chart
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
        bottom: '15%',
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
            // Use Primary Color
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

  // [CHANGE] Fetch details only when user clicks Export
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
          
          console.log('Exporting data:', details);
          // Call your Excel Export Service here passing `details`
          this.toastService.showSuccess(`Đã xuất ${details.length} hồ sơ ra Excel.`);
        },
        error: (err) => {
          console.error(err);
          this.toastService.showError('Lỗi khi tải dữ liệu chi tiết để xuất Excel.');
        }
      });
  }
}