import {
  Component,
  OnInit,
  OnDestroy,
  inject,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  NgZone,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { finalize, takeUntil } from 'rxjs/operators';
import { Subject } from 'rxjs';

// Only import the Types interface to define chart options
import type { EChartsCoreOption } from 'echarts/core';

import { WidgetCardComponent } from '../components/widget-card/widget-card.component';
// Import the smart chart card
import { ChartCardComponent } from '../components/chart-card/chart-card.component';
import { environment } from '../../environments/environment.development';

const GLOBAL_FONT_FAMILY =
  'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

function getCssVar(name: string): string {
  if (typeof document === 'undefined') return '';
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

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

@Component({
  selector: 'app-bed-usage',
  standalone: true,
  // Import the new component
  imports: [CommonModule, WidgetCardComponent, ChartCardComponent],
  templateUrl: './bed-usage.component.html',
  styleUrl: './bed-usage.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BedUsageComponent implements OnInit, OnDestroy {
  private http = inject(HttpClient);
  private cd = inject(ChangeDetectorRef);
  private ngZone = inject(NgZone);

  public isLoading: boolean = false;
  public isRefreshing: boolean = false; // New state for background/manual refresh
  public currentDateTime: string = '';
  
  // Holds the calculated options to pass to the child component
  public chartOptions: EChartsCoreOption | null = null;

  public widgetData: WidgetData[] = [];
  
  private destroy$ = new Subject<void>();
  private dataRefreshInterval?: ReturnType<typeof setInterval>;
  
  // Series config for chart colors/mapping
  private bedStatusSeries: { name: string; dataKey: keyof DepartmentChartData; color: string }[] = [];

  // CSS Vars Cache
  private cssVars: any = {};

  ngOnInit(): void {
    this.initColors();
    this.loadData(true); // Initial load: Show Skeleton
    this.startAutoRefresh();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    if (this.dataRefreshInterval) {
      clearInterval(this.dataRefreshInterval);
    }
  }

  private startAutoRefresh(): void {
    this.ngZone.runOutsideAngular(() => {
      this.dataRefreshInterval = setInterval(() => {
        // Interval load: No Skeleton
        this.ngZone.run(() => this.loadData(false));
      }, 60000); // 1 min
    });
  }

  private initColors(): void {
    const c = getCssVar;
    
    this.cssVars = {
      chart1: c('--chart-color-1'),
      chart2: c('--chart-color-2'),
      chart3: c('--chart-color-3'),
      chart6: c('--chart-color-6'),
      chart7: c('--chart-color-7'),
      chart8: c('--chart-color-8'),
      chart9: c('--chart-color-9'),
      white: c('--white'),
      gray200: c('--gray-200'),
      gray700: c('--gray-700'),
      gray800: c('--gray-800'),
      peacockBlue: c('--peacock-blue'),
      tealBlue: c('--teal-blue')
    };

    // Initial Widgets
    this.widgetData = [
      { id: 'occupancyRate', title: 'Công Suất', value: '0,0%', caption: 'Occupancy Rate', icon: 'fas fa-chart-pie', accentColor: this.cssVars.chart1 },
      { id: 'totalBeds', title: 'Tổng Số', value: '0', caption: 'Total Beds', icon: 'fas fa-hospital', accentColor: this.cssVars.chart2 },
      { id: 'giuongTrong', title: 'Giường Trống', value: '0', caption: 'Vacant Beds', icon: 'fas fa-check-circle', accentColor: this.cssVars.chart3 },
      { id: 'dangDieuTri', title: 'Đang Điều Trị', value: '0', caption: 'In Treatment', icon: 'fas fa-user-injured', accentColor: this.cssVars.chart1 },
      { id: 'choXuatVien', title: 'Chờ Xuất Viện', value: '0', caption: 'Awaiting Discharge', icon: 'fas fa-door-open', accentColor: this.cssVars.chart8 },
      { id: 'daBook', title: 'Đã Book', value: '0', caption: 'Booked Beds', icon: 'fas fa-bookmark', accentColor: this.cssVars.chart6 },
      { id: 'chuaSanSang', title: 'Chưa Sẵn Sàng', value: '0', caption: 'Not Ready', icon: 'fas fa-tools', accentColor: this.cssVars.chart7 },
      { id: 'choMuonGiuong', title: 'Cho Mượn Giường', value: '0', caption: 'On Loan', icon: 'fas fa-hand-holding-medical', accentColor: this.cssVars.chart9 }
    ];

    this.bedStatusSeries = [
      { name: 'Giường trống (Vacant)', dataKey: 'giuongTrong', color: this.cssVars.chart3 },
      { name: 'Đang điều trị (In Treatment)', dataKey: 'dangDieuTri', color: this.cssVars.chart1 },
      { name: 'Chờ xuất viện (Awaiting Discharge)', dataKey: 'choXuatVien', color: this.cssVars.chart8 },
      { name: 'Đã book (Booked)', dataKey: 'daBook', color: this.cssVars.chart6 },
      { name: 'Chưa sẵn sàng (Not Ready)', dataKey: 'chuaSanSang', color: this.cssVars.chart7 },
      { name: 'Cho mượn giường (On Loan)', dataKey: 'choMuonGiuong', color: this.cssVars.chart9 }
    ];
  }

  public loadData(showSkeleton: boolean = false): void {
    // Prevent duplicate requests
    if (this.isLoading || this.isRefreshing) return;

    if (showSkeleton) {
      this.isLoading = true;
    }
    this.isRefreshing = true; // Mark as refreshing regardless of skeleton state
    
    this.cd.markForCheck();

    const apiUrl = environment.bedUsageUrl;
    
    this.http.get<ApiResponseData[]>(apiUrl).pipe(
      finalize(() => {
        this.isLoading = false;
        this.isRefreshing = false;
        
        this.currentDateTime = new Date().toLocaleString('vi-VN', {
          day: '2-digit', month: '2-digit', year: 'numeric',
          hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
        });
        this.cd.markForCheck();
      }),
      takeUntil(this.destroy$)
    ).subscribe({
      next: (rawData) => {
        this.calculateWidgets(rawData);
        
        // Process Data for Chart
        const chartData = this.transformApiData(rawData);
        chartData.sort((a, b) => a.viName.localeCompare(b.viName));
        
        // Just build options. No manual rendering!
        this.chartOptions = this.buildChartOptions(chartData);
      },
      error: (err) => {
        console.error(err);
        this.chartOptions = null;
        this.resetWidgets();
      }
    });
  }

  private calculateWidgets(apiData: ApiResponseData[]): void {
    const totals = {
      giuongTrong: 0, dangDieuTri: 0, choXuatVien: 0, daBook: 0,
      chuaSanSang: 0, choMuonGiuong: 0, totalBeds: 0,
    };

    for (const item of apiData) {
      totals.giuongTrong += item.GiuongTrong;
      totals.dangDieuTri += item.DangSuDung;
      totals.choXuatVien += item.ChoXuatVien;
      totals.daBook += item.DaBook;
      totals.chuaSanSang += item.ChuaSanSang;
      totals.choMuonGiuong += item.ChoMuonGiuong;
      totals.totalBeds += item.Tong;
    }

    const occupied = totals.dangDieuTri + totals.choXuatVien + totals.daBook + totals.chuaSanSang + totals.choMuonGiuong;
    let occupancyRateStr = '0,0%';
    if (totals.totalBeds > 0) {
      const rate = (occupied / totals.totalBeds) * 100;
      occupancyRateStr = rate.toFixed(1).replace('.', ',') + '%';
    }

    // Update widgets by ID
    const updates: Record<string, string> = {
      occupancyRate: occupancyRateStr,
      totalBeds: this.formatNumber(totals.totalBeds),
      giuongTrong: this.formatNumber(totals.giuongTrong),
      dangDieuTri: this.formatNumber(totals.dangDieuTri),
      choXuatVien: this.formatNumber(totals.choXuatVien),
      daBook: this.formatNumber(totals.daBook),
      chuaSanSang: this.formatNumber(totals.chuaSanSang),
      choMuonGiuong: this.formatNumber(totals.choMuonGiuong),
    };

    this.widgetData.forEach(w => {
      if (updates[w.id]) w.value = updates[w.id];
    });
  }

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

  private parseDepartmentName(fullName: string): { viName: string; enName: string } {
    let cleanName = fullName.replace(/\s*-?\s*\(Σ:\s*\d+\)\s*$/, '').trim();
    if (cleanName.match(/[\r\n]+/)) {
      const lines = cleanName.split(/[\r\n]+/);
      const validLines = lines.map(l => l.trim()).filter(l => l.length > 0);
      if (validLines.length >= 2) {
         return { viName: validLines[0], enName: validLines.slice(1).join(' ') };
      }
    }
    cleanName = cleanName.replace(/[\r\n]+/g, ' ').trim();
    const parts = cleanName.split(/\s+-\s+/);
    if (parts.length >= 2) {
      return { viName: parts[0].trim(), enName: parts.slice(1).join(' - ').trim() };
    }
    const match = cleanName.match(/^(.+?)\s+([A-Z][a-zA-Z\s&()]+)$/);
    if (match) {
      return { viName: match[1].trim(), enName: match[2].trim() };
    }
    return { viName: cleanName, enName: '' };
  }

  private buildChartOptions(data: DepartmentChartData[]): EChartsCoreOption {
    const xAxisData = data.map((item) =>
      item.enName ? `${item.viName}\n(${item.enName})` : item.viName
    );

    const series: any[] = this.bedStatusSeries.map((config) => ({
      name: config.name,
      type: 'bar',
      stack: 'beds',
      barWidth: '60%', 
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
        formatter: (params: any) => (params.value > 0 ? params.value : '')
      },
      data: data.map((item: any) => item[config.dataKey]),
    }));

    // Total Series (Phantom)
    series.push({
      name: 'Tổng (Total)',
      type: 'bar',
      barGap: '-100%', 
      barWidth: '60%', 
      data: data.map((item) => item.totalBeds),
      itemStyle: { color: 'transparent' },
      label: {
        show: true,
        position: 'top',
        color: this.cssVars.gray800,
        fontWeight: 'bold',
        fontSize: 10,
        formatter: '{c}',
        distance: 5
      },
      tooltip: { show: false },
      z: 10, 
      silent: true 
    });

    return {
      backgroundColor: this.cssVars.white,
      textStyle: {
        fontFamily: GLOBAL_FONT_FAMILY,
        fontSize: 12,
        color: this.cssVars.gray700,
      },
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow', shadowStyle: { color: 'rgba(0, 89, 112, 0.1)' } },
        formatter: this.getTooltipFormatter(data)
      },
      legend: {
        data: this.bedStatusSeries.map(s => s.name),
        top: '2%',
        left: 'center',
        show: true,
        type: 'scroll',
        itemGap: 8,
        textStyle: { fontSize: 10 }
      },
      grid: { left: '5%', right: '5%', bottom: '15%', top: '15%', containLabel: true },
      dataZoom: [
        { type: 'slider', show: true, xAxisIndex: [0], startValue: 0, endValue: 8, bottom: '10px', height: 20, brushSelect: false },
        { type: 'inside', xAxisIndex: [0], startValue: 0, endValue: 8, zoomOnMouseWheel: false, moveOnMouseWheel: true, moveOnMouseMove: true }
      ],
      xAxis: {
        type: 'category',
        data: xAxisData,
        axisLabel: { interval: 0, rotate: 45, fontSize: 10, fontWeight: 'bold', overflow: 'truncate' },
        axisTick: { alignWithLabel: true },
        axisLine: { show: true, lineStyle: { color: this.cssVars.peacockBlue } },
      },
      yAxis: {
        type: 'value',
        name: 'Tổng Số Giường (Total)',
        nameLocation: 'middle',
        nameGap: 40,
        min: 0,
        max: (val: { max: number }) => (val.max > 60 ? Math.ceil(val.max / 10) * 10 : 60),
        splitLine: { show: true, lineStyle: { color: this.cssVars.gray200, type: 'dotted' } },
      },
      series: series,
    };
  }

  private getTooltipFormatter(data: DepartmentChartData[]) {
    return (params: any) => {
      if (!params || params.length === 0) return '';
      const dataIndex = params[0].dataIndex;
      const item = data[dataIndex]; 
      let result = `<div style="font-weight: bold; margin-bottom: 5px; font-size: 12px;">${item.viName}</div>`;
      if (item.enName) {
        result += `<div style="margin-bottom: 5px; color: #666;">${item.enName}</div>`;
      }
      params.forEach((param: any) => {
        if (param.seriesName === 'Tổng (Total)') return; 
        if (param.value > 0) {
          result += `<div style="margin: 3px 0;">${param.marker} ${param.seriesName}: <strong>${param.value}</strong></div>`;
        }
      });
      result += `<div style="margin-top: 5px; padding-top: 5px; border-top: 1px solid #ccc; font-weight: bold;">Tổng số giường: <strong>${item.totalBeds}</strong></div>`;
      return result;
    };
  }

  private resetWidgets(): void {
    this.widgetData.forEach(w => w.value = w.id === 'occupancyRate' ? '0,0%' : '0');
    this.cd.markForCheck();
  }

  private formatNumber(value: number): string {
    return new Intl.NumberFormat('vi-VN').format(value);
  }
  
  trackByWidgetId(index: number, item: WidgetData): string {
    return item.id;
  }
}