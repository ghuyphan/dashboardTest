// src/app/device-dashboard/device-dashboard.component.ts

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
import { environment } from '../../environments/environment.development';

import { Device } from '../models/device.model';
import { ToastService } from '../services/toast.service';

type EChartsOption = EChartsCoreOption;

// This interface is still useful for holding our *aggregated* data
interface DeviceStatsData {
  TenTrangThai: string;
  SoLuong: number;
}

const GLOBAL_FONT_FAMILY =
  'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

// Helper to get CSS variables
function getCssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

@Component({
  selector: 'app-device-dashboard',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './device-dashboard.component.html',
  styleUrl: './device-dashboard.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DeviceDashboardComponent implements OnInit, OnDestroy, AfterViewInit {
  @ViewChild('chartContainer', { static: true })
  chartContainer!: ElementRef<HTMLDivElement>;

  private http = inject(HttpClient);
  private cd = inject(ChangeDetectorRef);
  private ngZone = inject(NgZone);
  private toastService = inject(ToastService); // <-- INJECTED

  private echartsInstance?: typeof echarts;
  private chartInstance?: EChartsType;
  private resizeObserver?: ResizeObserver;
  private intersectionObserver?: IntersectionObserver;

  public isLoading: boolean = false;
  private isChartVisible: boolean = false;
  public isChartInitialized: boolean = false;
  private pendingChartData?: DeviceStatsData[]; // This holds the aggregated data
  
  // Cached CSS Vars for chart colors
  private chartColors: string[] = [];
  private cssVars = {
    gray700: '',
    gray800: '',
    white: '',
  };

  private destroy$ = new Subject<void>();
  private resizeSubject = new Subject<void>();
  private chartResizeSubscription!: Subscription;

  ngOnInit(): void {
    this.initColors();
    // Defer initial data load
    Promise.resolve().then(() => this.loadData());
  }

  ngAfterViewInit(): void {
    this.setupResizeHandling();
    this.setupIntersectionObserver();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.resizeObserver?.disconnect();
    this.intersectionObserver?.disconnect();
    this.chartInstance?.dispose();
    this.chartResizeSubscription?.unsubscribe();
  }

  private setupResizeHandling(): void {
    this.chartResizeSubscription = this.resizeSubject.pipe(
      takeUntil(this.destroy$)
    ).subscribe(() => {
      this.ngZone.runOutsideAngular(() => {
        this.chartInstance?.resize();
      });
    });
  }

  private triggerResize(): void {
    this.resizeSubject.next();
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
            this.initializeChart();
          }
        });
      },
      { rootMargin: '100px', threshold: 0.01 }
    );

    this.intersectionObserver.observe(this.chartContainer.nativeElement);
  }

  private async initializeChart(): Promise<void> {
    if (this.isChartInitialized) return;
    this.isChartInitialized = true;

    await this.lazyLoadECharts();
    this.initChart();
    this.setupResizeListener();

    if (this.pendingChartData) {
      this.renderChart(this.pendingChartData);
      this.pendingChartData = undefined;
    }
  }

  private async lazyLoadECharts(): Promise<void> {
    try {
      const [
        echartsCore,
        CanvasRenderer,
        PieChart,
        TitleComponent,
        TooltipComponent,
        LegendComponent,
      ] = await Promise.all([
        import('echarts/core'),
        import('echarts/renderers'),
        import('echarts/charts'),
        import('echarts/components'),
        import('echarts/components'),
        import('echarts/components'),
      ]);

      this.echartsInstance = echartsCore;

      this.echartsInstance.use([
        CanvasRenderer.CanvasRenderer,
        PieChart.PieChart,
        TitleComponent.TitleComponent,
        TooltipComponent.TooltipComponent,
        LegendComponent.LegendComponent,
      ]);
    } catch (error) {
      console.error('Error lazy-loading ECharts', error);
    }
  }

  private initColors(): void {
    const c = getCssVar;
    // Get colors from your palette
    this.chartColors = [
      c('--color-success'),     // Sẵn sàng
      c('--peacock-blue-light'),// Đang sử dụng
      c('--color-warning'),    // Bảo trì / Sửa chữa
      c('--color-danger'),     // Hỏng / Thanh lý
      c('--gray-500'),          // Default / Khác
      c('--chart-color-6'),     // Đã Book
      c('--chart-color-9'),     // Cho mượn
    ];
    
    this.cssVars = {
      gray700: c('--gray-700'),
      gray800: c('--gray-800'),
      white: c('--white'),
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

  private setupResizeListener(): void {
    this.ngZone.runOutsideAngular(() => {
      let resizeTimeout: any;
      const onResize = () => {
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(() => this.triggerResize(), 150);
      };
      
      window.addEventListener('resize', onResize, { passive: true });
      
      this.resizeObserver = new ResizeObserver(onResize);
      this.resizeObserver.observe(this.chartContainer.nativeElement);
    });
  }

  public loadData(): void {
    if (this.isLoading) return;
    
    this.isLoading = true;
    this.cd.markForCheck();

    // === MODIFICATION ===
    // Using the base equipment URL, assuming it returns ALL devices.
    const apiUrl = environment.equipmentCatUrl; 

    this.http
      .get<Device[]>(apiUrl) // <-- Expecting an array of Device objects
      .pipe(
        finalize(() => {
          this.isLoading = false;
          this.cd.markForCheck();
        }),
        takeUntil(this.destroy$)
      )
      .subscribe({
        next: (allDevices) => {
          // === NEW: Aggregate the data here ===
          const statsMap = new Map<string, number>();
          for (const device of allDevices) {
            // Use the TrangThai_Ten field from the Device model
            const statusName = device.TrangThai_Ten || 'Không xác định';
            statsMap.set(statusName, (statsMap.get(statusName) || 0) + 1);
          }
          
          // Convert map to the array format the chart needs
          const aggregatedData: DeviceStatsData[] = [];
          statsMap.forEach((soLuong, tenTrangThai) => {
            aggregatedData.push({ TenTrangThai: tenTrangThai, SoLuong: soLuong });
          });
          // =====================================

          if (this.isChartInitialized && this.chartInstance) {
            this.renderChart(aggregatedData); // <-- Pass aggregated data
          } else {
            this.pendingChartData = aggregatedData; // <-- Pass aggregated data
          }
        },
        error: (error) => {
          console.error('Error loading all device data:', error);
          this.toastService.showError('Không thể tải dữ liệu thống kê thiết bị.');
          this.chartInstance?.clear();
        },
      });
  }

  private renderChart(data: DeviceStatsData[]): void {
    if (!this.chartInstance || !this.echartsInstance) return;
    
    const option = this.buildOption(data);
    
    this.ngZone.runOutsideAngular(() => {
      requestAnimationFrame(() => {
        this.chartInstance?.setOption(option, {
          notMerge: true,
          lazyUpdate: true,
        });
      });
    });
  }

  private buildOption(data: DeviceStatsData[]): EChartsOption {
    const chartData = data.map(item => ({
      value: item.SoLuong,
      name: item.TenTrangThai,
    }));
    const totalDevices = data.reduce((sum, item) => sum + item.SoLuong, 0);

    return {
      backgroundColor: this.cssVars.white,
      textStyle: {
        fontFamily: GLOBAL_FONT_FAMILY,
        fontSize: 12,
        color: this.cssVars.gray700,
      },
      color: this.chartColors,
      title: {
        text: 'Thống Kê Thiết Bị',
        subtext: 'Theo Trạng Thái',
        left: 'center',
        textStyle: {
          color: this.cssVars.gray800,
          fontWeight: 'bold',
          fontSize: 18,
        },
        subtextStyle: {
          color: this.cssVars.gray700,
          fontSize: 14,
        },
      },
      tooltip: {
        trigger: 'item',
        formatter: '{a} <br/>{b}: {c} ({d}%)',
        textStyle: {
          fontFamily: GLOBAL_FONT_FAMILY,
        }
      },
      legend: {
        orient: 'vertical',
        left: 'left',
        top: '15%',
        itemWidth: 14,
        itemHeight: 14,
        textStyle: {
          fontSize: 11,
        },
      },
      series: [
        {
          name: 'Trạng Thái',
          type: 'pie',
          radius: ['45%', '70%'], // Make it a donut chart
          center: ['50%', '60%'],
          avoidLabelOverlap: true,
          itemStyle: {
            borderRadius: 8,
            borderColor: this.cssVars.white,
            borderWidth: 2,
          },
          label: {
            show: true,
            position: 'outside',
            formatter: '{b}: {d}%', // Show name and percentage
            fontSize: 11,
            color: this.cssVars.gray700,
          },
          emphasis: {
            label: {
              show: true,
              fontSize: 14,
              fontWeight: 'bold',
            },
          },
          labelLine: {
            show: true,
            length: 8,
            length2: 12,
          },
          data: chartData,
        },
        // This series is for the total count in the middle
        {
          type: 'pie',
          radius: ['0%', '35%'],
          center: ['50%', '60%'],
          silent: true,
          animation: false,
          data: [{ value: 1, name: '' }],
          label: {
            show: true,
            position: 'center',
            formatter: () => {
              return `{total|${totalDevices}}\n{label|Tổng Thiết Bị}`;
            },
            rich: {
              total: {
                fontSize: 28,
                fontWeight: 'bold',
                color: this.cssVars.gray800,
                padding: [5, 0]
              },
              label: {
                fontSize: 12,
                color: this.cssVars.gray700
              }
            }
          },
          itemStyle: {
            color: 'rgba(0,0,0,0.02)' // Almost transparent fill
          }
        }
      ],
    };
  }
}