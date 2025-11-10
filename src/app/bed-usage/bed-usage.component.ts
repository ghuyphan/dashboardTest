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
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { finalize, takeUntil } from 'rxjs/operators';
import { Subject, Subscription, fromEvent } from 'rxjs';

import type { EChartsType, EChartsCoreOption } from 'echarts/core';
import type * as echarts from 'echarts/core';
import { WidgetCardComponent } from '../components/widget-card/widget-card.component';
import { environment } from '../../environments/environment.development';

type EChartsOption = EChartsCoreOption;

const GLOBAL_FONT_FAMILY =
  'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

function getCssVar(name: string): string {
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
  private resizeListener?: () => void;
  private resizeObserver?: ResizeObserver;
  private dataRefreshInterval?: ReturnType<typeof setInterval>;
  private intersectionObserver?: IntersectionObserver;

  currentDateTime: string = '';
  public isLoading: boolean = false;
  private isChartVisible: boolean = false;
  public isChartInitialized: boolean = false;
  private pendingChartData?: DepartmentChartData[];

  widgetData: WidgetData[] = [];
  private bedStatusSeries: BedStatusSeries[] = [];
  
  // Cached CSS Vars
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
  };

  // Performance optimizations
  private destroy$ = new Subject<void>();
  private resizeSubject = new Subject<void>();
  private chartResizeSubscription!: Subscription;
  private visibilityChangeSubscription!: Subscription;

  ngOnInit(): void {
    this.initColors();
    // Defer initial data load to next tick to avoid blocking UI
    Promise.resolve().then(() => this.loadData());
  }

  ngAfterViewInit(): void {
    this.setupResizeHandling();
    this.setupVisibilityHandling();
    
    // Defer heavy initialization
    if (typeof requestIdleCallback !== 'undefined') {
      requestIdleCallback(() => {
        this.setupIntersectionObserver();
        this.startRefreshInterval();
      }, { timeout: 2000 });
    } else {
      setTimeout(() => {
        this.setupIntersectionObserver();
        this.startRefreshInterval();
      }, 0);
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    
    if (this.resizeListener) {
      window.removeEventListener('resize', this.resizeListener);
    }
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
    }
    if (this.intersectionObserver) {
      this.intersectionObserver.disconnect();
    }
    if (this.chartInstance) {
      this.chartInstance.dispose();
    }
    if (this.dataRefreshInterval) {
      clearInterval(this.dataRefreshInterval);
    }
    if (this.chartResizeSubscription) {
      this.chartResizeSubscription.unsubscribe();
    }
    if (this.visibilityChangeSubscription) {
      this.visibilityChangeSubscription.unsubscribe();
    }
  }

  // OPTIMIZATION 1: Efficient resize handling with debouncing
  private setupResizeHandling(): void {
    this.chartResizeSubscription = this.resizeSubject.pipe(
      takeUntil(this.destroy$)
    ).subscribe(() => {
      this.ngZone.runOutsideAngular(() => {
        this.chartInstance?.resize();
      });
    });
  }

  // OPTIMIZATION: Trigger resize through subject
  private triggerResize(): void {
    this.resizeSubject.next();
  }

  // OPTIMIZATION 2: Page visibility API integration
  private setupVisibilityHandling(): void {
    this.visibilityChangeSubscription = fromEvent(document, 'visibilitychange')
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        if (!document.hidden && this.isChartInitialized && this.pendingChartData) {
          this.renderChart(this.pendingChartData, false);
          this.pendingChartData = undefined;
        }
      });
  }

  // OPTIMIZATION 3: Efficient refresh interval management
  private startRefreshInterval(): void {
    this.ngZone.runOutsideAngular(() => {
      this.dataRefreshInterval = setInterval(() => {
        // Only refresh when tab is visible
        if (document.visibilityState === 'visible') {
          this.ngZone.run(() => this.loadData());
        }
      }, 60000);
    });
  }

  private setupIntersectionObserver(): void {
    if (typeof IntersectionObserver === 'undefined') {
      // Fallback: initialize chart immediately if IntersectionObserver not supported
      this.initializeChart();
      return;
    }

    this.intersectionObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && !this.isChartVisible) {
            this.isChartVisible = true;
            this.intersectionObserver?.disconnect();
            
            // Schedule initialization during idle time
            if (typeof requestIdleCallback !== 'undefined') {
              requestIdleCallback(() => this.initializeChart(), { timeout: 2000 });
            } else {
              setTimeout(() => this.initializeChart(), 0);
            }
          }
        });
      },
      {
        root: null,
        rootMargin: '100px', // Start loading earlier
        threshold: 0.01,
      }
    );

    this.intersectionObserver.observe(this.chartContainer.nativeElement);
  }

  private async initializeChart(): Promise<void> {
    if (this.isChartInitialized) return;
    
    this.isChartInitialized = true;
    
    // Lazy load ECharts
    await this.lazyLoadECharts();
    
    // Initialize chart instance
    this.initChart();
    
    // Setup resize listeners
    this.setupResizeListener();
    
    // If we have pending data, render it now
    if (this.pendingChartData) {
      this.renderChart(this.pendingChartData, false);
      this.pendingChartData = undefined;
    }
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

    this.widgetData = [
      { id: 'occupancyRate', title: 'Công Suất Sử Dụng', value: '0,00%', caption: 'Occupancy Rate', icon: 'fas fa-chart-pie', accentColor: c('--chart-color-1') },
      { id: 'totalBeds', title: 'Tổng Số Giường', value: '0', caption: 'Total Beds', icon: 'fas fa-hospital', accentColor: c('--chart-color-2') },
      { id: 'giuongTrong', title: 'Giường Trống', value: '0', caption: 'Vacant Beds', icon: 'fas fa-check-circle', accentColor: c('--chart-color-3') },
      { id: 'dangDieuTri', title: 'Đang Điều Trị', value: '0', caption: 'In Treatment', icon: 'fas fa-user-injured', accentColor: c('--chart-color-1') },
      { id: 'choXuatVien', title: 'Chờ Xuất Viện', value: '0', caption: 'Awaiting Discharge', icon: 'fas fa-door-open', accentColor: c('--chart-color-8') },
      { id: 'daBook', title: 'Đã Book', value: '0', caption: 'Booked Beds', icon: 'fas fa-bookmark', accentColor: c('--chart-color-6') },
      { id: 'chuaSanSang', title: 'Chưa Sẵn Sàng', value: '0', caption: 'Not Ready', icon: 'fas fa-tools', accentColor: c('--chart-color-7') }
    ];

    this.bedStatusSeries = [
      { name: 'Giường trống (Vacant)', dataKey: 'giuongTrong', color: c('--chart-color-3') },
      { name: 'Đang điều trị (In Treatment)', dataKey: 'dangDieuTri', color: c('--chart-color-1') },
      { name: 'Chờ xuất viện (Awaiting Discharge)', dataKey: 'choXuatVien', color: c('--chart-color-8') },
      { name: 'Đã book (Booked)', dataKey: 'daBook', color: c('--chart-color-6') },
      { name: 'Chưa sẵn sàng (Not Ready)', dataKey: 'chuaSanSang', color: c('--chart-color-7') },
      { name: 'Cho mượn giường (On Loan)', dataKey: 'choMuonGiuong', color: c('--chart-color-9') }
    ];
    
    // Cache CSS variables
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
    };
  }

  private initChart(): void {
    if (!this.echartsInstance) {
      console.error('ECharts has not been loaded');
      return;
    }
    
    const container = this.chartContainer.nativeElement;
    
    this.ngZone.runOutsideAngular(() => {
      this.chartInstance = this.echartsInstance!.init(container, undefined, {
        renderer: 'canvas',
        useDirtyRect: true, // Performance optimization
      });
    });

    this.ngZone.runOutsideAngular(() => {
      setTimeout(() => {
        this.chartInstance?.resize();
      }, 100);
    });
  }

  private setupResizeListener(): void {
    this.ngZone.runOutsideAngular(() => {
      // Debounced resize handler
      let resizeTimeout: any;
      this.resizeListener = () => {
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(() => {
          this.triggerResize();
        }, 150);
      };
      window.addEventListener('resize', this.resizeListener, { passive: true });

      if (typeof ResizeObserver !== 'undefined') {
        this.resizeObserver = new ResizeObserver(() => {
          clearTimeout(resizeTimeout);
          resizeTimeout = setTimeout(() => {
            this.triggerResize();
          }, 150);
        });
        this.resizeObserver.observe(this.chartContainer.nativeElement);
      }
    });
  }

  public loadData(): void {
    if (this.isLoading) return;
    
    this.isLoading = true;
    this.cd.markForCheck(); // Mark once to show spinner

    const apiUrl = environment.bedUsageUrl;
    const getTimestamp = () =>
      new Date().toLocaleString('vi-VN', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });

    this.http
      .get<ApiResponseData[]>(apiUrl)
      .pipe(
        finalize(() => {
          // This runs *after* next() or error()
          this.isLoading = false;
          this.currentDateTime = getTimestamp();
          this.cd.markForCheck(); // Mark once at the end to update everything
        }),
        takeUntil(this.destroy$)
      )
      .subscribe({
        next: (rawData) => {
          // Update widgets immediately (fast, no blocking)
          this.calculateAndUpdateWidgets(rawData);
          
          // Transform and sort data in next tick
          Promise.resolve().then(() => {
            const chartData = this.transformApiData(rawData);
            chartData.sort((a, b) => a.viName.localeCompare(b.viName));
            
            // If chart is visible and initialized, render immediately
            // Otherwise, store for later rendering
            if (this.isChartInitialized && this.chartInstance) {
              this.renderChart(chartData, true);
            } else {
              this.pendingChartData = chartData;
            }
          });
        },
        error: (error) => {
          console.error('Error loading bed utilization data:', error);
          if (this.chartInstance) {
            this.chartInstance.clear();
          }
          this.resetWidgetsToZero();
        },
      });
  }

  private renderChart(chartData: DepartmentChartData[], enableAnimation: boolean): void {
    if (!this.chartInstance || !this.echartsInstance) return;
    
    const option = this.buildOption(chartData);
    
    // Enable animation for updates, disable for initial render
    option.animation = enableAnimation;
    
    // Use requestAnimationFrame for smooth rendering
    this.ngZone.runOutsideAngular(() => {
      requestAnimationFrame(() => {
        if (this.chartInstance) {
          this.chartInstance.setOption(option, {
            notMerge: false,
            lazyUpdate: true,
            silent: true
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
    const withoutTotal = fullName.replace(/\s*-?\s*\(Σ:\s*\d+\)\s*$/, '').trim();
    const parts = withoutTotal.split(/\s+-\s+/);
    
    if (parts.length >= 2) {
      return {
        viName: parts[0].trim(),
        enName: parts.slice(1).join(' - ').trim(),
      };
    }
    
    const match = withoutTotal.match(/^(.+?)\s+([A-Z][a-zA-Z\s&()]+)$/);
    if (match) {
      return {
        viName: match[1].trim(),
        enName: match[2].trim(),
      };
    }
    
    return {
      viName: withoutTotal,
      enName: '',
    };
  }

  private updateWidgetValue(id: string, value: string): void {
    const widget = this.widgetData.find((w) => w.id === id);
    if (widget) {
      widget.value = value;
    }
  }

  // OPTIMIZATION 4: Web Worker-like data processing
  private calculateAndUpdateWidgets(apiData: ApiResponseData[]): void {
    const totals = {
      giuongTrong: 0,
      dangDieuTri: 0,
      choXuatVien: 0,
      daBook: 0,
      chuaSanSang: 0,
      choMuonGiuong: 0,
      totalBeds: 0,
    };

    // Manual loop instead of reduce for better performance
    for (const item of apiData) {
      totals.giuongTrong += item.GiuongTrong;
      totals.dangDieuTri += item.DangSuDung;
      totals.choXuatVien += item.ChoXuatVien;
      totals.daBook += item.DaBook;
      totals.chuaSanSang += item.ChuaSanSang;
      totals.choMuonGiuong += item.ChoMuonGiuong;
      totals.totalBeds += item.Tong;
    }

    const occupiedBeds =
      totals.dangDieuTri +
      totals.choXuatVien +
      totals.daBook +
      totals.chuaSanSang +
      totals.choMuonGiuong;

    let occupancyRateStr = '0,00%';
    if (totals.totalBeds > 0) {
      const rate = (occupiedBeds / totals.totalBeds) * 100;
      occupancyRateStr = this.formatPercentage(rate);
    }

    // Batch update all widgets at once
    const updates = {
      occupancyRate: occupancyRateStr,
      totalBeds: this.formatNumber(totals.totalBeds),
      giuongTrong: this.formatNumber(totals.giuongTrong),
      dangDieuTri: this.formatNumber(totals.dangDieuTri),
      choXuatVien: this.formatNumber(totals.choXuatVien),
      daBook: this.formatNumber(totals.daBook),
      chuaSanSang: this.formatNumber(totals.chuaSanSang),
    };

    for (const widget of this.widgetData) {
      if (updates.hasOwnProperty(widget.id)) {
        widget.value = updates[widget.id as keyof typeof updates];
      }
    }
    
    // Single change detection mark
    this.cd.markForCheck();
  }

  private resetWidgetsToZero(): void {
    this.updateWidgetValue('occupancyRate', '0,00%');
    this.updateWidgetValue('totalBeds', '0');
    this.updateWidgetValue('dangDieuTri', '0');
    this.updateWidgetValue('giuongTrong', '0');
    this.updateWidgetValue('daBook', '0');
    this.updateWidgetValue('choXuatVien', '0');
    this.updateWidgetValue('chuaSanSang', '0');
    this.cd.markForCheck();
  }

  trackByWidgetId(index: number, item: WidgetData): string {
    return item.id;
  }

  private formatNumber(value: number): string {
    return new Intl.NumberFormat('vi-VN', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  }

  private formatPercentage(value: number): string {
    return (
      new Intl.NumberFormat('vi-VN', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(value) + '%'
    );
  }

  private buildOption(data: DepartmentChartData[]): EChartsOption {
    const xAxisData = data.map((item) =>
      item.enName ? `${item.viName}\n(${item.enName})` : item.viName
    );
    const currentColors = this.bedStatusSeries.map((s) => s.color);

    const series = this.bedStatusSeries.map((config) => ({
      name: config.name,
      type: 'bar' as const,
      stack: 'beds',
      barWidth: '35%',
      itemStyle: {
        color: config.color,
        borderRadius: data.length > 25 ? 0 : [4, 4, 0, 0], // Disable border radius for large datasets
        borderColor: 'rgba(255, 255, 255, 0.3)',
        borderWidth: 1,
      },
      label: {
        show: false,
      },
      labelLayout: {
        hideOverlap: true,
      },
      emphasis: {
        focus: 'none' as const,
        itemStyle: {
          borderColor: currentColors[0],
          borderWidth: 2,
          shadowBlur: 8,
          shadowColor: 'rgba(0, 174, 203, 0.25)',
        },
      },
      data: data.map((item: DepartmentChartData) => item[config.dataKey]),
      // Disable animations for large datasets
      animation: data.length < 20 ? true : false,
    }));

    return {
      // Critical performance optimizations
      useDirtyRect: true,
      progressive: 0,
      progressiveThreshold: 5000,
      
      backgroundColor: this.cssVars.white,
      textStyle: {
        fontFamily: GLOBAL_FONT_FAMILY,
        fontSize: 12,
        color: this.cssVars.gray700,
      },
      animation: true,
      animationDuration: 800,
      animationDurationUpdate: 300,
      animationEasingUpdate: 'cubicInOut',
      animationEasing: 'quadraticInOut',
      color: currentColors,
      tooltip: {
        trigger: 'axis',
        axisPointer: {
          type: 'shadow' as const,
          shadowStyle: {
            color: 'rgba(0, 89, 112, 0.1)',
          },
        },
        formatter: (params: any) => {
          if (!params || params.length === 0) return '';
          const dataIndex = params[0].dataIndex;
          const item = data[dataIndex];
          let result = `<div style="font-weight: bold; margin-bottom: 5px; font-size: 12px; font-family: ${GLOBAL_FONT_FAMILY};">${item.viName}</div>`;
          result += `<div style="margin-bottom: 5px; color: #666; font-family: ${GLOBAL_FONT_FAMILY};">${item.enName}</div>`;
          params.forEach((param: any) => {
            if (param.value > 0) {
              result += `<div style="margin: 3px 0; font-family: ${GLOBAL_FONT_FAMILY};">`;
              result += `${param.marker} ${param.seriesName}: <strong>${param.value}</strong>`;
              result += `</div>`;
            }
          });
          result += `<div style="margin-top: 5px; padding-top: 5px; border-top: 1px solid #ccc; font-weight: bold; font-family: ${GLOBAL_FONT_FAMILY};">`;
          result += `Tổng số giường: <strong>${item.totalBeds}</strong>`;
          result += `</div>`;
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
        textStyle: {
          fontSize: 10
        },
        backgroundColor: 'rgba(255, 255, 255, 0.85)',
        borderRadius: 4,
        pageTextStyle: {
          fontFamily: GLOBAL_FONT_FAMILY
        }
      },
      grid: {
        left: '5%',
        right: '5%',
        top: '12%',
        bottom: '28%',
        containLabel: true,
      },
      xAxis: {
        type: 'category',
        data: xAxisData,
        axisLabel: {
          interval: 0,
          fontSize: 9,
          fontWeight: 'bold',
          overflow: 'break',
          hideOverlap: true,
          margin: 3,
          width: 80, // Constrain label width for performance
        },
        axisTick: {
          alignWithLabel: true,
          length: 5,
          lineStyle: {
            color: this.cssVars.gray300,
          },
        },
        axisLine: {
          show: true,
          lineStyle: {
            color: this.cssVars.peacockBlue,
            width: 2,
          },
        },
        splitLine: {
          show: false,
        },
      },
      yAxis: {
        type: 'value',
        name: 'Tổng Số Giường\n(Total Beds)',
        nameLocation: 'middle',
        nameGap: 45,
        nameRotate: 90,
        nameTextStyle: {
          fontSize: 12,
          fontWeight: 'bold',
          color: this.cssVars.gray800,
          lineHeight: 16,
        },
        min: 0,
        max: 60,
        interval: 10,
        splitLine: {
          show: true,
          lineStyle: {
            color: this.cssVars.gray200,
            width: 1,
            type: 'dotted',
          },
        },
        axisLine: {
          show: true,
          lineStyle: {
            color: this.cssVars.gray700,
            width: 1.5,
          },
        },
        axisTick: {
          show: true,
          length: 4,
          lineStyle: {
            color: this.cssVars.gray700,
          },
        },
        axisLabel: {
          fontSize: 11,
          color: this.cssVars.gray700,
          margin: 10,
        },
      },
      series: series,
      barCategoryGap: '30%',
      dataZoom: [
        {
          type: 'slider',
          xAxisIndex: 0,
          filterMode: 'filter',
          realtime: false, // Disable real-time update
          start: 0,
          end: data.length > 10 ? 50 : 100,
          bottom: 20,
          height: 20,
          handleIcon:
            'path://M306.1,4.3C306.1,4.3,306.1,4.3,306.1,4.3C306.1,4.3,306.1,4.3,306.1,4.3C306.1,4.3,306.1,4.3,306.1,4.3C306.1,4.3,306.1,4.3,306.1,4.3z',
          handleSize: '110%',
          handleStyle: { color: '#fff', borderColor: '#aaa', borderWidth: 1 },
          backgroundColor: '#f3f3f3',
          dataBackground: { 
            lineStyle: { color: this.cssVars.gray200 }, 
            areaStyle: { color: this.cssVars.gray200 } 
          },
          selectedDataBackground: { 
            lineStyle: { color: this.cssVars.peacockBlue }, 
            areaStyle: { color: this.cssVars.peacockBlue, opacity: 0.1 } 
          },
          moveHandleStyle: { color: this.cssVars.peacockBlue, opacity: 0.7 },
          animation: false,
        },
        {
          type: 'inside',
          xAxisIndex: 0,
          filterMode: 'filter',
          start: 0,
          end: data.length > 10 ? 50 : 100,
          animation: false,
        },
      ],
    };
  }
}