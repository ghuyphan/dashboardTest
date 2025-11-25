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
  untracked,
} from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';

// ECharts Types
import type { EChartsType, EChartsCoreOption } from 'echarts/core';
import * as echarts from 'echarts/core';
import { BarChart, LineChart, PieChart, ScatterChart } from 'echarts/charts';
import {
  TitleComponent,
  TooltipComponent,
  GridComponent,
  LegendComponent,
  DataZoomComponent,
} from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import { ThemeService } from '../../core/services/theme.service';

echarts.use([
  BarChart, LineChart, PieChart, ScatterChart,
  TitleComponent, TooltipComponent, GridComponent, LegendComponent, DataZoomComponent,
  CanvasRenderer
]);

export type ChartSkeletonType = 'bar' | 'horizontal-bar' | 'line' | 'area' | 'pie' | 'doughnut' | 'scatter';

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
  private readonly ngZone = inject(NgZone);
  private readonly destroyRef = inject(DestroyRef);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly themeService = inject(ThemeService);
  private readonly isBrowser = isPlatformBrowser(this.platformId);

  // --- INPUTS ---
  public title = input<string>('');
  public subtitle = input<string>('');
  public icon = input<string>('');
  public iconClass = input<string>('');
  
  public isLoading = input<boolean>(false);
  public chartOptions = input<EChartsCoreOption | null>(null);
  
  public emptyText = input<string>('Không có dữ liệu');
  public emptyIcon = input<string>('fas fa-chart-bar');
  public skeletonType = input<ChartSkeletonType>('bar');

  public theme = input<string | object | null>(null);

  // --- OUTPUTS ---
  public chartClick = output<any>();
  public chartLegendSelectChanged = output<any>();

  // --- VIEW CHILD ---
  private chartContainerRef = viewChild.required<ElementRef<HTMLDivElement>>('chartContainer');

  // --- COMPUTED ---
  public showEmptyState = computed(() => !this.isLoading() && !this.chartOptions());
  public showChart = computed(() => !!this.chartOptions());

  private effectiveTheme = computed(() => {
    return this.theme() || (this.themeService.isDarkTheme() ? 'dark' : 'light');
  });

  private chartInstance?: EChartsType;
  
  // Optimization variables
  private resizeObserver?: ResizeObserver;
  private windowResizeListener?: () => void;
  private resizeTimer?: ReturnType<typeof setTimeout>;
  private readonly RESIZE_DEBOUNCE_MS = 200;
  
  // [OPTIMIZATION] Cache last known dimensions to prevent redundant resize calls
  private lastWidth = 0;
  private lastHeight = 0;

  constructor() {
    // Effect: Update chart data when options change
    effect(() => {
      const options = this.chartOptions();
      if (this.chartInstance && options) {
        this.updateChart(options);
      } else if (options && this.isBrowser) {
        // Attempt to init if not already done (and we are in browser)
        // We use setTimeout to ensure the view is ready
        setTimeout(() => this.initChart(options), 0);
      }
    });

    // Effect: Handle Theme changes
    effect(() => {
      this.effectiveTheme(); // Dependency
      const options = untracked(() => this.chartOptions());
      
      if (this.chartInstance && options) {
        this.disposeChart();
        // Small delay to ensure DOM styles (colors) update before re-init
        setTimeout(() => this.initChart(options), 0);
      }
    });

    this.destroyRef.onDestroy(() => this.cleanup());
  }

  ngAfterViewInit(): void {
    if (this.isBrowser) {
      // Setup resize listener immediately so we catch the first layout paint
      this.setupResizeStrategy();

      // Attempt init if data exists
      if (this.chartOptions()) {
        this.initChart(this.chartOptions());
      }
    }
  }

  private initChart(options: EChartsCoreOption | null): void {
    if (!this.isBrowser || !this.chartContainerRef() || !options) return;
    if (this.chartInstance) return; // Already initialized

    const el = this.chartContainerRef().nativeElement;

    // [OPTIMIZATION] Strict dimension check
    // If dimensions are 0, we CANNOT init ECharts yet. 
    // We rely on the ResizeObserver (setup in ngAfterViewInit) to call performResize() later.
    if (el.clientWidth === 0 || el.clientHeight === 0) {
      return;
    }

    this.ngZone.runOutsideAngular(() => {
      // Initialize
      this.chartInstance = echarts.init(el, this.effectiveTheme(), {
        renderer: 'canvas',
        useDirtyRect: false 
      });

      // Cache initial dimensions
      this.lastWidth = el.clientWidth;
      this.lastHeight = el.clientHeight;

      this.chartInstance.setOption(options);

      // Bind events
      this.chartInstance.on('click', (params) => {
        this.ngZone.run(() => this.chartClick.emit(params));
      });

      this.chartInstance.on('legendselectchanged', (params) => {
        this.ngZone.run(() => this.chartLegendSelectChanged.emit(params));
      });
    });
  }

  private updateChart(options: EChartsCoreOption): void {
    if (!this.chartInstance) return;
    
    this.ngZone.runOutsideAngular(() => {
      this.chartInstance?.setOption(options, {
        notMerge: false,
        lazyUpdate: true // Let ECharts throttle updates internally
      });
    });
  }

  private setupResizeStrategy(): void {
    const el = this.chartContainerRef().nativeElement;

    // 1. Modern Approach: ResizeObserver
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => {
        this.triggerResize();
      });
      this.resizeObserver.observe(el);
    } 
    // 2. Fallback Approach: Window Resize
    else {
      this.ngZone.runOutsideAngular(() => {
        this.windowResizeListener = () => this.triggerResize();
        window.addEventListener('resize', this.windowResizeListener);
      });
    }
  }

  private triggerResize(): void {
    if (this.resizeTimer) clearTimeout(this.resizeTimer);
    
    this.ngZone.runOutsideAngular(() => {
      this.resizeTimer = setTimeout(() => {
        this.performResize();
      }, this.RESIZE_DEBOUNCE_MS);
    });
  }

  private performResize(): void {
    if (!this.isBrowser) return;

    // [FIX] If chart was defer-loaded or had 0 size initially, 
    // this is where we finally initialize it now that we have dimensions.
    if (!this.chartInstance) {
      if (this.chartOptions()) {
        this.initChart(this.chartOptions());
      }
      return;
    }

    const el = this.chartContainerRef()?.nativeElement;
    if (!el) return;

    const currentWidth = el.clientWidth;
    const currentHeight = el.clientHeight;

    // [OPTIMIZATION] Filter out phantom resize events
    // Only resize if dimensions actually changed
    if (currentWidth === this.lastWidth && currentHeight === this.lastHeight) {
      return;
    }

    // Only resize if container is visible
    if (currentWidth > 0 && currentHeight > 0) {
      this.lastWidth = currentWidth;
      this.lastHeight = currentHeight;

      this.ngZone.runOutsideAngular(() => {
        this.chartInstance?.resize({
          width: 'auto',
          height: 'auto',
          animation: { duration: 300 } 
        });
      });
    }
  }

  private disposeChart(): void {
    if (this.chartInstance) {
      this.chartInstance.dispose();
      this.chartInstance = undefined;
      this.lastWidth = 0;
      this.lastHeight = 0;
    }
  }

  private cleanup(): void {
    if (this.resizeTimer) clearTimeout(this.resizeTimer);
    
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = undefined;
    }

    if (this.windowResizeListener) {
      window.removeEventListener('resize', this.windowResizeListener);
      this.windowResizeListener = undefined;
    }

    this.disposeChart();
  }
}