import {
  Component,
  OnInit,
  inject,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  effect,
  DestroyRef,
} from '@angular/core';
import { CommonModule, DatePipe, DecimalPipe } from '@angular/common';
import { finalize } from 'rxjs/operators';
import type { EChartsCoreOption } from 'echarts/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import { ReportService } from '../../../core/services/report.service';
import { ToastService } from '../../../core/services/toast.service';
import { ThemeService, ThemePalette } from '../../../core/services/theme.service';
import { EmergencyStat } from '../../../shared/models/emergency-stat';

import { DateUtils } from '../../../shared/utils/date.utils';
import { NumberUtils } from '../../../shared/utils/number.utils';

import { ChartCardComponent } from '../../../shared/components/chart-card/chart-card.component';
import { DateFilterComponent, DateRange } from '../../../shared/components/date-filter/date-filter.component';
import { ExcelExportService, ExportColumn } from '../../../core/services/excel-export.service';
import { HasPermissionDirective } from '../../../shared/directives/has-permission.directive';

const GLOBAL_FONT_FAMILY = 'Inter, sans-serif';

@Component({
  selector: 'app-emergency-admission-comparison',
  standalone: true,
  imports: [
    CommonModule,
    ChartCardComponent,
    DateFilterComponent,
    HasPermissionDirective,
  ],
  providers: [DatePipe, DecimalPipe],
  templateUrl: './emergency-admission-comparison.component.html',
  styleUrls: ['./emergency-admission-comparison.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EmergencyAdmissionComparisonComponent implements OnInit {
  private reportService = inject(ReportService);
  private toastService = inject(ToastService);
  private excelService = inject(ExcelExportService);
  private cd = inject(ChangeDetectorRef);
  private datePipe = inject(DatePipe);
  private numberPipe = inject(DecimalPipe);
  private destroyRef = inject(DestroyRef);
  public readonly themeService = inject(ThemeService);

  public isLoading = false;
  public isExporting = false;
  public rawData: EmergencyStat[] = [];
  public fromDate: string = '';
  public toDate: string = '';

  // Biểu đồ chính chứa Bar + 2 Line
  public comparisonChartOptions: EChartsCoreOption | null = null;

  private palette!: ThemePalette;

  // REMOVED: private readonly vnNumberFormatter = new Intl.NumberFormat('vi-VN');

  constructor() {
    effect(() => {
      this.palette = this.themeService.currentPalette();
      if (!this.isLoading && this.rawData.length > 0) {
        this.buildChart(this.rawData);
      }
      this.cd.markForCheck();
    });
  }

  ngOnInit(): void {
    this.setDefaultDateRange();
    this.loadData();
  }

  private setDefaultDateRange(): void {
    const range = DateUtils.getReportingWeekRange();
    this.fromDate = range.fromDate;
    this.toDate = range.toDate;
  }

  public onDateFilter(range: DateRange): void {
    this.fromDate = range.fromDate;
    this.toDate = range.toDate;
    this.loadData();
  }

  public loadData(): void {
    if (!this.fromDate || !this.toDate) return;

    this.isLoading = true;
    this.comparisonChartOptions = null;
    this.cd.markForCheck();

    // [OPTIMIZATION] Ensure UI renders loading state before fetching
    setTimeout(() => {
      this.reportService
        .getEmergencySummary(this.fromDate, this.toDate)
        .pipe(
          finalize(() => {
            this.isLoading = false;
            this.cd.markForCheck();
          }),
          takeUntilDestroyed(this.destroyRef)
        )
        .subscribe({
          next: (data) => {
            this.rawData = data.map((item) => ({
              ...item,
              NGAY_TIEP_NHAN_DISPLAY: DateUtils.formatToDisplay(item.NGAY_TIEP_NHAN)
            }));

            this.buildChart(this.rawData);
          },
          error: (err) => {
            console.error(err);
            this.toastService.showError('Không thể tải dữ liệu báo cáo cấp cứu.');
            this.rawData = [];
            this.comparisonChartOptions = null;
          },
        });
    }, 0);
  }

  private buildChart(data: EmergencyStat[]): void {
    if (!data || data.length === 0) {
      this.comparisonChartOptions = null;
      return;
    }

    const sorted = [...data].sort((a, b) => new Date(a.NGAY_TIEP_NHAN).getTime() - new Date(b.NGAY_TIEP_NHAN).getTime());

    // Prepare labels: Use Date (dd/MM)
    const dates = sorted.map(d => {
      const dateObj = DateUtils.parse(d.NGAY_TIEP_NHAN);
      return dateObj ? this.datePipe.transform(dateObj, 'dd/MM') : 'N/A';
    });

    // Extract series data
    const admissions = sorted.map(d => d.NHAP_VIEN || 0);
    const totalCC = sorted.map(d => d.LUOT_CC || 0);
    const bhytCC = sorted.map(d => d.BHYT || 0);

    // --- DataZoom Logic ---
    const totalItems = dates.length;
    const needsDataZoom = totalItems > 10;
    const itemsToFocus = 15;
    let startPercent = 0;

    if (needsDataZoom && totalItems > itemsToFocus) {
      startPercent = Math.floor(100 - ((itemsToFocus / totalItems) * 100));
    }

    // Configure DataZoom
    const dataZoomConfig = needsDataZoom ? [
      {
        type: 'slider' as const,
        show: true,
        xAxisIndex: [0],
        start: startPercent,
        end: 100,
        bottom: 0, // FIX: Pin to absolute bottom
        height: 20,
        borderColor: this.palette.gray200,
        fillerColor: `${this.palette.primary}33`,
        textStyle: { color: this.palette.textSecondary, fontSize: 10 },
        handleStyle: {
          color: this.palette.primary,
          borderColor: this.palette.primary,
        },
        moveHandleStyle: { color: this.palette.primary },
      },
      {
        type: 'inside' as const,
        xAxisIndex: [0],
        start: startPercent,
        end: 100,
      },
    ] : [
      {
        type: 'slider' as const,
        show: false,
        xAxisIndex: [0],
        start: 0,
        end: 100
      },
      {
        type: 'inside' as const,
        disabled: true,
        xAxisIndex: [0],
        start: 0,
        end: 100
      }
    ];

    // ECharts Colors
    const colors = {
      admissions: this.palette.chart2,
      totalCC: this.palette.tealMidtone,
      bhytCC: this.palette.primary
    };

    // FIX: Layout Configuration
    // Move Legend to TOP, DataZoom at BOTTOM
    const commonGrid = {
      left: '3%',
      right: '4%',
      // Top padding for Legend
      top: 40,
      // Bottom padding: if Zoom exists, give space (e.g., 30px), else standard space
      bottom: needsDataZoom ? 30 : '3%',
      containLabel: true
    };

    const commonTooltip = {
      trigger: 'axis',
      backgroundColor: this.palette.bgCard,
      borderColor: this.palette.gray200,
      textStyle: { color: this.palette.textPrimary },
      confine: true,
      axisPointer: { type: 'shadow' }
    };

    this.comparisonChartOptions = {
      backgroundColor: 'transparent',
      textStyle: {
        fontFamily: GLOBAL_FONT_FAMILY,
        color: this.palette.textSecondary,
      },
      tooltip: {
        ...commonTooltip,
        formatter: (params: any) => {
          let result = `<div style="font-weight:bold">${params[0].name}</div>`;
          params.forEach((p: any) => {
            const value = NumberUtils.format(p.value);
            result += `
            <div style="display:flex; justify-content:space-between; gap:15px;">
              <span>${p.marker} ${p.seriesName}</span>
              <span style="font-weight:bold;">${value}</span>
            </div>`;
          });
          return result;
        }
      },
      grid: commonGrid,
      dataZoom: dataZoomConfig,
      legend: {
        data: ['Số ca nhập viện từ cấp cứu', 'Tổng số lượt cấp cứu', 'Tổng số lượt cấp cứu có BHYT'],
        // FIX: Move legend to Top to avoid collision with slider
        top: 0,
        left: 'center',
        textStyle: { color: this.palette.textSecondary }
      },
      xAxis: {
        type: 'category',
        data: dates,
        axisLabel: {
          color: this.palette.textPrimary,
          rotate: needsDataZoom ? 45 : 0,
          interval: needsDataZoom ? 0 : 'auto',
          margin: 10
        },
        axisLine: { lineStyle: { color: this.palette.gray200 } }
      },
      yAxis: [
        {
          type: 'value',
          name: 'Số Lượng',
          nameTextStyle: { color: this.palette.textSecondary },
          splitLine: { lineStyle: { type: 'dashed', color: this.palette.gray200 } },
          axisLabel: { color: this.palette.textSecondary }
        }
      ],
      series: [
        {
          name: 'Số ca nhập viện từ cấp cứu',
          type: 'bar',
          yAxisIndex: 0,
          barWidth: '50%',
          data: admissions,
          itemStyle: { color: colors.admissions, borderRadius: [4, 4, 0, 0] },
          label: { show: true, position: 'top', color: this.palette.textPrimary, fontSize: 10, distance: 5 },
          z: 1
        },
        {
          name: 'Tổng số lượt cấp cứu',
          type: 'line',
          yAxisIndex: 0,
          data: totalCC,
          smooth: true,
          symbol: 'circle',
          symbolSize: 8,
          itemStyle: { color: colors.totalCC },
          lineStyle: { width: 3 },
          z: 2,
          label: { show: true, position: 'top', color: colors.totalCC, formatter: (p: any) => NumberUtils.format(p.value) }
        },
        {
          name: 'Tổng số lượt cấp cứu có BHYT',
          type: 'line',
          yAxisIndex: 0,
          data: bhytCC,
          smooth: true,
          symbol: 'circle',
          symbolSize: 8,
          itemStyle: { color: colors.bhytCC },
          lineStyle: { width: 3 },
          z: 2,
          label: { show: true, position: 'top', color: colors.bhytCC, formatter: (p: any) => NumberUtils.format(p.value) }
        }
      ]
    };
  }

  public onExport(): void {
    if (this.isExporting || !this.rawData.length) return;
    this.isExporting = true;
    this.cd.markForCheck();
    setTimeout(() => {
      const columns: ExportColumn[] = [
        { key: 'NGAY_TIEP_NHAN_DISPLAY', header: 'Ngày', type: 'date' },
        { key: 'LUOT_CC', header: 'Tổng Lượt Cấp Cứu' },
        { key: 'NHAP_VIEN', header: 'Số Ca Nhập Viện' },
        { key: 'BHYT', header: 'Lượt Cấp Cứu BHYT' },
        { key: 'VIEN_PHI', header: 'Lượt Viện Phí' },
        { key: 'CHUYEN_VIEN', header: 'Số Ca Chuyển Viện' },
      ];
      this.excelService.exportToExcel(
        this.rawData,
        `BaoCao_CapCuu_LuuTru_${this.fromDate}_${this.toDate}`,
        columns
      );
      this.isExporting = false;
      this.toastService.showSuccess('Xuất Excel thành công.');
      this.cd.markForCheck();
    }, 500);
  }
}