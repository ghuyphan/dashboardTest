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
import { finalize } from 'rxjs/operators';
import { forkJoin } from 'rxjs';
import type { EChartsCoreOption } from 'echarts/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import { ReportService } from '../../../core/services/report.service';
import { ToastService } from '../../../core/services/toast.service';
import {
  ThemeService,
  ThemePalette,
} from '../../../core/services/theme.service';
import { EmergencyStat } from '../../../shared/models/emergency-stat';
import {
  ExcelExportService,
  ExportColumn,
} from '../../../core/services/excel-export.service';
import { DateUtils } from '../../../shared/utils/date.utils';
import { NumberUtils } from '../../../shared/utils/number.utils';

import { ChartCardComponent } from '../../../shared/components/chart-card/chart-card.component';
import {
  DateFilterComponent,
  DateRange,
} from '../../../shared/components/date-filter/date-filter.component';
import { TableCardComponent } from '../../../shared/components/table-card/table-card.component';
import { GridColumn } from '../../../shared/components/reusable-table/reusable-table.component';
import { WidgetCardComponent } from '../../../shared/components/widget-card/widget-card.component';

interface WidgetData {
  id: string;
  icon: string;
  title: string;
  value: string;
  caption: string;
  accentColor: string;
}

@Component({
  selector: 'app-emergency-summary',
  standalone: true,
  imports: [
    CommonModule,
    ChartCardComponent,
    TableCardComponent,
    DateFilterComponent,
    WidgetCardComponent,
  ],
  providers: [DatePipe],
  templateUrl: './emergency-summary.component.html',
  styleUrl: './emergency-summary.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EmergencySummaryComponent implements OnInit {
  private reportService = inject(ReportService);
  private toastService = inject(ToastService);
  private excelService = inject(ExcelExportService);
  private cd = inject(ChangeDetectorRef);
  private datePipe = inject(DatePipe);

  private destroyRef = inject(DestroyRef);
  public readonly themeService = inject(ThemeService);

  public isLoading = false;
  public isExporting = false;
  public rawData: EmergencyStat[] = [];
  public fromDate: string = '';
  public toDate: string = '';

  // Store previous year data for chart rebuilding on theme change
  private previousYearData: EmergencyStat[] = [];

  public widgetData: WidgetData[] = [];

  // Charts
  public trendChartOptions: EChartsCoreOption | null = null;
  public admissionChartOptions: EChartsCoreOption | null = null;
  public transferChartOptions: EChartsCoreOption | null = null;
  public insuranceChartOptions: EChartsCoreOption | null = null;

  public tableColumns: GridColumn[] = [
    {
      key: 'NGAY_TIEP_NHAN_DISPLAY',
      label: 'Ngày',
      sortable: true,
      width: '120px',
    },
    { key: 'LUOT_CC', label: 'Tổng Lượt', sortable: true, width: '100px' },
    { key: 'NHAP_VIEN', label: 'Nhập Viện', sortable: true, width: '100px' },
    {
      key: 'CHUYEN_VIEN',
      label: 'Chuyển Viện',
      sortable: true,
      width: '100px',
    },
    { key: 'BHYT', label: 'BHYT', sortable: true, width: '100px' },
    { key: 'VIEN_PHI', label: 'Viện Phí', sortable: true, width: '100px' },
  ];

  private palette!: ThemePalette;

  constructor() {
    effect(() => {
      this.palette = this.themeService.currentPalette();
      if (!this.isLoading && this.rawData.length > 0) {
        this.updateWidgetColors();
        // Rebuild charts with new palette colors
        this.rebuildChartsWithCurrentData();
      }
      this.cd.markForCheck();
    });
  }

  ngOnInit(): void {
    this.setDefaultDateRange();
    this.initializeWidgets();
    this.loadData();
  }

  private setDefaultDateRange(): void {
    const range = DateUtils.getReportingWeekRange();
    this.fromDate = range.fromDate;
    this.toDate = range.toDate;
  }

  private formatDate(date: Date): string {
    const y = date.getFullYear();
    const m = (date.getMonth() + 1).toString().padStart(2, '0');
    const d = date.getDate().toString().padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  private initializeWidgets(): void {
    this.widgetData = [
      {
        id: 'total',
        icon: 'fas fa-ambulance',
        title: 'Tổng Lượt CC',
        value: '0',
        caption: 'Cấp cứu',
        accentColor: this.palette?.primary || '#00839b',
      },
      {
        id: 'admission',
        icon: 'fas fa-procedures',
        title: 'Nhập Viện',
        value: '0',
        caption: 'Từ Cấp cứu',
        accentColor: this.palette?.chart6 || '#f89c5b',
      },
      {
        id: 'transfer',
        icon: 'fas fa-exchange-alt',
        title: 'Chuyển Viện',
        value: '0',
        caption: 'Chuyển tuyến',
        accentColor: this.palette?.pastelCoral || '#ffb3ba',
      },
      {
        id: 'insurance',
        icon: 'fas fa-id-card',
        title: 'Tỷ lệ BHYT',
        value: '0%',
        caption: 'Có BHYT',
        accentColor: this.palette?.deepSapphire || '#082567',
      },
    ];
  }

  private updateWidgetColors(): void {
    if (this.widgetData.length > 0 && this.palette) {
      const setC = (id: string, color: string) => {
        const item = this.widgetData.find((x) => x.id === id);
        if (item) item.accentColor = color;
      };
      setC('total', this.palette.widgetAccent);
      setC('admission', this.palette.widgetAccent);
      setC('transfer', this.palette.widgetAccent);
      setC('insurance', this.palette.widgetAccent);
    }
  }

  /**
   * Rebuild charts with current data when theme changes.
   * This ensures chart colors are updated to match the new palette.
   */
  private rebuildChartsWithCurrentData(): void {
    if (this.rawData.length === 0) return;

    // Re-process data with the new palette colors
    const sortedCurrent = [...this.rawData].sort(
      (a, b) =>
        new Date(a.NGAY_TIEP_NHAN).getTime() -
        new Date(b.NGAY_TIEP_NHAN).getTime()
    );
    const sortedPrevious = [...this.previousYearData].sort(
      (a, b) =>
        new Date(a.NGAY_TIEP_NHAN).getTime() -
        new Date(b.NGAY_TIEP_NHAN).getTime()
    );

    const dates = sortedCurrent.map((d) => {
      const dateObj = new Date(d.NGAY_TIEP_NHAN);
      return this.datePipe.transform(dateObj, 'dd/MM') || '';
    });

    const ccDataCurrent = sortedCurrent.map((d) => d.LUOT_CC);
    const ccDataPrevious = dates.map((_, index) => {
      return sortedPrevious[index] ? sortedPrevious[index].LUOT_CC : null;
    });

    const nhapVienData = sortedCurrent.map((d) => d.NHAP_VIEN);
    const chuyenVienData = sortedCurrent.map((d) => d.CHUYEN_VIEN);

    // Calculate totals for pie chart
    let totalBHYT = 0;
    let totalVienPhi = 0;
    this.rawData.forEach((item) => {
      totalBHYT += item.BHYT || 0;
      totalVienPhi += item.VIEN_PHI || 0;
    });

    this.buildCharts(
      dates,
      ccDataCurrent,
      ccDataPrevious,
      nhapVienData,
      chuyenVienData,
      totalBHYT,
      totalVienPhi
    );
  }

  public onDateFilter(range: DateRange): void {
    this.fromDate = range.fromDate;
    this.toDate = range.toDate;
    this.loadData();
  }

  public loadData(): void {
    if (!this.fromDate || !this.toDate) return;

    this.isLoading = true;
    this.trendChartOptions = null;
    this.admissionChartOptions = null;
    this.transferChartOptions = null;
    this.insuranceChartOptions = null;
    this.cd.markForCheck();

    // Calculate Last Year's Range
    const currStart = new Date(this.fromDate);
    const currEnd = new Date(this.toDate);

    const prevStart = new Date(currStart);
    prevStart.setFullYear(currStart.getFullYear() - 1);

    const prevEnd = new Date(currEnd);
    prevEnd.setFullYear(currEnd.getFullYear() - 1);

    const prevFromDate = this.formatDate(prevStart);
    const prevToDate = this.formatDate(prevEnd);

    // [OPTIMIZATION] Ensure UI renders loading state before fetching
    setTimeout(() => {
      forkJoin({
        current: this.reportService.getEmergencySummary(
          this.fromDate,
          this.toDate
        ),
        previous: this.reportService.getEmergencySummary(
          prevFromDate,
          prevToDate
        ),
      })
        .pipe(
          finalize(() => {
            this.isLoading = false;
            this.cd.markForCheck();
          }),
          takeUntilDestroyed(this.destroyRef)
        )
        .subscribe({
          next: ({ current, previous }) => {
            this.rawData = current.map((item) => ({
              ...item,
              NGAY_TIEP_NHAN_DISPLAY: DateUtils.formatToDisplay(
                item.NGAY_TIEP_NHAN
              ),
            }));

            this.processData(current, previous);
          },
          error: (err) => {
            console.error(err);
            this.toastService.showError('Không thể tải dữ liệu báo cáo.');
            this.rawData = [];
            this.initializeWidgets();
          },
        });
    }, 0);
  }

  private processData(
    currentData: EmergencyStat[],
    previousData: EmergencyStat[]
  ): void {
    // Store previous data for theme change rebuilds
    this.previousYearData = previousData;

    if (!currentData || currentData.length === 0) {
      this.initializeWidgets();
      return;
    }

    // Totals
    let totalCC = 0;
    let totalNhapVien = 0;
    let totalChuyenVien = 0;
    let totalBHYT = 0;
    let totalVienPhi = 0;

    currentData.forEach((item) => {
      totalCC += item.LUOT_CC || 0;
      totalNhapVien += item.NHAP_VIEN || 0;
      totalChuyenVien += item.CHUYEN_VIEN || 0;
      totalBHYT += item.BHYT || 0;
      totalVienPhi += item.VIEN_PHI || 0;
    });

    // Widgets
    const insuranceRate = totalCC > 0 ? (totalBHYT / totalCC) * 100 : 0;

    this.widgetData = [
      {
        id: 'total',
        icon: 'fas fa-ambulance',
        title: 'Tổng Lượt CC',
        value: NumberUtils.format(totalCC),
        caption: 'Cấp cứu',
        accentColor: this.palette.primary,
      },
      {
        id: 'admission',
        icon: 'fas fa-procedures',
        title: 'Nhập Viện',
        value: NumberUtils.format(totalNhapVien),
        caption: `Chiếm ${totalCC > 0 ? ((totalNhapVien / totalCC) * 100).toFixed(1) : 0
          }%`,
        accentColor: this.palette.chart6,
      },
      {
        id: 'transfer',
        icon: 'fas fa-exchange-alt',
        title: 'Chuyển Viện',
        value: NumberUtils.format(totalChuyenVien),
        caption: 'Chuyển tuyến',
        accentColor: this.palette.pastelCoral,
      },
      {
        id: 'insurance',
        icon: 'fas fa-id-card',
        title: 'Tỷ lệ BHYT',
        value: `${insuranceRate.toFixed(1)}%`,
        caption: `Có BHYT (${NumberUtils.format(totalBHYT)})`,
        accentColor: this.palette.deepSapphire,
      },
    ];

    // Charts Data
    const sortedCurrent = [...currentData].sort(
      (a, b) =>
        new Date(a.NGAY_TIEP_NHAN).getTime() -
        new Date(b.NGAY_TIEP_NHAN).getTime()
    );
    const sortedPrevious = [...previousData].sort(
      (a, b) =>
        new Date(a.NGAY_TIEP_NHAN).getTime() -
        new Date(b.NGAY_TIEP_NHAN).getTime()
    );

    const dates = sortedCurrent.map((d) => {
      const dateObj = new Date(d.NGAY_TIEP_NHAN);
      return this.datePipe.transform(dateObj, 'dd/MM') || '';
    });

    const ccDataCurrent = sortedCurrent.map((d) => d.LUOT_CC);
    const ccDataPrevious = dates.map((_, index) => {
      return sortedPrevious[index] ? sortedPrevious[index].LUOT_CC : null;
    });

    const nhapVienData = sortedCurrent.map((d) => d.NHAP_VIEN);
    const chuyenVienData = sortedCurrent.map((d) => d.CHUYEN_VIEN);

    this.buildCharts(
      dates,
      ccDataCurrent,
      ccDataPrevious,
      nhapVienData,
      chuyenVienData,
      totalBHYT,
      totalVienPhi
    );
  }

  private buildCharts(
    dates: string[],
    ccCurrent: number[],
    ccPrevious: (number | null)[],
    nhapVienData: number[],
    chuyenVienData: number[],
    totalBHYT: number,
    totalVienPhi: number
  ): void {
    const commonGrid = {
      left: '3%',
      right: '4%',
      bottom: '12%',
      top: '12%',
      containLabel: true,
    };
    const commonLegend = {
      show: true,
      top: 0,
      itemWidth: 25, // Ensure dashes are visible
      textStyle: { color: this.palette.textSecondary },
    };
    const commonTooltip = {
      trigger: 'axis',
      backgroundColor: this.palette.bgCard,
      borderColor: this.palette.gray200,
      textStyle: { color: this.palette.textPrimary },
      confine: true,
    };

    // 1. Trend Chart (Comparison)
    this.trendChartOptions = {
      backgroundColor: 'transparent',
      tooltip: commonTooltip,
      grid: commonGrid,
      legend: commonLegend,
      xAxis: {
        type: 'category',
        data: dates,
        axisLabel: {
          color: this.palette.textPrimary,
        },
        axisLine: { lineStyle: { color: this.palette.gray200 } },
      },
      yAxis: {
        type: 'value',
        splitLine: {
          lineStyle: { type: 'solid', color: this.palette.gray200 },
        },
        axisLabel: { color: this.palette.textSecondary },
      },
      series: [
        {
          name: 'Năm nay',
          type: 'line',
          smooth: true,
          symbol: 'circle',
          symbolSize: 8,
          data: ccCurrent,
          itemStyle: { color: this.palette.primary },
          lineStyle: { width: 3 },
          areaStyle: {
            color: {
              type: 'linear',
              x: 0,
              y: 0,
              x2: 0,
              y2: 1,
              colorStops: [
                { offset: 0, color: this.palette.primary },
                { offset: 1, color: this.palette.bgCard },
              ],
            },
            opacity: 0.2,
          },
        },
        {
          name: 'Năm ngoái',
          type: 'line',
          smooth: true,
          symbol: 'circle',
          symbolSize: 6,
          data: ccPrevious,
          itemStyle: { color: this.palette.gray400 },
          lineStyle: {
            width: 2,
            type: [5, 5],  // Cleaner dash pattern: [dash length, gap length]
            dashOffset: 0
          },
        },
      ],
    };

    // 2. Transfer Chart
    this.transferChartOptions = {
      backgroundColor: 'transparent',
      tooltip: commonTooltip,
      grid: commonGrid,
      xAxis: {
        type: 'category',
        data: dates,
        axisLabel: {
          color: this.palette.textPrimary,
        },
        axisLine: { lineStyle: { color: this.palette.gray200 } },
      },
      yAxis: {
        type: 'value',
        splitLine: {
          lineStyle: { type: 'solid', color: this.palette.gray200 },
        },
        axisLabel: { color: this.palette.textSecondary },
      },
      series: [
        {
          name: 'Số ca chuyển tuyến',
          type: 'bar',
          barWidth: '50%',
          data: chuyenVienData,
          itemStyle: {
            color: this.palette.pastelCoral,
            borderRadius: [4, 4, 0, 0],
          },
          label: {
            show: true,
            position: 'top',
            color: this.palette.textPrimary,
            fontSize: 10,
          },
        },
      ],
    };

    // 3. Admission Chart
    this.admissionChartOptions = {
      backgroundColor: 'transparent',
      tooltip: {
        ...commonTooltip,
        formatter: (params: any) => {
          let result = `${params[0].name}<br/>`;
          const total =
            params.find((p: any) => p.seriesName === 'Tổng lượt CC')?.value ||
            0;
          const admitted =
            params.find((p: any) => p.seriesName === 'Nhập viện')?.value || 0;
          params.forEach((p: any) => {
            result += `${p.marker} ${p.seriesName}: <b>${NumberUtils.format(p.value)}</b>`;
            if (p.seriesName === 'Nhập viện' && total > 0)
              result += ` (${((admitted / total) * 100).toFixed(1)}%)`;
            result += '<br/>';
          });
          return result;
        },
      },
      grid: commonGrid,
      legend: commonLegend,
      xAxis: {
        type: 'category',
        data: dates,
        axisLabel: {
          color: this.palette.textPrimary,
        },
        axisLine: { lineStyle: { color: this.palette.gray200 } },
      },
      yAxis: [
        {
          type: 'value',
          name: 'Số lượng',
          splitLine: {
            lineStyle: { type: 'solid', color: this.palette.gray200 },
          },
          axisLabel: { color: this.palette.textSecondary },
        },
      ],
      series: [
        {
          name: 'Tổng lượt CC',
          type: 'bar',
          barWidth: '40%',
          barGap: '-100%',
          data: ccCurrent,
          itemStyle: { color: this.palette.gray300, opacity: 0.5 },
          z: 1,
        },
        {
          name: 'Nhập viện',
          type: 'bar',
          barWidth: '40%',
          data: nhapVienData,
          itemStyle: { color: this.palette.chart2 },
          label: {
            show: true,
            position: 'top',
            color: this.palette.textPrimary,
            fontSize: 10,
          },
          z: 2,
        },
      ],
    };

    // 4. Insurance Chart (No DataZoom needed)
    this.insuranceChartOptions = {
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'item',
        backgroundColor: this.palette.bgCard,
        borderColor: this.palette.gray200,
        textStyle: { color: this.palette.textPrimary },
        formatter: (params: any) => {
          return `${params.marker} ${params.name}: <b>${NumberUtils.format(params.value)}</b> (${params.percent}%)`;
        },
      },
      legend: {
        bottom: 0,
        left: 'center',
        textStyle: { color: this.palette.textSecondary },
      },
      series: [
        {
          name: 'Đối tượng',
          type: 'pie',
          radius: ['40%', '70%'],
          center: ['50%', '45%'],
          itemStyle: {
            borderRadius: 5,
            borderColor: this.palette.bgCard,
            borderWidth: 2,
          },
          label: {
            show: true,
            formatter: '{b}: {d}%',
            color: this.palette.textPrimary,
          },
          data: [
            {
              value: totalBHYT,
              name: 'BHYT',
              itemStyle: { color: this.palette.secondary },
            },
            {
              value: totalVienPhi,
              name: 'Viện phí',
              itemStyle: { color: this.palette.warning },
            },
          ],
        },
      ],
    };
  }


  public onExport(): void {
    if (this.isExporting || !this.rawData.length) return;
    this.isExporting = true;
    setTimeout(() => {
      const columns: ExportColumn[] = [
        { key: 'NGAY_TIEP_NHAN_DISPLAY', header: 'Ngày', type: 'date' },
        { key: 'LUOT_CC', header: 'Tổng Lượt Cấp Cứu' },
        { key: 'NHAP_VIEN', header: 'Số Ca Nhập Viện' },
        { key: 'CHUYEN_VIEN', header: 'Số Ca Chuyển Viện' },
        { key: 'BHYT', header: 'Lượt BHYT' },
        { key: 'VIEN_PHI', header: 'Lượt Viện Phí' },
      ];
      this.excelService.exportToExcel(
        this.rawData,
        `BaoCao_CapCuu_${this.fromDate}_${this.toDate}`,
        columns
      );
      this.isExporting = false;
      this.toastService.showSuccess('Xuất Excel thành công.');
      this.cd.markForCheck();
    }, 500);
  }
}
