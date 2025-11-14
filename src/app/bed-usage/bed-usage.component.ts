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
import { finalize, takeUntil, throttleTime } from 'rxjs/operators';
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

// --- Interfaces (Unchanged) ---
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
  
  // --- *** START OF FIX *** ---
  // Re-added the missing property declaration
  private resizeListener?: () => void;
  // --- *** END OF FIX *** ---
  
  private resizeObserver?: ResizeObserver;
  private dataRefreshInterval?: ReturnType<typeof setInterval>;
  private intersectionObserver?: IntersectionObserver;

  currentDateTime: string = '';
  public isLoading: boolean = false;
  private isChartVisible: boolean = false;
  public isChartInitialized: boolean = false;
  
  private currentChartData?: DepartmentChartData[];

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
      requestIdleCallback(
        () => {
          this.setupIntersectionObserver();
          this.startRefreshInterval();
        },
        { timeout: 2000 }
      );
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

    // --- MODIFIED: Check for resizeListener ---
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

  private setupResizeHandling(): void {
    this.chartResizeSubscription = this.resizeSubject
      .pipe(
        throttleTime(150, undefined, { leading: true, trailing: true }), 
        takeUntil(this.destroy$)
      )
      .subscribe(() => {
        this.ngZone.runOutsideAngular(() => {
          if (this.chartInstance && this.currentChartData) {
            // Re-build the options with new dimensions
            const newOption = this.buildOption(this.currentChartData);
            this.chartInstance.setOption(newOption, {
              notMerge: true, 
              lazyUpdate: true,
            });
          }
          this.chartInstance?.resize();
        });
      });
  }

  private triggerResize(): void {
    this.resizeSubject.next();
  }

  private setupVisibilityHandling(): void {
    this.visibilityChangeSubscription = fromEvent(document, 'visibilitychange')
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        if (
          !document.hidden &&
          this.isChartInitialized &&
          this.currentChartData
        ) {
          this.renderChart(this.currentChartData, false);
        }
      });
  }

  private startRefreshInterval(): void {
    this.ngZone.runOutsideAngular(() => {
      this.dataRefreshInterval = setInterval(() => {
        if (document.visibilityState === 'visible') {
          this.ngZone.run(() => this.loadData());
        }
      }, 60000);
    });
  }

  private setupIntersectionObserver(): void {
    if (typeof IntersectionObserver === 'undefined') {
      this.initializeChart();
      return;
    }

    this.intersectionObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && !this.isChartVisible) {
            this.isChartVisible = true;
            this.intersectionObserver?.disconnect();

            if (typeof requestIdleCallback !== 'undefined') {
              requestIdleCallback(() => this.initializeChart(), {
                timeout: 2000,
              });
            } else {
              setTimeout(() => this.initializeChart(), 0);
            }
          }
        });
      },
      {
        root: null,
        rootMargin: '100px', 
        threshold: 0.01,
      }
    );

    this.intersectionObserver.observe(this.chartContainer.nativeElement);
  }

  private async initializeChart(): Promise<void> {
    if (this.isChartInitialized) return;

    this.isChartInitialized = true;

    await this.lazyLoadECharts();
    this.initChart();
    this.setupResizeListener(); // Setup listener *after* init

    if (this.currentChartData) {
      this.renderChart(this.currentChartData, false);
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
      ] = await Promise.all([
        import('echarts/core'),
        import('echarts/renderers'),
        import('echarts/charts'),
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
        useDirtyRect: true, 
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
      if (typeof ResizeObserver !== 'undefined') {
        this.resizeObserver = new ResizeObserver(() => {
          this.triggerResize(); 
        });
        this.resizeObserver.observe(this.chartContainer.nativeElement);
      } else {
        // Fallback for older browsers
        this.resizeListener = () => {
          this.triggerResize();
        };
        window.addEventListener('resize', this.resizeListener, { passive: true });
      }
    });
  }

  public loadData(): void {
    if (this.isLoading) return;

    this.isLoading = true;
    this.cd.markForCheck(); 

    const apiUrl = environment.bedUsageUrl;

    const getTimestamp = () =>
      new Date().toLocaleString('vi-VN', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      });

    this.http
      .get<ApiResponseData[]>(apiUrl)
      .pipe(
        finalize(() => {
          this.isLoading = false;
          this.currentDateTime = getTimestamp();
          this.cd.markForCheck(); 
        }),
        takeUntil(this.destroy$)
      )
      .subscribe({
        next: (rawData) => {
          this.calculateAndUpdateWidgets(rawData);

          Promise.resolve().then(() => {
            const chartData = this.transformApiData(rawData);
            chartData.sort((a, b) => a.viName.localeCompare(b.viName));

            this.currentChartData = chartData;

            if (this.isChartInitialized && this.chartInstance) {
              this.renderChart(chartData, true);
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

  private renderChart(
    chartData: DepartmentChartData[],
    enableAnimation: boolean
  ): void {
    if (!this.chartInstance || !this.echartsInstance) return;

    const option = this.buildOption(chartData);

    const isLargeDataset = chartData.length > 30;
    const shouldAnimate = enableAnimation && !isLargeDataset;
    (option as any).animation = shouldAnimate;
    (option as any).animationDuration = shouldAnimate ? 800 : 0;
    (option as any).animationDurationUpdate = shouldAnimate ? 300 : 0;

    this.ngZone.runOutsideAngular(() => {
      requestAnimationFrame(() => {
        if (this.chartInstance) {
          this.chartInstance.setOption(option, {
            notMerge: true, 
            lazyUpdate: true,
            silent: true,
          });
        }
      });
    });
  }

  private transformApiData(
    apiData: ApiResponseData[]
  ): DepartmentChartData[] {
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

  private parseDepartmentName(
    fullName: string
  ): { viName: string; enName: string } {
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
    // --- START OF RESPONSIVE POLISH ---
    const chartWidth = this.chartContainer.nativeElement.clientWidth;
    const isMobile = chartWidth < 768;
    const isSmallMobile = chartWidth < 480;
    const isLargeDataset = data.length > 25; 
    // --- END OF RESPONSIVE POLISH ---

    const xAxisData = data.map((item) =>
      item.enName ? `${item.viName}\n(${item.enName})` : item.viName
    );
    const currentColors = this.bedStatusSeries.map((s) => s.color);

    const series = this.bedStatusSeries.map((config) => ({
      name: config.name,
      type: 'bar' as const,
      stack: 'beds',
      barWidth: isMobile ? '60%' : '40%', 
      itemStyle: {
        color: config.color,
        borderRadius: isLargeDataset ? 0 : [4, 4, 0, 0],
        borderColor: 'rgba(255, 255, 255, 0.3)',
        borderWidth: 1,
      },
      label: {
        show: !isSmallMobile, 
        position: 'inside' as const,
        color: this.cssVars.white,
        fontFamily: GLOBAL_FONT_FAMILY,
        fontSize: isSmallMobile ? 8 : 10,
        fontWeight: '600',
        formatter: (params: any) => {
          return params.value > 0 ? params.value : '';
        },
      },
      labelLayout: {
        hideOverlap: true,
      },
      emphasis: {
        focus: 'none' as const,
      },
      data: data.map((item: DepartmentChartData) => item[config.dataKey]),
      animation: !isLargeDataset,
    }));

    return {
      useDirtyRect: true,
      progressive: isLargeDataset ? 1000 : 0,
      progressiveThreshold: 3000,

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
          shadowStyle: {
            color: 'rgba(0, 89, 112, 0.1)',
          },
        },
        confine: true, 
        textStyle: {
          fontFamily: GLOBAL_FONT_FAMILY,
          fontSize: 12, 
        },
        formatter: (params: any) => {
          if (!params || params.length === 0) return '';
          const dataIndex = params[0].dataIndex;
          const item = data[dataIndex];
          let result = `<div style="font-weight: bold; margin-bottom: 5px; font-size: 13px; font-family: ${GLOBAL_FONT_FAMILY};">${item.viName}</div>`;
          if (item.enName) {
            result += `<div style="margin-bottom: 8px; color: #666; font-size: 11px; font-family: ${GLOBAL_FONT_FAMILY};">${item.enName}</div>`;
          }
          params.forEach((param: any) => {
            if (param.value > 0) {
              result += `<div style="margin: 4px 0; font-size: 12px; font-family: ${GLOBAL_FONT_FAMILY};">${param.marker} ${param.seriesName}: <strong>${param.value}</strong></div>`;
            }
          });
          result += `<div style="margin-top: 8px; padding-top: 6px; border-top: 1px solid #ccc; font-weight: bold; font-size: 12px; font-family: ${GLOBAL_FONT_FAMILY};">Tổng số giường: <strong>${item.totalBeds}</strong></div>`;
          return result;
        },
      },
      legend: {
        data: this.bedStatusSeries.map((s) => s.name),
        // --- RESPONSIVE POLISH ---
        top: isMobile ? '8%' : '3%', 
        left: 'center',
        show: true,
        type: 'scroll',
        orient: 'horizontal',
        itemGap: isMobile ? 6 : 10,
        textStyle: {
          fontSize: isMobile ? 10 : 12, 
        },
        // ---
        backgroundColor: 'rgba(255, 255, 255, 0.85)',
        borderRadius: 4,
        pageTextStyle: {
          fontFamily: GLOBAL_FONT_FAMILY,
        },
      },
      grid: {
        // --- RESPONSIVE POLISH: Dynamic grid spacing ---
        left: isMobile ? '16%' : '8%', 
        right: isMobile ? '4%' : '5%',
        top: isMobile ? '22%' : '15%', 
        bottom: isMobile ? '35%' : '30%', 
        containLabel: true,
        // --- END RESPONSIVE POLISH ---
      },
      xAxis: {
        type: 'category',
        data: xAxisData,
        axisLabel: {
          // --- RESPONSIVE POLISH ---
          interval: isLargeDataset ? 'auto' : 0,
          rotate: isMobile || isLargeDataset ? 45 : 0, 
          fontSize: isMobile ? 10 : isLargeDataset ? 10 : 11,
          fontWeight: '500', 
          overflow: 'break',
          hideOverlap: true,
          margin: 8, 
          width: isMobile ? 70 : 90, 
          // --- END RESPONSIVE POLISH ---
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
        // --- RESPONSIVE POLISH: Dynamic Y-axis ---
        nameGap: isMobile ? 48 : 60, 
        nameRotate: 90,
        nameTextStyle: {
          fontSize: 13, 
          fontWeight: 'bold',
          color: this.cssVars.gray800,
          lineHeight: 16,
        },
        min: 0,
        // Let ECharts calculate max and interval
        // max: 60, 
        // interval: 10, 
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
          fontSize: isMobile ? 11 : 12, 
          color: this.cssVars.gray700,
          margin: isMobile ? 5 : 10,
        },
        // --- END RESPONSIVE POLISH ---
      },
      series: series,
      barCategoryGap: '30%',
    };
  }
}