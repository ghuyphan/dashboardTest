import {
  Component,
  ElementRef,
  AfterViewInit,
  ChangeDetectionStrategy,
  input,
  output,
  viewChild,
  computed,
  effect,
  inject,
  NgZone,
  DestroyRef,
  ViewEncapsulation,
  PLATFORM_ID,
  untracked, // [1] Import untracked
} from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';

// ECharts Types
import type { EChartsType, EChartsCoreOption } from 'echarts/core';
import type * as echarts from 'echarts/core';
import { ThemeService } from '../../core/services/theme.service';

export type ChartSkeletonType = 'bar' | 'line' | 'pie';

@Component({
  selector: 'app-chart-card',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './chart-card.component.html',
  styleUrls: ['./chart-card.component.scss'],
  encapsulation: ViewEncapsulation.Emulated,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChartCardComponent implements AfterViewInit {
  // ===================================
  // Dependencies
  // ===================================
  private readonly ngZone = inject(NgZone);
  private readonly destroyRef = inject(DestroyRef);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly themeService = inject(ThemeService);
  private readonly isBrowser = isPlatformBrowser(this.platformId);

  // ===================================
  // Inputs (Signals)
  // ===================================
  public title = input<string>('');
  public subtitle = input<string>('');
  public icon = input<string>('');
  public iconClass = input<string>('');
  public isLoading = input<boolean>(false);
  public emptyText = input<string>('Không có dữ liệu');
  public emptyIcon = input<string>('fas fa-chart-bar');
  public skeletonType = input<ChartSkeletonType>('bar');
  public chartOptions = input<EChartsCoreOption | null>(null);

  /**
   * Optional override. If not provided, uses ThemeService.isDarkTheme()
   * Accepts: 'dark' | 'light' | object (echarts theme) | null
   */
  public theme = input<string | object | null>(null);

  // ===================================
  // Outputs
  // ===================================
  public chartClick = output<any>();

  // ===================================
  // View Children
  // ===================================
  private chartContainerRef = viewChild.required<ElementRef<HTMLDivElement>>('chartContainer');

  // ===================================
  // Computed State
  // ===================================
  public showEmptyState = computed(() => !this.isLoading() && !this.chartOptions());
  public showChart = computed(() => !this.isLoading() && !!this.chartOptions());

  private effectiveTheme = computed(() => {
    const override = this.theme();
    if (override) return override;
    return this.themeService.isDarkTheme() ? 'dark' : 'light';
  });

  // ===================================
  // Internal State
  // ===================================
  private echartsInstance?: typeof echarts;
  private chartInstance?: EChartsType;
  private resizeObserver?: ResizeObserver;
  private intersectionObserver?: IntersectionObserver;

  private hasInitialized = false;
  private hasLoadedECharts = false;
  private resizeTimer?: ReturnType<typeof setTimeout>;
  private readonly RESIZE_DEBOUNCE_MS = 150;

  constructor() {
    // Effect 1: Update Data (Only runs when chartOptions changes)
    effect(() => {
      const options = this.chartOptions();
      if (this.hasLoadedECharts && this.chartInstance && options) {
        this.updateChart(options);
      }
    });

    // Effect 2: Handle Theme Changes (Re-init required)
    effect(() => {
      const activeTheme = this.effectiveTheme(); // Track computed theme

      // [2] CRITICAL FIX: Use untracked() so this effect DOES NOT run when chartOptions changes.
      // This prevents the chart from being disposed/recreated during data updates.
      const options = untracked(() => this.chartOptions());
      
      // Only proceed if already initialized
      if (this.hasLoadedECharts && this.hasInitialized) {
        this.disposeChart();
        this.createChartInstance(); // Uses effectiveTheme() internally
        if (options && this.chartInstance) {
          this.updateChart(options);
        }
      }
    });

    this.destroyRef.onDestroy(() => this.cleanup());
  }

  ngAfterViewInit(): void {
    if (this.isBrowser) {
      this.initializeIntersectionObserver();
    }
  }

  // ===================================
  // Initialization
  // ===================================

  private initializeIntersectionObserver(): void {
    if (typeof IntersectionObserver === 'undefined') {
      this.initializeChart();
      return;
    }

    this.intersectionObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && !this.hasInitialized) {
            this.hasInitialized = true;
            this.intersectionObserver?.disconnect();
            this.initializeChart();
          }
        });
      },
      { rootMargin: '50px', threshold: 0.1 }
    );

    this.intersectionObserver.observe(this.chartContainerRef().nativeElement);
  }

  private async initializeChart(): Promise<void> {
    try {
      await this.loadEChartsLibrary();
      this.createChartInstance();
      const options = this.chartOptions();
      if (options && this.chartInstance) {
        this.updateChart(options);
      }
      this.setupResizeObserver();
    } catch (error) {
      console.error('[ChartCardComponent] Failed to initialize chart:', error);
    }
  }

  // ===================================
  // ECharts Logic
  // ===================================

  private async loadEChartsLibrary(): Promise<void> {
    if (this.hasLoadedECharts) return;

    const [echartsCore, CanvasRenderer, charts, components] = await Promise.all([
      import('echarts/core'),
      import('echarts/renderers'),
      import('echarts/charts'),
      import('echarts/components'),
    ]);

    this.echartsInstance = echartsCore;
    this.echartsInstance.use([
      CanvasRenderer.CanvasRenderer,
      charts.BarChart,
      charts.LineChart,
      charts.PieChart,
      charts.ScatterChart,
      charts.RadarChart,
      charts.GaugeChart,
      components.TitleComponent,
      components.TooltipComponent,
      components.GridComponent,
      components.LegendComponent,
      components.DataZoomComponent,
      components.MarkLineComponent,
      components.MarkPointComponent,
    ]);

    this.hasLoadedECharts = true;
  }

  private createChartInstance(): void {
    if (!this.isBrowser || !this.echartsInstance) return;

    const el = this.chartContainerRef().nativeElement;
    if (el.clientWidth === 0 || el.clientHeight === 0) return;

    this.ngZone.runOutsideAngular(() => {
      if (this.chartInstance && !this.chartInstance.isDisposed()) this.chartInstance.dispose();

      this.chartInstance = this.echartsInstance!.init(el, this.effectiveTheme(), {
        renderer: 'canvas',
        useDirtyRect: true,
      });

      this.chartInstance.on('click', (params) => {
        this.ngZone.run(() => this.chartClick.emit(params));
      });
    });
  }

  private updateChart(options: EChartsCoreOption): void {
    if (!this.chartInstance || this.chartInstance.isDisposed()) return;

    this.ngZone.runOutsideAngular(() => {
      // notMerge: false ensures smooth transition (diffing) instead of full redraw
      this.chartInstance!.setOption(options, {
        notMerge: false,
        lazyUpdate: true,
        silent: false,
      });
    });
  }

  // ===================================
  // Resize Handling
  // ===================================

  private setupResizeObserver(): void {
    if (!this.isBrowser || this.resizeObserver) return;

    this.resizeObserver = new ResizeObserver(() => this.handleResize());
    this.resizeObserver.observe(this.chartContainerRef().nativeElement);
  }

  private handleResize(): void {
    if (this.resizeTimer) clearTimeout(this.resizeTimer);

    this.resizeTimer = setTimeout(() => {
      const el = this.chartContainerRef().nativeElement;
      if (!this.chartInstance && el.clientWidth > 0 && el.clientHeight > 0) {
        this.createChartInstance();
        const options = this.chartOptions();
        if (options && this.chartInstance) {
          this.updateChart(options);
        }
      } else if (this.chartInstance) {
        this.resizeChart();
      }
    }, this.RESIZE_DEBOUNCE_MS);
  }

  private resizeChart(): void {
    if (!this.chartInstance) return;
    this.ngZone.runOutsideAngular(() => {
      requestAnimationFrame(() => {
        if (this.chartInstance && !this.chartInstance.isDisposed()) {
          this.chartInstance.resize({
            animation: { duration: 300, easing: 'cubicOut' },
          });
        }
      });
    });
  }

  // ===================================
  // Cleanup
  // ===================================

  private disposeChart(): void {
    if (this.chartInstance) {
      this.ngZone.runOutsideAngular(() => {
        if (!this.chartInstance?.isDisposed()) {
          this.chartInstance?.off('click');
          this.chartInstance?.dispose();
        }
      });
      this.chartInstance = undefined;
    }
  }

  private cleanup(): void {
    if (this.resizeTimer) clearTimeout(this.resizeTimer);
    this.resizeObserver?.disconnect();
    this.intersectionObserver?.disconnect();
    this.disposeChart();
  }
}