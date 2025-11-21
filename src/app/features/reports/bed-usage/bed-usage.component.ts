import {
  Component,
  OnInit,
  inject,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  DestroyRef,
  effect
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { finalize } from 'rxjs/operators';
import { timer } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import type { EChartsCoreOption } from 'echarts/core';

import { WidgetCardComponent } from '../../../components/widget-card/widget-card.component';
import { ChartCardComponent } from '../../../components/chart-card/chart-card.component';
import { environment } from '../../../../environments/environment.development';
import { ThemeService } from '../../../core/services/theme.service';

// Constants
const GLOBAL_FONT_FAMILY =
  'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
const AUTO_REFRESH_INTERVAL = 60_000; // 1 minute
const CHART_BAR_WIDTH = '60%';

// Interfaces
interface ApiResponseData {
  TenPhongBan: string;
  Tong: number;
  GiuongTrong: number;
  DangSuDung: number;
  ChoXuatVien: number;
  DaBook: number;
  ChuaSanSang: number;
  ChoMuonGiuong: number;
}

interface DepartmentChartData {
  viName: string;
  enName: string;
  totalBeds: number;
  giuongTrong: number;
  dangDieuTri: number;
  choXuatVien: number;
  daBook: number;
  chuaSanSang: number;
  choMuonGiuong: number;
}

interface WidgetData {
  id: string;
  icon: string;
  title: string;
  value: string;
  caption: string;
  accentColor: string;
}

interface BedStatusSeries {
  name: string;
  dataKey: keyof DepartmentChartData;
  color: string;
}

interface BedTotals {
  giuongTrong: number;
  dangDieuTri: number;
  choXuatVien: number;
  daBook: number;
  chuaSanSang: number;
  choMuonGiuong: number;
  totalBeds: number;
}

interface CssVariables {
  chart1: string;
  chart2: string;
  chart3: string;
  chart6: string;
  chart7: string;
  chart8: string;
  chart9: string;
  white: string;
  gray200: string;
  gray700: string;
  gray800: string;
  peacockBlue: string;
  tealBlue: string;
}

// Utility function
function getCssVar(name: string): string {
  if (typeof document === 'undefined') return '';
  return getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
}

@Component({
  selector: 'app-bed-usage',
  standalone: true,
  imports: [CommonModule, WidgetCardComponent, ChartCardComponent],
  templateUrl: './bed-usage.component.html',
  styleUrl: './bed-usage.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BedUsageComponent implements OnInit {
  // Dependency Injection
  private readonly http = inject(HttpClient);
  private readonly cd = inject(ChangeDetectorRef);
  private readonly destroyRef = inject(DestroyRef);

  // Public Properties
  public isLoading = true; 
  public isRefreshing = false;
  public currentDateTime = '';
  public chartOptions: EChartsCoreOption | null = null;
  public widgetData: WidgetData[] = []; 
  public readonly themeService = inject(ThemeService);

  // Private Properties
  private bedStatusSeries: BedStatusSeries[] = [];
  private cssVars: CssVariables = {} as CssVariables;
  private widgetDefinitions: WidgetData[] = [];

  constructor() {
    // 1. React to theme changes to re-initialize colors and rebuild chart options
    effect(() => {
        // Track the theme state
        const isDark = this.themeService.isDarkTheme();

        // Re-initialize colors to fetch new CSS variables
        this.initializeColors();
        
        // Skip on initial call if we haven't loaded data yet
        if (!this.isLoading && this.widgetData.length > 0) {
            this.loadData(); // Forced refresh to redraw charts with new palette
        }
        this.cd.markForCheck();
    });
  }

  ngOnInit(): void {
    this.initializeColors(); 
    this.cd.markForCheck(); 

    // Use RxJS timer for initial load (0ms) and auto-refresh (60s)
    timer(0, AUTO_REFRESH_INTERVAL)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.loadData();
      });
  }

  /**
   * Initializes CSS variables and widget configurations
   */
  private initializeColors(): void {
    this.cssVars = {
      chart1: getCssVar('--chart-color-1'),
      chart2: getCssVar('--chart-color-2'),
      chart3: getCssVar('--chart-color-3'),
      chart6: getCssVar('--chart-color-6'),
      chart7: getCssVar('--chart-color-7'),
      chart8: getCssVar('--chart-color-8'),
      chart9: getCssVar('--chart-color-9'),
      white: getCssVar('--white'),
      gray200: getCssVar('--gray-200'),
      gray700: getCssVar('--gray-700'),
      gray800: getCssVar('--gray-800'),
      peacockBlue: getCssVar('--peacock-blue'),
      tealBlue: getCssVar('--teal-blue'),
    };

    this.initializeWidgetDefinitions();
    this.initializeBedStatusSeries();
  }

  /**
   * Initializes widget data with default values
   */
  private initializeWidgetDefinitions(): void {
    this.widgetDefinitions = [
      {
        id: 'occupancyRate',
        title: 'Công Suất',
        value: '0,0%',
        caption: 'Occupancy Rate',
        icon: 'fas fa-chart-pie',
        accentColor: this.cssVars.chart1,
      },
      {
        id: 'totalBeds',
        title: 'Tổng Số',
        value: '0',
        caption: 'Total Beds',
        icon: 'fas fa-hospital',
        accentColor: this.cssVars.chart2,
      },
      {
        id: 'giuongTrong',
        title: 'Giường Trống',
        value: '0',
        caption: 'Vacant Beds',
        icon: 'fas fa-check-circle',
        accentColor: this.cssVars.chart3,
      },
      {
        id: 'dangDieuTri',
        title: 'Đang Điều Trị',
        value: '0',
        caption: 'In Treatment',
        icon: 'fas fa-user-injured',
        accentColor: this.cssVars.chart1,
      },
      {
        id: 'choXuatVien',
        title: 'Chờ Xuất Viện',
        value: '0',
        caption: 'Awaiting Discharge',
        icon: 'fas fa-door-open',
        accentColor: this.cssVars.chart8,
      },
      {
        id: 'daBook',
        title: 'Đã Book',
        value: '0',
        caption: 'Booked Beds',
        icon: 'fas fa-bookmark',
        accentColor: this.cssVars.chart6,
      },
      {
        id: 'chuaSanSang',
        title: 'Chưa Sẵn Sàng',
        value: '0',
        caption: 'Not Ready',
        icon: 'fas fa-tools',
        accentColor: this.cssVars.chart7,
      },
      {
        id: 'choMuonGiuong',
        title: 'Cho Mượn Giường',
        value: '0',
        caption: 'On Loan',
        icon: 'fas fa-hand-holding-medical',
        accentColor: this.cssVars.chart9,
      },
    ];
  }

  /**
   * Initializes bed status series configuration for charts
   */
  private initializeBedStatusSeries(): void {
    this.bedStatusSeries = [
      {
        name: 'Giường trống (Vacant)',
        dataKey: 'giuongTrong',
        color: this.cssVars.chart3,
      },
      {
        name: 'Đang điều trị (In Treatment)',
        dataKey: 'dangDieuTri',
        color: this.cssVars.chart1,
      },
      {
        name: 'Chờ xuất viện (Awaiting Discharge)',
        dataKey: 'choXuatVien',
        color: this.cssVars.chart8,
      },
      {
        name: 'Đã book (Booked)',
        dataKey: 'daBook',
        color: this.cssVars.chart6,
      },
      {
        name: 'Chưa sẵn sàng (Not Ready)',
        dataKey: 'chuaSanSang',
        color: this.cssVars.chart7,
      },
      {
        name: 'Cho mượn giường (On Loan)',
        dataKey: 'choMuonGiuong',
        color: this.cssVars.chart9,
      },
    ];
  }

  /**
   * Loads bed usage data from API
   */
  public loadData(): void {
    if (this.isRefreshing) {
      return;
    }

    // [FIXED] Only set isLoading (skeleton) on initial load. 
    // For updates, use isRefreshing (spinner).
    const isInitialLoad = this.widgetData.length === 0;
    
    if (isInitialLoad) {
      this.isLoading = true;
    } else {
      this.isRefreshing = true;
    }
    
    this.cd.markForCheck();

    this.http
      .get<ApiResponseData[]>(environment.bedUsageUrl)
      .pipe(
        finalize(() => this.handleRequestComplete()),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe({
        next: (data) => this.handleDataSuccess(data),
        error: (error) => this.handleDataError(error),
      });
  }

  /**
   * Handles successful data retrieval
   */
  private handleDataSuccess(rawData: ApiResponseData[]): void {
    // Initialize widgetData only after first successful data fetch if empty
    if (this.widgetData.length === 0) {
      this.widgetData = [...this.widgetDefinitions];
    }

    this.calculateWidgets(rawData);

    const chartData = this.transformApiData(rawData);
    chartData.sort((a, b) => a.viName.localeCompare(b.viName));

    this.chartOptions = this.buildChartOptions(chartData);
  }

  /**
   * Handles data retrieval errors
   */
  private handleDataError(error: HttpErrorResponse): void {
    console.error('Failed to load bed usage data:', error);
    this.chartOptions = null;
    this.resetWidgets();
  }

  /**
   * Handles request completion (success or error)
   */
  private handleRequestComplete(): void {
    this.isLoading = false;
    this.isRefreshing = false;
    this.updateCurrentDateTime();
    this.cd.markForCheck();
  }

  /**
   * Updates the current date/time display
   */
  private updateCurrentDateTime(): void {
    this.currentDateTime = new Date().toLocaleString('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
  }

  /**
   * Calculates and updates widget values from API data
   */
  private calculateWidgets(apiData: ApiResponseData[]): void {
    const totals = this.calculateTotals(apiData);
    const occupancyRate = this.calculateOccupancyRate(totals);

    const updates: Record<string, string> = {
      occupancyRate,
      totalBeds: this.formatNumber(totals.totalBeds),
      giuongTrong: this.formatNumber(totals.giuongTrong),
      dangDieuTri: this.formatNumber(totals.dangDieuTri),
      choXuatVien: this.formatNumber(totals.choXuatVien),
      daBook: this.formatNumber(totals.daBook),
      chuaSanSang: this.formatNumber(totals.chuaSanSang),
      choMuonGiuong: this.formatNumber(totals.choMuonGiuong),
    };

    this.updateWidgetValues(updates);
  }

  /**
   * Calculates totals from API data
   */
  private calculateTotals(apiData: ApiResponseData[]): BedTotals {
    return apiData.reduce(
      (acc, item) => ({
        giuongTrong: acc.giuongTrong + item.GiuongTrong,
        dangDieuTri: acc.dangDieuTri + item.DangSuDung,
        choXuatVien: acc.choXuatVien + item.ChoXuatVien,
        daBook: acc.daBook + item.DaBook,
        chuaSanSang: acc.chuaSanSang + item.ChuaSanSang,
        choMuonGiuong: acc.choMuonGiuong + item.ChoMuonGiuong,
        totalBeds: acc.totalBeds + item.Tong,
      }),
      {
        giuongTrong: 0,
        dangDieuTri: 0,
        choXuatVien: 0,
        daBook: 0,
        chuaSanSang: 0,
        choMuonGiuong: 0,
        totalBeds: 0,
      }
    );
  }

  /**
   * Calculates occupancy rate as formatted string
   */
  private calculateOccupancyRate(totals: BedTotals): string {
    if (totals.totalBeds === 0) {
      return '0,0%';
    }

    const occupied =
      totals.dangDieuTri +
      totals.choXuatVien +
      totals.daBook +
      totals.chuaSanSang +
      totals.choMuonGiuong;

    const rate = (occupied / totals.totalBeds) * 100;
    return `${rate.toFixed(1).replace('.', ',')}%`;
  }

  /**
   * Updates widget values from calculation results
   */
  private updateWidgetValues(updates: Record<string, string>): void {
    this.widgetData.forEach((widget) => {
      if (updates[widget.id]) {
        widget.value = updates[widget.id];
      }
    });
  }

  /**
   * Transforms API response data to chart data format
   */
  private transformApiData(apiData: ApiResponseData[]): DepartmentChartData[] {
    return apiData.map((item) => {
      const { viName, enName } = this.parseDepartmentName(item.TenPhongBan);
      return {
        viName,
        enName,
        totalBeds: item.Tong,
        giuongTrong: item.GiuongTrong,
        dangDieuTri: item.DangSuDung,
        choXuatVien: item.ChoXuatVien,
        daBook: item.DaBook,
        chuaSanSang: item.ChuaSanSang,
        choMuonGiuong: item.ChoMuonGiuong,
      };
    });
  }

  /**
   * Parses department name into Vietnamese and English parts
   */
  private parseDepartmentName(fullName: string): {
    viName: string;
    enName: string;
  } {
    // Remove total count suffix
    let cleanName = fullName.replace(/\s*-?\s*\(Σ:\s*\d+\)\s*$/, '').trim();

    // Handle multi-line format
    if (cleanName.match(/[\r\n]+/)) {
      const lines = cleanName
        .split(/[\r\n]+/)
        .map((line) => line.trim())
        .filter((line) => line.length > 0);

      if (lines.length >= 2) {
        return {
          viName: lines[0],
          enName: lines.slice(1).join(' '),
        };
      }
    }

    // Handle single line format
    cleanName = cleanName.replace(/[\r\n]+/g, ' ').trim();

    // Try splitting by dash
    const parts = cleanName.split(/\s+-\s+/);
    if (parts.length >= 2) {
      return {
        viName: parts[0].trim(),
        enName: parts.slice(1).join(' - ').trim(),
      };
    }

    // Try extracting English name at the end
    const match = cleanName.match(/^(.+?)\s+([A-Z][a-zA-Z\s&()]+)$/);
    if (match) {
      return {
        viName: match[1].trim(),
        enName: match[2].trim(),
      };
    }

    return { viName: cleanName, enName: '' };
  }

  /**
   * Builds ECharts configuration options
   */
  private buildChartOptions(data: DepartmentChartData[]): EChartsCoreOption {
    const xAxisData = data.map((item) =>
      item.enName ? `${item.viName}\n(${item.enName})` : item.viName
    );

    const series = [
      ...this.buildDataSeries(data),
      this.buildTotalSeries(data),
    ];

    return {
      backgroundColor: this.cssVars.white,
      textStyle: {
        fontFamily: GLOBAL_FONT_FAMILY,
        fontSize: 12,
        color: this.cssVars.gray700,
      },
      tooltip: {
        trigger: 'axis',
        axisPointer: {
          type: 'shadow',
          shadowStyle: { color: 'rgba(0, 89, 112, 0.1)' },
        },
        formatter: this.createTooltipFormatter(data),
      },
      legend: {
        data: this.bedStatusSeries.map((s) => s.name),
        top: '2%',
        left: 'center',
        show: true,
        type: 'scroll',
        itemGap: 8,
        textStyle: { fontSize: 10 },
      },
      grid: {
        left: '5%',
        right: '5%',
        top: '15%',
        containLabel: true,
      },
      xAxis: {
        type: 'category',
        data: xAxisData,
        axisLabel: {
          interval: 0,
          rotate: 45,
          fontSize: 10,
          fontWeight: 'bold',
          overflow: 'truncate',
        },
        axisTick: { alignWithLabel: true },
        axisLine: {
          show: true,
          lineStyle: { color: this.cssVars.peacockBlue },
        },
      },
      yAxis: {
        type: 'value',
        name: 'Tổng Số Giường (Total)',
        nameLocation: 'middle',
        nameGap: 40,
        min: 0,
        max: (val: { max: number }) =>
          val.max > 60 ? Math.ceil(val.max / 10) * 10 : 60,
        splitLine: {
          show: true,
          lineStyle: {
            color: this.cssVars.gray200,
            type: 'dotted',
          },
        },
      },
      series,
    };
  }

  /**
   * Builds data series for the chart
   */
  private buildDataSeries(data: DepartmentChartData[]): any[] {
    return this.bedStatusSeries.map((config) => ({
      name: config.name,
      type: 'bar',
      stack: 'beds',
      barWidth: CHART_BAR_WIDTH,
      itemStyle: {
        color: config.color,
        borderRadius: [4, 4, 0, 0],
        borderColor: 'rgba(255, 255, 255, 0.3)',
        borderWidth: 1,
      },
      label: {
        show: true,
        position: 'inside',
        color: this.cssVars.white,
        fontSize: 9,
        fontWeight: 'bold',
        formatter: (params: any) => (params.value > 0 ? params.value : ''),
      },
      data: data.map((item) => item[config.dataKey]),
    }));
  }

  /**
   * Builds phantom total series for chart
   */
  private buildTotalSeries(data: DepartmentChartData[]): any {
    return {
      name: 'Tổng (Total)',
      type: 'bar',
      barGap: '-100%',
      barWidth: CHART_BAR_WIDTH,
      data: data.map((item) => item.totalBeds),
      itemStyle: { color: 'transparent' },
      label: {
        show: true,
        position: 'top',
        color: this.cssVars.gray800,
        fontWeight: 'bold',
        fontSize: 10,
        formatter: '{c}',
        distance: 5,
      },
      tooltip: { show: false },
      z: 10,
      silent: true,
    };
  }

  /**
   * Creates tooltip formatter function
   */
  private createTooltipFormatter(data: DepartmentChartData[]) {
    return (params: any): string => {
      if (!params?.length) {
        return '';
      }

      const dataIndex = params[0].dataIndex;
      const item = data[dataIndex];

      let result = `<div style="font-weight: bold; margin-bottom: 5px; font-size: 12px;">${item.viName}</div>`;

      if (item.enName) {
        result += `<div style="margin-bottom: 5px; color: #666;">${item.enName}</div>`;
      }

      params.forEach((param: any) => {
        if (param.seriesName === 'Tổng (Total)' || param.value === 0) {
          return;
        }
        result += `<div style="margin: 3px 0;">${param.marker} ${param.seriesName}: <strong>${param.value}</strong></div>`;
      });

      result += `<div style="margin-top: 5px; padding-top: 5px; border-top: 1px solid #ccc; font-weight: bold;">Tổng số giường: <strong>${item.totalBeds}</strong></div>`;

      return result;
    };
  }

  /**
   * Resets all widgets to default values
   */
  private resetWidgets(): void {
    this.widgetData.forEach((widget) => {
      widget.value = widget.id === 'occupancyRate' ? '0,0%' : '0';
    });
    this.cd.markForCheck();
  }

  /**
   * Formats number with Vietnamese locale
   */
  private formatNumber(value: number): string {
    return new Intl.NumberFormat('vi-VN').format(value);
  }

  /**
   * TrackBy function for widget list
   */
  public trackByWidgetId(_index: number, item: WidgetData): string {
    return item.id;
  }
}