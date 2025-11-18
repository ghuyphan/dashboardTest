import {
  Component,
  OnInit,
  OnDestroy,
  ElementRef,
  ViewChild,
  inject,
  AfterViewInit,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  NgZone,
  HostListener,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { finalize, takeUntil } from 'rxjs/operators';
import { Subject } from 'rxjs';

import type { EChartsType, EChartsCoreOption } from 'echarts/core';
import type * as echarts from 'echarts/core';
import { WidgetCardComponent } from '../components/widget-card/widget-card.component';
import { environment } from '../../environments/environment.development';

type EChartsOption = EChartsCoreOption;

const GLOBAL_FONT_FAMILY =
  'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

function getCssVar(name: string): string {
  if (typeof document === 'undefined') return '';
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

interface ApiResponseData {
  TenPhongBan: string;
  PhongBan_Id: number;
  Tang: number;
  GiuongTrong: number;
  DangSuDung: number;
  ChoXuatVien: number;
  DaBook: number;
  ChuaSanSang: number;
  ChoMuonGiuong: number;
  Tong: number;
}

interface DepartmentChartData {
  tenPhongBan: string;
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

interface BedStatusSeries {
  name: string;
  dataKey: keyof Omit<DepartmentChartData, 'viName' | 'enName' | 'totalBeds'>;
  color: string;
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
  imports: [CommonModule, WidgetCardComponent],
  templateUrl: './bed-usage.component.html',
  styleUrl: './bed-usage.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BedUsageComponent implements OnInit, OnDestroy, AfterViewInit {
  @ViewChild('chartContainer', { static: true })
  chartContainer!: ElementRef<HTMLDivElement>;

  private http = inject(HttpClient);
  private cd = inject(ChangeDetectorRef);
  private ngZone = inject(NgZone);

  private echartsInstance?: typeof echarts;
  private chartInstance?: EChartsType;
  private dataRefreshInterval?: ReturnType<typeof setInterval>;
  
  private intersectionObserver?: IntersectionObserver;
  public isChartVisible: boolean = false;
  public isChartInitialized: boolean = false;

  currentDateTime: string = '';
  public isLoading: boolean = false;

  widgetData: WidgetData[] = [];
  private bedStatusSeries: BedStatusSeries[] = [];
  
  private cssVars = {
    chartColor1: '',
    chartColor2: '',
    chartColor3: '',
    chartColor6: '',
    chartColor7: '',
    chartColor8: '',
    chartColor9: '',
    gray200: '',
    gray300: '',
    gray700: '',
    gray800: '',
    peacockBlue: '',
    white: '',
    tealBlue: '', 
  };

  private destroy$ = new Subject<void>();
  private resizeTimeout: any;

  @HostListener('window:resize')
  onWindowResize(): void {
    clearTimeout(this.resizeTimeout);
    this.resizeTimeout = setTimeout(() => {
      this.chartInstance?.resize();
    }, 150);
  }

  ngOnInit(): void {
    this.initColors();
  }

  ngAfterViewInit(): void {
    this.setupIntersectionObserver();
    this.startRefreshInterval();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    
    clearTimeout(this.resizeTimeout);
    if (this.chartInstance) {
      this.chartInstance.dispose();
    }
    if (this.dataRefreshInterval) {
      clearInterval(this.dataRefreshInterval);
    }
    this.intersectionObserver?.disconnect();
  }
  
  private setupIntersectionObserver(): void {
    if (typeof IntersectionObserver === 'undefined') {
      console.warn('IntersectionObserver not supported, loading chart immediately.');
      this.initializeChart();
      return;
    }

    this.intersectionObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && !this.isChartVisible) {
            this.isChartVisible = true;
            this.intersectionObserver?.disconnect(); 
            
            this.ngZone.run(() => {
              this.initializeChart();
              this.cd.markForCheck();
            });
          }
        });
      },
      { 
        rootMargin: '100px',
        threshold: 0.01 
      }
    );
    
    this.intersectionObserver.observe(this.chartContainer.nativeElement);
  }

  private startRefreshInterval(): void {
    this.ngZone.runOutsideAngular(() => {
      this.dataRefreshInterval = setInterval(() => {
        this.ngZone.run(() => this.loadData());
      }, 60000);
    });
  }

  private async initializeChart(): Promise<void> {
    if (this.isChartInitialized) return;
    this.isChartInitialized = true;
    
    await this.lazyLoadECharts();
    this.initChart();
    this.loadData();
  }

  private async lazyLoadECharts(): Promise<void> {
    try {
      const [
        echartsCore,
        CanvasRenderer,
        BarChart,
        TitleComponent,
        TooltipComponent,
        GridComponent,
        LegendComponent,
        DataZoomComponent, 
      ] = await Promise.all([
        import('echarts/core'),
        import('echarts/renderers'),
        import('echarts/charts'),
        import('echarts/components'),
        import('echarts/components'),
        import('echarts/components'),
        import('echarts/components'),
        import('echarts/components'), 
      ]);

      this.echartsInstance = echartsCore;

      this.echartsInstance.use([
        CanvasRenderer.CanvasRenderer,
        BarChart.BarChart,
        TitleComponent.TitleComponent,
        TooltipComponent.TooltipComponent,
        GridComponent.GridComponent,
        LegendComponent.LegendComponent,
        DataZoomComponent.DataZoomComponent, 
      ]);
    } catch (error) {
      console.error('Error lazy-loading ECharts', error);
    }
  }

  private initColors(): void {
    const c = getCssVar;

    // Ensure default here is also '0,0%'
    this.widgetData = [
      { id: 'occupancyRate', title: 'Công Suất', value: '0,0%', caption: 'Occupancy Rate', icon: 'fas fa-chart-pie', accentColor: c('--chart-color-1') },
      { id: 'totalBeds', title: 'Tổng Số', value: '0', caption: 'Total Beds', icon: 'fas fa-hospital', accentColor: c('--chart-color-2') },
      { id: 'giuongTrong', title: 'Giường Trống', value: '0', caption: 'Vacant Beds', icon: 'fas fa-check-circle', accentColor: c('--chart-color-3') },
      { id: 'dangDieuTri', title: 'Đang Điều Trị', value: '0', caption: 'In Treatment', icon: 'fas fa-user-injured', accentColor: c('--chart-color-1') },
      { id: 'choXuatVien', title: 'Chờ Xuất Viện', value: '0', caption: 'Awaiting Discharge', icon: 'fas fa-door-open', accentColor: c('--chart-color-8') },
      { id: 'daBook', title: 'Đã Book', value: '0', caption: 'Booked Beds', icon: 'fas fa-bookmark', accentColor: c('--chart-color-6') },
      { id: 'chuaSanSang', title: 'Chưa Sẵn Sàng', value: '0', caption: 'Not Ready', icon: 'fas fa-tools', accentColor: c('--chart-color-7') },
      { id: 'choMuonGiuong', title: 'Cho Mượn Giường', value: '0', caption: 'On Loan', icon: 'fas fa-hand-holding-medical', accentColor: c('--chart-color-9') }
    ];

    this.bedStatusSeries = [
      { name: 'Giường trống (Vacant)', dataKey: 'giuongTrong', color: c('--chart-color-3') },
      { name: 'Đang điều trị (In Treatment)', dataKey: 'dangDieuTri', color: c('--chart-color-1') },
      { name: 'Chờ xuất viện (Awaiting Discharge)', dataKey: 'choXuatVien', color: c('--chart-color-8') },
      { name: 'Đã book (Booked)', dataKey: 'daBook', color: c('--chart-color-6') },
      { name: 'Chưa sẵn sàng (Not Ready)', dataKey: 'chuaSanSang', color: c('--chart-color-7') },
      { name: 'Cho mượn giường (On Loan)', dataKey: 'choMuonGiuong', color: c('--chart-color-9') }
    ];
    
    this.cssVars = {
      chartColor1: c('--chart-color-1'),
      chartColor2: c('--chart-color-2'),
      chartColor3: c('--chart-color-3'),
      chartColor6: c('--chart-color-6'),
      chartColor7: c('--chart-color-7'),
      chartColor8: c('--chart-color-8'),
      chartColor9: c('--chart-color-9'),
      gray200: c('--gray-200'),
      gray300: c('--gray-300'),
      gray700: c('--gray-700'),
      gray800: c('--gray-800'),
      peacockBlue: c('--peacock-blue'),
      white: c('--white'),
      tealBlue: c('--teal-blue'),
    };
  }

  private initChart(): void {
    if (!this.echartsInstance) return;
    
    const container = this.chartContainer.nativeElement;
    this.ngZone.runOutsideAngular(() => {
      this.chartInstance = this.echartsInstance!.init(container, undefined, {
        renderer: 'canvas',
        useDirtyRect: true,
      });
    });
  }

  public loadData(): void {
    if (this.isLoading) return;
    this.isLoading = true;
    this.cd.markForCheck();

    const apiUrl = environment.bedUsageUrl;
    const getTimestamp = () =>
      new Date().toLocaleString('vi-VN', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false 
      });

    this.http.get<ApiResponseData[]>(apiUrl).pipe(
      finalize(() => {
        this.isLoading = false;
        this.currentDateTime = getTimestamp();
        this.cd.markForCheck(); 
      }),
      takeUntil(this.destroy$)
    ).subscribe({
      next: (rawData) => {
        this.calculateAndUpdateWidgets(rawData);
        Promise.resolve().then(() => {
          const chartData = this.transformApiData(rawData);
          chartData.sort((a, b) => a.viName.localeCompare(b.viName));
          this.renderChart(chartData, true);
        });
      },
      error: (error) => {
        console.error('Error loading bed data:', error);
        if (this.chartInstance) this.chartInstance.clear();
        this.resetWidgetsToZero();
      },
    });
  }

  private renderChart(chartData: DepartmentChartData[], enableAnimation: boolean): void {
    if (!this.chartInstance || !this.echartsInstance) return;
    
    const option = this.buildOption(chartData);
    option.animation = enableAnimation;

    this.ngZone.runOutsideAngular(() => {
      requestAnimationFrame(() => {
        if (this.chartInstance) {
          this.chartInstance.setOption(option, {
            notMerge: false,
            lazyUpdate: true,
            silent: false
          });
        }
      });
    });
  }
  
  private transformApiData(apiData: ApiResponseData[]): DepartmentChartData[] {
    return apiData.map((item) => {
      const parts = this.parseDepartmentName(item.TenPhongBan);
      return {
        tenPhongBan: item.TenPhongBan, 
        viName: parts.viName,
        enName: parts.enName,
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
    // 1. Remove the (Σ: ...) part
    let cleanName = fullName.replace(/\s*-?\s*\(Σ:\s*\d+\)\s*$/, '').trim();
    
    // 2. STRATEGY 1: Check for Newline Separator (\r\n or \n)
    if (cleanName.match(/[\r\n]+/)) {
      const lines = cleanName.split(/[\r\n]+/);
      const validLines = lines.map(l => l.trim()).filter(l => l.length > 0);
      
      if (validLines.length >= 2) {
         return { 
           viName: validLines[0], 
           enName: validLines.slice(1).join(' ') 
         };
      }
    }

    // 3. FALLBACK
    cleanName = cleanName.replace(/[\r\n]+/g, ' ').trim();

    // Strategy 2: Try splitting by ' - '
    const parts = cleanName.split(/\s+-\s+/);
    if (parts.length >= 2) {
      return { viName: parts[0].trim(), enName: parts.slice(1).join(' - ').trim() };
    }

    // Strategy 3: Regex for "Vietnamese Name" followed by "English Name"
    const match = cleanName.match(/^(.+?)\s+([A-Z][a-zA-Z\s&()]+)$/);
    if (match) {
      return { viName: match[1].trim(), enName: match[2].trim() };
    }

    // 4. Return whole string as Vietnamese name
    return { viName: cleanName, enName: '' };
  }

  private updateWidgetValue(id: string, value: string): void {
    const widget = this.widgetData.find((w) => w.id === id);
    if (widget) widget.value = value;
  }

  private calculateAndUpdateWidgets(apiData: ApiResponseData[]): void {
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

    const occupiedBeds = totals.dangDieuTri + totals.choXuatVien + totals.daBook + totals.chuaSanSang + totals.choMuonGiuong;
    
    let occupancyRateStr = '0,0%';
    if (totals.totalBeds > 0) {
      const rate = (occupiedBeds / totals.totalBeds) * 100;
      occupancyRateStr = this.formatPercentage(rate); 
    }

    const updates = {
      occupancyRate: occupancyRateStr, 
      totalBeds: this.formatNumber(totals.totalBeds),
      giuongTrong: this.formatNumber(totals.giuongTrong),
      dangDieuTri: this.formatNumber(totals.dangDieuTri),
      choXuatVien: this.formatNumber(totals.choXuatVien),
      daBook: this.formatNumber(totals.daBook),
      chuaSanSang: this.formatNumber(totals.chuaSanSang),
      choMuonGiuong: this.formatNumber(totals.choMuonGiuong),
    };

    for (const widget of this.widgetData) {
      if (updates.hasOwnProperty(widget.id)) {
        widget.value = updates[widget.id as keyof typeof updates];
      }
    }
    this.cd.markForCheck();
  }

  private resetWidgetsToZero(): void {
    // Default to '0,0%'
    this.widgetData.forEach(w => w.value = w.id === 'occupancyRate' ? '0,0%' : '0');
    this.cd.markForCheck();
  }

  trackByWidgetId(index: number, item: WidgetData): string {
    return item.id;
  }

  private formatNumber(value: number): string {
    return new Intl.NumberFormat('vi-VN').format(value);
  }

  /**
   * UPDATED: Manually force 1 decimal place with a comma separator.
   * This bypasses locale issues where 'vi-VN' might default incorrectly in some environments.
   */
  private formatPercentage(value: number): string {
    return value.toFixed(1).replace('.', ',') + '%';
  }

  private buildOption(data: DepartmentChartData[]): EChartsOption {
    const xAxisData = data.map((item) =>
      item.enName ? `${item.viName}\n(${item.enName})` : item.viName
    );
    const currentColors = this.bedStatusSeries.map((s) => s.color);

    const series: any[] = this.bedStatusSeries.map((config) => ({
      name: config.name,
      type: 'bar' as const,
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
        fontFamily: GLOBAL_FONT_FAMILY,
        fontSize: 9,
        fontWeight: 'bold',
        formatter: (params: any) => (params.value > 0 ? params.value : '')
      },
      emphasis: { focus: 'none' as const },
      data: data.map((item: DepartmentChartData) => item[config.dataKey]),
    }));

    // Phantom series to show Total Sum
    series.push({
      name: 'Tổng (Total)',
      type: 'bar',
      barGap: '-100%', 
      barWidth: '60%', 
      data: data.map((item) => item.totalBeds),
      itemStyle: { color: 'transparent' },
      emphasis: { disabled: true },
      label: {
        show: true,
        position: 'top',
        color: this.cssVars.gray800,
        fontFamily: GLOBAL_FONT_FAMILY,
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
      useDirtyRect: true,
      backgroundColor: this.cssVars.white,
      textStyle: {
        fontFamily: GLOBAL_FONT_FAMILY,
        fontSize: 12,
        color: this.cssVars.gray700,
      },
      color: currentColors,
      tooltip: {
        trigger: 'axis',
        axisPointer: {
          type: 'shadow' as const,
          shadowStyle: { color: 'rgba(0, 89, 112, 0.1)' },
        },
        formatter: (params: any) => {
          if (!params || params.length === 0) return '';
          const dataIndex = params[0].dataIndex;
          const item = data[dataIndex]; 
          let result = `<div style="font-weight: bold; margin-bottom: 5px; font-size: 12px; font-family: ${GLOBAL_FONT_FAMILY};">${item.viName}</div>`;
          if (item.enName) {
            result += `<div style="margin-bottom: 5px; color: #666; font-family: ${GLOBAL_FONT_FAMILY};">${item.enName}</div>`;
          }
          params.forEach((param: any) => {
            if (param.seriesName === 'Tổng (Total)') return; 
            if (param.value > 0) {
              result += `<div style="margin: 3px 0; font-family: ${GLOBAL_FONT_FAMILY};">${param.marker} ${param.seriesName}: <strong>${param.value}</strong></div>`;
            }
          });
          result += `<div style="margin-top: 5px; padding-top: 5px; border-top: 1px solid #ccc; font-weight: bold; font-family: ${GLOBAL_FONT_FAMILY};">Tổng số giường: <strong>${item.totalBeds}</strong></div>`;
          return result;
        },
      },
      legend: {
        data: this.bedStatusSeries.map(s => s.name),
        top: '2%',
        left: 'center',
        show: true,
        type: 'scroll',
        orient: 'horizontal',
        itemGap: 8,
        textStyle: { fontSize: 10 },
        backgroundColor: 'rgba(255, 255, 255, 0.85)',
        borderRadius: 4,
      },
      grid: {
        left: '5%',
        right: '5%',
        containLabel: true,
      },
      dataZoom: [
        {
          type: 'slider',
          show: true,
          xAxisIndex: [0],
          startValue: 0, 
          endValue: 8, 
          bottom: '10px',
          height: 20,
          borderColor: 'transparent',
          backgroundColor: '#f1f5f9',
          fillerColor: 'rgba(0, 131, 155, 0.2)',
          handleStyle: {
            color: this.cssVars.tealBlue,
            borderColor: this.cssVars.tealBlue
          },
          brushSelect: false 
        },
        {
          type: 'inside', 
          xAxisIndex: [0],
          startValue: 0,
          endValue: 8,
          zoomOnMouseWheel: false,
          moveOnMouseWheel: true,
          moveOnMouseMove: true
        }
      ],
      xAxis: {
        type: 'category',
        data: xAxisData,
        axisLabel: {
          interval: 0, 
          rotate: 45, 
          fontSize: 10, 
          fontWeight: 'bold',
          overflow: 'truncate', 
          hideOverlap: false, 
          margin: 10,
        },
        axisTick: { alignWithLabel: true },
        axisLine: { show: true, lineStyle: { color: this.cssVars.peacockBlue } },
      },
      yAxis: {
        type: 'value',
        name: 'Tổng Số Giường (Total)',
        nameLocation: 'middle',
        nameGap: 45,
        min: 0,
        max: (val: { max: number }) => (val.max > 60 ? Math.ceil(val.max / 10) * 10 : 60),
        interval: 10,
        splitLine: {
          show: true,
          lineStyle: { color: this.cssVars.gray200, type: 'dotted' },
        },
      },
      series: series,
    };
  }
}