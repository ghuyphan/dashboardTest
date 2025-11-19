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
} from '@angular/core';
import { CommonModule } from '@angular/common';

// ECharts Types
import type { EChartsType, EChartsCoreOption } from 'echarts/core';
import type * as echarts from 'echarts/core';

/**
 * Chart Card Component
 *
 * A reusable card component for ECharts with:
 * - Lazy loading via IntersectionObserver
 * - Automatic resizing via ResizeObserver
 * - Signal-based inputs/outputs
 * - Optimized performance using NgZone
 * - Robust handling of 0-dimension containers (fixes "Can't get DOM width or height")
 */
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

  // Flags
  private hasInitialized = false;
  private hasLoadedECharts = false;

  private resizeTimer?: ReturnType<typeof setTimeout>;
  private readonly RESIZE_DEBOUNCE_MS = 150;

  constructor() {
    // Reactively update chart when options change
    effect(() => {
      const options = this.chartOptions();
      // Only update if chart exists. If it doesn't exist (e.g. 0 height),
      // the resize observer will handle creation later.
      if (this.hasLoadedECharts && this.chartInstance && options) {
        this.updateChart(options);
      }
    });

    // Register cleanup logic
    this.destroyRef.onDestroy(() => this.cleanup());
  }

  ngAfterViewInit(): void {
    this.initializeIntersectionObserver();
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
      
      // Attempt creation. If dimensions are 0, this will safely bail out
      // and wait for the ResizeObserver to trigger it later.
      this.createChartInstance();
      
      const options = this.chartOptions();
      if (options && this.chartInstance) {
        this.updateChart(options);
      }
      
      // Start observing size immediately, even if chart isn't created yet
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
      components.TitleComponent,
      components.TooltipComponent,
      components.GridComponent,
      components.LegendComponent,
      components.DataZoomComponent,
    ]);

    this.hasLoadedECharts = true;
  }

  private createChartInstance(): void {
    if (!this.echartsInstance) return;

    const el = this.chartContainerRef().nativeElement;
    
    // CRITICAL FIX: Do not init if container has no dimensions.
    // ECharts throws errors if width/height is 0.
    if (el.clientWidth === 0 || el.clientHeight === 0) {
      return;
    }

    this.ngZone.runOutsideAngular(() => {
      this.chartInstance = this.echartsInstance!.init(el, undefined, {
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
    // Observe the container even if chartInstance is null
    this.resizeObserver = new ResizeObserver(() => this.handleResize());
    this.resizeObserver.observe(this.chartContainerRef().nativeElement);
  }

  private handleResize(): void {
    if (this.resizeTimer) clearTimeout(this.resizeTimer);

    this.resizeTimer = setTimeout(() => {
      const el = this.chartContainerRef().nativeElement;

      // Scenario 1: Chart doesn't exist, but now we have dimensions -> Create it
      if (!this.chartInstance && el.clientWidth > 0 && el.clientHeight > 0) {
        this.createChartInstance();
        const options = this.chartOptions();
        if (options && this.chartInstance) {
          this.updateChart(options);
        }
      } 
      // Scenario 2: Chart exists -> Resize it
      else if (this.chartInstance) {
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

  private cleanup(): void {
    if (this.resizeTimer) clearTimeout(this.resizeTimer);
    this.resizeObserver?.disconnect();
    this.intersectionObserver?.disconnect();

    if (this.chartInstance) {
      this.ngZone.runOutsideAngular(() => {
        this.chartInstance?.dispose();
      });
      this.chartInstance = undefined;
    }
  }
}