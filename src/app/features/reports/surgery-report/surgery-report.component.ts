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
import { ExcelExportService, ExportColumn } from '../../../core/services/excel-export.service';
import { DateUtils } from '../../../shared/utils/date.utils';
import { SurgeryStat } from '../../../core/models/surgery-stat.model';

import { ChartCardComponent } from '../../../components/chart-card/chart-card.component';
import { DateFilterComponent, DateRange } from '../../../components/date-filter/date-filter.component';
import { TableCardComponent } from '../../../components/table-card/table-card.component';
import { GridColumn } from '../../../components/reusable-table/reusable-table.component';
import { WidgetCardComponent } from '../../../components/widget-card/widget-card.component';

const GLOBAL_FONT_FAMILY = 'Inter, sans-serif';

interface WidgetData {
  id: string;
  icon: string;
  title: string;
  value: string;
  caption: string;
  accentColor: string;
}

@Component({
  selector: 'app-surgery-report',
  standalone: true,
  imports: [
    CommonModule,
    ChartCardComponent,
    TableCardComponent,
    DateFilterComponent,
    WidgetCardComponent
  ],
  providers: [DatePipe, DecimalPipe],
  templateUrl: './surgery-report.component.html',
  styleUrl: './surgery-report.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SurgeryReportComponent implements OnInit {
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
  public rawData: SurgeryStat[] = [];
  
  public fromDate: string = '';
  public toDate: string = '';

  // UI Data
  public widgetData: WidgetData[] = [];
  public trendChartOptions: EChartsCoreOption | null = null;
  public specialtyChartOptions: EChartsCoreOption | null = null;
  public surgeonChartOptions: EChartsCoreOption | null = null;

  public tableColumns: GridColumn[] = [
    { key: 'NGAY_PT_DISPLAY', label: 'Ngày Phẫu Thuật', sortable: true, width: '120px' },
    { key: 'PTV_CHINH', label: 'PTV Chính', sortable: true, width: '250px' },
    { key: 'CHUYEN_KHOA', label: 'Chuyên Khoa', sortable: true, width: '200px' },
    { key: 'SO_LUONG', label: 'Số Lượng', sortable: true, width: '100px' }
  ];

  private palette!: ThemePalette;
  private readonly vnNumberFormatter = new Intl.NumberFormat('vi-VN');

  constructor() {
    effect(() => {
      this.palette = this.themeService.currentPalette();
      if (!this.isLoading && this.rawData.length > 0) {
        this.processData(this.rawData);
      }
      this.updateWidgetColors();
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

  private initializeWidgets(): void {
    this.widgetData = [
      {
        id: 'total',
        icon: 'fas fa-procedures',
        title: 'Tổng Ca Phẫu Thuật',
        value: '0',
        caption: 'Thực hiện',
        accentColor: '#00839b',
      },
      {
        id: 'top-specialty',
        icon: 'fas fa-star',
        title: 'Khoa Nhiều Nhất',
        value: '...',
        caption: 'Hoạt động cao nhất',
        accentColor: '#f89c5b',
      },
      {
        id: 'top-surgeon',
        icon: 'fas fa-user-md',
        title: 'PTV Tích Cực',
        value: '...',
        caption: 'Số ca nhiều nhất',
        accentColor: '#52c3d7',
      }
    ];
  }

  private updateWidgetColors(): void {
    if (this.widgetData.length > 0 && this.palette) {
      const setC = (id: string, color: string) => {
        const item = this.widgetData.find((x) => x.id === id);
        if (item) item.accentColor = color;
      };
      setC('total', this.palette.primary);
      setC('top-specialty', this.palette.chart6);
      setC('top-surgeon', this.palette.tealMidtone);
    }
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
    this.specialtyChartOptions = null;
    this.surgeonChartOptions = null;
    this.cd.markForCheck();

    this.reportService.getSurgeryReport(this.fromDate, this.toDate)
      .pipe(
        finalize(() => {
          this.isLoading = false;
          this.cd.markForCheck();
        }),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe({
        next: (data) => {
          this.rawData = data.map(item => ({
            ...item,
            NGAY_PT_DISPLAY: DateUtils.formatToDisplay(item.NGAY_PT)
          }));
          this.processData(this.rawData);
        },
        error: (err) => {
          console.error(err);
          this.toastService.showError('Không thể tải dữ liệu báo cáo phẫu thuật.');
          this.rawData = [];
          this.initializeWidgets();
        }
      });
  }

  private processData(data: SurgeryStat[]): void {
    if (!data || data.length === 0) {
      this.initializeWidgets();
      return;
    }

    let totalCases = 0;
    const dateMap = new Map<string, number>();
    const specialtyMap = new Map<string, number>();
    const surgeonMap = new Map<string, number>();

    data.forEach(item => {
      const qty = item.SO_LUONG || 0;
      totalCases += qty;

      // Date Aggregation
      const dateKey = item.NGAY_PT ? item.NGAY_PT.split('T')[0] : 'N/A';
      dateMap.set(dateKey, (dateMap.get(dateKey) || 0) + qty);

      // Specialty Aggregation
      const specialty = item.CHUYEN_KHOA || 'Khác';
      specialtyMap.set(specialty, (specialtyMap.get(specialty) || 0) + qty);

      // Surgeon Aggregation
      const surgeon = item.PTV_CHINH || 'Chưa xác định';
      surgeonMap.set(surgeon, (surgeonMap.get(surgeon) || 0) + qty);
    });

    // Top Stats
    const topSpecialty = [...specialtyMap.entries()].sort((a, b) => b[1] - a[1])[0];
    const topSurgeon = [...surgeonMap.entries()].sort((a, b) => b[1] - a[1])[0];

    // Update Widgets
    this.widgetData = [
      {
        id: 'total',
        icon: 'fas fa-procedures',
        title: 'Tổng Ca Phẫu Thuật',
        value: this.formatNumber(totalCases),
        caption: 'Thực hiện',
        accentColor: this.palette.primary,
      },
      {
        id: 'top-specialty',
        icon: 'fas fa-star',
        title: topSpecialty ? topSpecialty[0] : 'N/A',
        value: topSpecialty ? this.formatNumber(topSpecialty[1]) : '0',
        caption: 'Khoa đông nhất',
        accentColor: this.palette.chart6,
      },
      {
        id: 'top-surgeon',
        icon: 'fas fa-user-md',
        title: topSurgeon ? topSurgeon[0] : 'N/A',
        value: topSurgeon ? this.formatNumber(topSurgeon[1]) : '0',
        caption: 'PTV tích cực nhất',
        accentColor: this.palette.tealMidtone,
      }
    ];

    this.buildCharts(dateMap, specialtyMap, surgeonMap);
  }

  private buildCharts(
    dateMap: Map<string, number>,
    specialtyMap: Map<string, number>,
    surgeonMap: Map<string, number>
  ): void {
    const commonOptions = {
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
        confine: true,
      },
      grid: { left: '3%', right: '4%', bottom: '5%', top: '12%', containLabel: true },
    };

    // 1. Daily Trend Chart (Line + Trend Line)
    const sortedDates = [...dateMap.keys()].sort();
    const dateLabels = sortedDates.map(d => {
      const dt = new Date(d);
      return this.datePipe.transform(dt, 'dd/MM') || d;
    });
    const dateValues = sortedDates.map(d => dateMap.get(d) || 0);

    // --- Calculate Linear Regression (Trending Line) ---
    let trendData: number[] = [];
    const n = dateValues.length;
    
    if (n > 1) {
      let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
      for (let i = 0; i < n; i++) {
        sumX += i;
        sumY += dateValues[i];
        sumXY += i * dateValues[i];
        sumXX += i * i;
      }
      
      // Slope (m)
      const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
      // Intercept (b)
      const intercept = (sumY - slope * sumX) / n;
      
      // Generate trend points
      trendData = Array.from({length: n}, (_, i) => Number((slope * i + intercept).toFixed(2)));
    }

    this.trendChartOptions = {
      ...commonOptions,
      legend: {
        show: true,
        textStyle: { color: this.palette.textSecondary },
        top: 0,
        left: 'center'
      },
      xAxis: {
        type: 'category',
        boundaryGap: false, 
        data: dateLabels,
        axisLine: { lineStyle: { color: this.palette.gray200 } },
        axisLabel: { color: this.palette.textPrimary }
      },
      yAxis: {
        type: 'value',
        splitLine: { lineStyle: { type: 'dashed', color: this.palette.gray200 } },
        axisLabel: { color: this.palette.textSecondary }
      },
      series: [
        {
          name: 'Số ca',
          type: 'line',
          smooth: true,
          symbol: 'circle',
          symbolSize: 8,
          data: dateValues,
          itemStyle: { color: this.palette.primary },
          lineStyle: { width: 3 },
          areaStyle: {
            color: {
              type: 'linear',
              x: 0, y: 0, x2: 0, y2: 1,
              colorStops: [
                { offset: 0, color: this.palette.primary },
                { offset: 1, color: this.palette.bgCard }
              ]
            },
            opacity: 0.3
          },
          label: { show: true, position: 'top', color: this.palette.textPrimary },
          // Markline for Average
          markLine: {
            data: [{ type: 'average', name: 'TB' }],
            lineStyle: { color: this.palette.secondary, type: 'dashed', opacity: 0.7 },
            label: { position: 'insideEndTop', formatter: 'TB: {c}' },
            symbol: 'none'
          }
        },
        // Trend Line
        {
          name: 'Xu hướng',
          type: 'line',
          data: trendData,
          symbol: 'none',
          smooth: false,
          lineStyle: { 
            type: 'dashed', 
            color: this.palette.warning, 
            width: 2 
          },
          tooltip: { show: false },
          itemStyle: { opacity: 0 }
        }
      ]
    };

    // 2. Specialty Chart (Vertical Bar)
    const sortedSpecs = [...specialtyMap.entries()].sort((a, b) => b[1] - a[1]);
    this.specialtyChartOptions = {
      ...commonOptions,
      tooltip: { ...commonOptions.tooltip, axisPointer: { type: 'shadow' } },
      xAxis: {
        type: 'category',
        data: sortedSpecs.map(s => s[0]),
        axisLabel: { 
          rotate: 25, 
          interval: 0,
          width: 100,
          overflow: 'truncate',
          color: this.palette.textPrimary
        }
      },
      yAxis: {
        type: 'value',
        splitLine: { lineStyle: { type: 'dashed', color: this.palette.gray200 } }
      },
      series: [{
        name: 'Số ca',
        type: 'bar',
        barWidth: '40%',
        data: sortedSpecs.map(s => s[1]),
        itemStyle: { 
          color: this.palette.chart6,
          borderRadius: [4, 4, 0, 0] 
        },
        label: { show: true, position: 'top', color: this.palette.textPrimary }
      }]
    };

    // 3. Top Surgeons Chart (Horizontal Bar)
    const sortedSurgeons = [...surgeonMap.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .reverse(); 

    this.surgeonChartOptions = {
      ...commonOptions,
      tooltip: { ...commonOptions.tooltip, axisPointer: { type: 'shadow' } },
      xAxis: {
        type: 'value',
        splitLine: { lineStyle: { type: 'dashed', color: this.palette.gray200 } }
      },
      yAxis: {
        type: 'category',
        data: sortedSurgeons.map(s => s[0]),
        axisLabel: { 
          width: 110, 
          overflow: 'truncate',
          color: this.palette.textPrimary 
        },
        axisLine: { show: false },
        axisTick: { show: false }
      },
      series: [{
        name: 'Số ca',
        type: 'bar',
        barWidth: '60%',
        data: sortedSurgeons.map(s => s[1]),
        itemStyle: { 
          color: this.palette.tealMidtone,
          borderRadius: [0, 4, 4, 0] 
        },
        label: { show: true, position: 'right', color: this.palette.textPrimary }
      }]
    };
  }

  private formatNumber(num: number): string {
    return this.vnNumberFormatter.format(num);
  }

  public onExport(): void {
    if (this.isExporting || !this.rawData.length) return;
    this.isExporting = true;
    this.cd.markForCheck();
    
    setTimeout(() => {
      const columns: ExportColumn[] = [
        { key: 'NGAY_PT_DISPLAY', header: 'Ngày Phẫu Thuật', type: 'date' },
        { key: 'PTV_CHINH', header: 'Phẫu Thuật Viên Chính' },
        { key: 'CHUYEN_KHOA', header: 'Chuyên Khoa' },
        { key: 'SO_LUONG', header: 'Số Lượng' }
      ];
      
      this.excelService.exportToExcel(
        this.rawData,
        `BaoCao_PhauThuat_${this.fromDate}_${this.toDate}`,
        columns
      );
      
      this.isExporting = false;
      this.toastService.showSuccess('Xuất Excel thành công.');
      this.cd.markForCheck();
    }, 500);
  }
}