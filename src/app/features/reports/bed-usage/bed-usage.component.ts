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
import { ThemeService, ThemePalette } from '../../../core/services/theme.service';

const GLOBAL_FONT_FAMILY = 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
const AUTO_REFRESH_INTERVAL = 60_000; 
const CHART_BAR_WIDTH = '60%';

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

@Component({
  selector: 'app-bed-usage',
  standalone: true,
  imports: [CommonModule, WidgetCardComponent, ChartCardComponent],
  templateUrl: './bed-usage.component.html',
  styleUrl: './bed-usage.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BedUsageComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly cd = inject(ChangeDetectorRef);
  private readonly destroyRef = inject(DestroyRef);
  public readonly themeService = inject(ThemeService);

  public isLoading = true; 
  public isRefreshing = false;
  public currentDateTime = '';
  public chartOptions: EChartsCoreOption | null = null;
  public widgetData: WidgetData[] = []; 

  private bedStatusSeries: BedStatusSeries[] = [];
  private palette!: ThemePalette;

  constructor() {
    // Polished logic: React to theme changes using the service
    effect(() => {
        const isDark = this.themeService.isDarkTheme(); // Dependency
        
        // Add a small timeout to ensure CSS variables have updated in DOM
        setTimeout(() => {
          this.palette = this.themeService.getColors();
          this.initializeBedStatusSeries();
          
          // Re-render if data exists
          if (!this.isLoading && this.widgetData.length > 0) {
             this.loadData(); 
          }
          this.cd.markForCheck();
        }, 0);
    });
  }

  ngOnInit(): void {
    // Initial palette fetch
    this.palette = this.themeService.getColors();
    this.initializeBedStatusSeries();

    timer(0, AUTO_REFRESH_INTERVAL)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.loadData();
      });
  }

  private initializeBedStatusSeries(): void {
    // Using centralized palette
    this.bedStatusSeries = [
      {
        name: 'Giường trống (Vacant)',
        dataKey: 'giuongTrong',
        color: this.palette.chart3,
      },
      {
        name: 'Đang điều trị (In Treatment)',
        dataKey: 'dangDieuTri',
        color: this.palette.chart1,
      },
      {
        name: 'Chờ xuất viện (Awaiting Discharge)',
        dataKey: 'choXuatVien',
        color: this.palette.chart8,
      },
      {
        name: 'Đã book (Booked)',
        dataKey: 'daBook',
        color: this.palette.chart6,
      },
      {
        name: 'Chưa sẵn sàng (Not Ready)',
        dataKey: 'chuaSanSang',
        color: this.palette.chart7,
      },
      {
        name: 'Cho mượn giường (On Loan)',
        dataKey: 'choMuonGiuong',
        color: this.palette.chart9,
      },
    ];
  }

  public loadData(): void {
    if (this.isRefreshing) return;

    const isInitialLoad = this.widgetData.length === 0;
    if (isInitialLoad) {
      this.isLoading = true;
    } else {
      this.isRefreshing = true;
    }
    this.cd.markForCheck();

    this.http.get<ApiResponseData[]>(environment.bedUsageUrl)
      .pipe(
        finalize(() => this.handleRequestComplete()),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe({
        next: (data) => this.handleDataSuccess(data),
        error: (error) => this.handleDataError(error),
      });
  }

  private handleDataSuccess(rawData: ApiResponseData[]): void {
    if (this.widgetData.length === 0) {
      this.initializeWidgets();
    }

    this.calculateWidgets(rawData);

    const chartData = this.transformApiData(rawData);
    chartData.sort((a, b) => a.viName.localeCompare(b.viName));

    this.chartOptions = this.buildChartOptions(chartData);
  }

  private initializeWidgets(): void {
    this.widgetData = [
      {
        id: 'occupancyRate',
        title: 'Công Suất',
        value: '0,0%',
        caption: 'Occupancy Rate',
        icon: 'fas fa-chart-pie',
        accentColor: this.palette.chart1,
      },
      {
        id: 'totalBeds',
        title: 'Tổng Số',
        value: '0',
        caption: 'Total Beds',
        icon: 'fas fa-hospital',
        accentColor: this.palette.chart2,
      },
      {
        id: 'giuongTrong',
        title: 'Giường Trống',
        value: '0',
        caption: 'Vacant Beds',
        icon: 'fas fa-check-circle',
        accentColor: this.palette.chart3,
      },
      {
        id: 'dangDieuTri',
        title: 'Đang Điều Trị',
        value: '0',
        caption: 'In Treatment',
        icon: 'fas fa-user-injured',
        accentColor: this.palette.chart1,
      },
      {
        id: 'choXuatVien',
        title: 'Chờ Xuất Viện',
        value: '0',
        caption: 'Awaiting Discharge',
        icon: 'fas fa-door-open',
        accentColor: this.palette.chart8,
      },
      {
        id: 'daBook',
        title: 'Đã Book',
        value: '0',
        caption: 'Booked Beds',
        icon: 'fas fa-bookmark',
        accentColor: this.palette.chart6,
      },
      {
        id: 'chuaSanSang',
        title: 'Chưa Sẵn Sàng',
        value: '0',
        caption: 'Not Ready',
        icon: 'fas fa-tools',
        accentColor: this.palette.chart7,
      },
      {
        id: 'choMuonGiuong',
        title: 'Cho Mượn Giường',
        value: '0',
        caption: 'On Loan',
        icon: 'fas fa-hand-holding-medical',
        accentColor: this.palette.chart9,
      },
    ];
  }

  private handleDataError(error: HttpErrorResponse): void {
    console.error('Failed to load bed usage data:', error);
    this.chartOptions = null;
    this.widgetData.forEach((widget) => {
      widget.value = widget.id === 'occupancyRate' ? '0,0%' : '0';
    });
  }

  private handleRequestComplete(): void {
    this.isLoading = false;
    this.isRefreshing = false;
    this.updateCurrentDateTime();
    this.cd.markForCheck();
  }

  private updateCurrentDateTime(): void {
    this.currentDateTime = new Date().toLocaleString('vi-VN', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
    });
  }

  private calculateWidgets(apiData: ApiResponseData[]): void {
    const totals = apiData.reduce(
      (acc, item) => ({
        giuongTrong: acc.giuongTrong + item.GiuongTrong,
        dangDieuTri: acc.dangDieuTri + item.DangSuDung,
        choXuatVien: acc.choXuatVien + item.ChoXuatVien,
        daBook: acc.daBook + item.DaBook,
        chuaSanSang: acc.chuaSanSang + item.ChuaSanSang,
        choMuonGiuong: acc.choMuonGiuong + item.ChoMuonGiuong,
        totalBeds: acc.totalBeds + item.Tong,
      }),
      { giuongTrong: 0, dangDieuTri: 0, choXuatVien: 0, daBook: 0, chuaSanSang: 0, choMuonGiuong: 0, totalBeds: 0 }
    );

    const occupied = totals.dangDieuTri + totals.choXuatVien + totals.daBook + totals.chuaSanSang + totals.choMuonGiuong;
    const rate = totals.totalBeds > 0 ? (occupied / totals.totalBeds) * 100 : 0;
    const occupancyRate = `${rate.toFixed(1).replace('.', ',')}%`;

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

    this.widgetData.forEach((widget) => {
      if (updates[widget.id]) widget.value = updates[widget.id];
      // Ensure widget colors update dynamically
      const key = widget.id as keyof BedTotals;
      // Re-map accent colors just in case
      switch(widget.id) {
          case 'occupancyRate': widget.accentColor = this.palette.chart1; break;
          case 'totalBeds': widget.accentColor = this.palette.chart2; break;
          case 'giuongTrong': widget.accentColor = this.palette.chart3; break;
          case 'dangDieuTri': widget.accentColor = this.palette.chart1; break;
          case 'choXuatVien': widget.accentColor = this.palette.chart8; break;
          case 'daBook': widget.accentColor = this.palette.chart6; break;
          case 'chuaSanSang': widget.accentColor = this.palette.chart7; break;
          case 'choMuonGiuong': widget.accentColor = this.palette.chart9; break;
      }
    });
  }

  private transformApiData(apiData: ApiResponseData[]): DepartmentChartData[] {
    return apiData.map((item) => {
      // Simple parsing logic
      let cleanName = item.TenPhongBan.replace(/\s*-?\s*\(Σ:\s*\d+\)\s*$/, '').trim();
      let viName = cleanName;
      let enName = '';

      // Try to extract english part
      if (cleanName.includes('\n')) {
          const parts = cleanName.split('\n');
          viName = parts[0].trim();
          enName = parts.slice(1).join(' ').trim();
      } else {
          const match = cleanName.match(/^(.+?)\s+([A-Z][a-zA-Z\s&()]+)$/);
          if (match) {
              viName = match[1].trim();
              enName = match[2].trim();
          }
      }

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

  private buildChartOptions(data: DepartmentChartData[]): EChartsCoreOption {
    const xAxisData = data.map((item) =>
      item.enName ? `${item.viName}\n(${item.enName})` : item.viName
    );

    return {
      backgroundColor: 'transparent',
      textStyle: {
        fontFamily: GLOBAL_FONT_FAMILY,
        fontSize: 12,
        color: this.palette.textPrimary,
      },
      tooltip: {
        trigger: 'axis',
        backgroundColor: this.palette.bgCard,
        borderColor: this.palette.gray200,
        textStyle: { color: this.palette.textPrimary },
        axisPointer: {
          type: 'shadow',
          shadowStyle: { color: 'rgba(0, 0, 0, 0.05)' },
        },
        formatter: this.createTooltipFormatter(data),
      },
      legend: {
        data: this.bedStatusSeries.map((s) => s.name),
        top: '2%',
        left: 'center',
        type: 'scroll',
        textStyle: { fontSize: 10, color: this.palette.textSecondary },
      },
      grid: {
        left: '5%', right: '5%', top: '15%', containLabel: true,
      },
      xAxis: {
        type: 'category',
        data: xAxisData,
        axisLabel: {
          interval: 0, rotate: 45, fontSize: 10, fontWeight: 'bold', overflow: 'truncate',
          color: this.palette.textPrimary
        },
        axisLine: {
          lineStyle: { color: this.palette.secondary },
        },
      },
      yAxis: {
        type: 'value',
        name: 'Tổng Số Giường (Total)',
        nameLocation: 'middle',
        nameGap: 40,
        splitLine: {
          lineStyle: {
            color: this.palette.gray200,
            type: 'dotted',
          },
        },
      },
      series: [
        ...this.bedStatusSeries.map((config) => ({
          name: config.name,
          type: 'bar',
          stack: 'beds',
          barWidth: CHART_BAR_WIDTH,
          itemStyle: {
            color: config.color,
            borderRadius: [4, 4, 0, 0],
            borderColor: this.palette.bgCard, 
            borderWidth: 1,
          },
          data: data.map((item) => item[config.dataKey]),
          label: {
             show: true, position: 'inside', color: '#fff', fontSize: 9,
             formatter: (p: any) => p.value > 0 ? p.value : ''
          }
        })),
        {
          name: 'Tổng (Total)',
          type: 'bar',
          barGap: '-100%',
          barWidth: CHART_BAR_WIDTH,
          data: data.map((item) => item.totalBeds),
          itemStyle: { color: 'transparent' },
          label: {
            show: true, position: 'top', color: this.palette.textPrimary, fontWeight: 'bold', fontSize: 10,
            formatter: '{c}'
          },
          tooltip: { show: false },
          z: 10,
          silent: true,
        }
      ],
    };
  }

  private createTooltipFormatter(data: DepartmentChartData[]) {
    return (params: any): string => {
      if (!params?.length) return '';
      const idx = params[0].dataIndex;
      const item = data[idx];
      
      let result = `<div style="font-weight:bold;margin-bottom:5px;">${item.viName}</div>`;
      if (item.enName) result += `<div style="color:${this.palette.textSecondary};font-size:11px;margin-bottom:8px;">${item.enName}</div>`;

      params.forEach((p: any) => {
        if (p.seriesName === 'Tổng (Total)' || p.value === 0) return;
        result += `<div>${p.marker} ${p.seriesName}: <b>${p.value}</b></div>`;
      });
      result += `<div style="margin-top:5px;padding-top:5px;border-top:1px solid ${this.palette.gray200};">Total: <b>${item.totalBeds}</b></div>`;
      return result;
    };
  }

  private formatNumber(value: number): string {
    return new Intl.NumberFormat('vi-VN').format(value);
  }

  public trackByWidgetId(_index: number, item: WidgetData): string {
    return item.id;
  }
}