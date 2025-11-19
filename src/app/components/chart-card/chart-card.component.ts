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
} from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';

// ECharts Types
import type { EChartsType, EChartsCoreOption } from 'echarts/core';
import type * as echarts from 'echarts/core';

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
  private readonly isBrowser = isPlatformBrowser(this.platformId);

  // ===================================
  // Inputs (Signals)
  // ===================================
  public title = input<string>('');
  public subtitle = input<string>('');
  public icon = input<string>('');
  public iconClass = input<string>(''); // e.g. 'text-primary'
  public isLoading = input<boolean>(false);
  public emptyText = input<string>('No data available');
  public emptyIcon = input<string>('fas fa-chart-bar');
  
  // Theme input for dark mode support (e.g., 'dark', 'light', or object)
  public theme = input<string | object | null>(null); 
  
  public chartOptions = input<EChartsCoreOption | null>(null);

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
    // Reactively update chart when options change
    effect(() => {
      const options = this.chartOptions();
      if (this.hasLoadedECharts && this.chartInstance && options) {
        this.updateChart(options);
      }
    });

    // Reactively handle Theme changes (requires dispose & re-init)
    effect(() => {
      const currentTheme = this.theme(); // Track dependency
      if (this.chartInstance && this.hasLoadedECharts) {
        // We must dispose and recreate to change the ECharts theme
        this.disposeChart();
        this.createChartInstance();
        const options = this.chartOptions();
        if (options) this.updateChart(options);
      }
    });

    this.destroyRef.onDestroy(() => this.cleanup());
  }

  ngAfterViewInit(): void {
    // SSR Guard: Don't run intersection observer on server
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
      // Basic Charts
      charts.BarChart,
      charts.LineChart,
      charts.PieChart,
      // Extended Charts (Added for flexibility)
      charts.ScatterChart,
      charts.RadarChart,
      charts.GaugeChart,
      // Components
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
      // Safety: Dispose if exists
      if (this.chartInstance) this.chartInstance.dispose();

      this.chartInstance = this.echartsInstance!.init(el, this.theme(), {
        renderer: 'canvas',
        useDirtyRect: true,
      });

      this.chartInstance.on('click', (params) => {
        this.ngZone.run(() => this.chartClick.emit(params));
      });
    });
  }

  private updateChart(options: EChartsCoreOption): void {
    if (!this.chartInstance) return;

    this.ngZone.runOutsideAngular(() => {
      this.chartInstance!.setOption(options, {
        notMerge: true, // OPTIMIZATION: Prevents "ghost data" by resetting state
        lazyUpdate: true, // Optimizes rendering performance
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
        // Lazy Creation: Dimensions are finally available
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
          this.chartInstance?.off('click'); // Remove listeners
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