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
  
  // Resize handling variables
  private resizeObserver?: ResizeObserver;
  private windowResizeListener?: () => void;
  private resizeTimer?: ReturnType<typeof setTimeout>;
  private readonly RESIZE_DEBOUNCE_MS = 200;

  constructor() {
    // Effect: Update chart data
    effect(() => {
      const options = this.chartOptions();
      if (this.chartInstance && options) {
        this.updateChart(options);
      }
    });

    // Effect: Handle Theme changes or Init
    effect(() => {
      this.effectiveTheme();
      const options = untracked(() => this.chartOptions());
      
      if (this.chartInstance) {
        this.disposeChart();
        this.initChart(options);
      }
    });

    this.destroyRef.onDestroy(() => this.cleanup());
  }

  ngAfterViewInit(): void {
    if (this.isBrowser) {
      if (this.chartOptions()) {
        this.initChart(this.chartOptions());
      }
      this.setupResizeStrategy();
    }
  }

  private initChart(options: EChartsCoreOption | null): void {
    if (!this.isBrowser || !this.chartContainerRef() || !options) return;

    const el = this.chartContainerRef().nativeElement;

    // Ensure container has dimensions before init to avoid "Can't get DOM width or height"
    if (el.clientWidth === 0 || el.clientHeight === 0) {
      // Retry once after a short delay if dimensions are 0 (likely inside a hidden tab or animation)
      setTimeout(() => {
        if (this.chartContainerRef()?.nativeElement && !this.chartInstance) {
           this.initChart(options);
        }
      }, 100);
      return;
    }

    this.ngZone.runOutsideAngular(() => {
      this.chartInstance = echarts.init(el, this.effectiveTheme(), {
        renderer: 'canvas',
        useDirtyRect: true 
      });

      this.chartInstance.setOption(options);

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
        lazyUpdate: true
      });
      // Force resize on data update to ensure fit
      this.performResize(); 
    });
  }

  /**
   * Robust resize strategy:
   * 1. Tries ResizeObserver (Modern browsers)
   * 2. Falls back to window 'resize' event (Older browsers)
   */
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
    
    this.resizeTimer = setTimeout(() => {
      this.performResize();
    }, this.RESIZE_DEBOUNCE_MS);
  }

  private performResize(): void {
    if (!this.isBrowser) return;

    // Handle initialization if chart options exist but instance doesn't (e.g., tab switch)
    if (!this.chartInstance && this.chartOptions()) {
      this.initChart(this.chartOptions());
      return;
    }

    if (this.chartInstance) {
      const el = this.chartContainerRef()?.nativeElement;
      
      // CRITICAL: Only resize if container is visible and has dimensions
      if (el && el.clientWidth > 0 && el.clientHeight > 0) {
        this.ngZone.runOutsideAngular(() => {
          this.chartInstance?.resize({
            width: 'auto',
            height: 'auto',
            animation: { duration: 300 } 
          });
        });
      }
    }
  }

  private disposeChart(): void {
    if (this.chartInstance) {
      this.chartInstance.dispose();
      this.chartInstance = undefined;
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