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
  // [FIX] Remove the native 'title' attribute from the host element to prevent the browser tooltip
  host: {
    '[attr.title]': 'null'
  }
})
export class ChartCardComponent implements AfterViewInit {
  private readonly ngZone = inject(NgZone);
  private readonly destroyRef = inject(DestroyRef);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly themeService = inject(ThemeService);
  private readonly isBrowser = isPlatformBrowser(this.platformId);

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

  public chartClick = output<any>();
  public chartLegendSelectChanged = output<any>();

  private chartContainerRef = viewChild.required<ElementRef<HTMLDivElement>>('chartContainer');

  public showEmptyState = computed(() => !this.isLoading() && !this.chartOptions());
  public showChart = computed(() => !!this.chartOptions());

  private effectiveTheme = computed(() => {
    return this.theme() || (this.themeService.isDarkTheme() ? 'dark' : 'light');
  });

  private chartInstance?: EChartsType;
  
  private resizeObserver?: ResizeObserver;
  private windowResizeListener?: () => void;
  private resizeTimer?: ReturnType<typeof setTimeout>;
  private readonly RESIZE_DEBOUNCE_MS = 200;
  
  private lastWidth = 0;
  private lastHeight = 0;
  private isDestroyed = false;

  // [NEW] Reusable formatter for Vietnamese numbers (1.000)
  private readonly vnNumberFormatter = new Intl.NumberFormat('vi-VN');

  constructor() {
    this.destroyRef.onDestroy(() => {
      this.isDestroyed = true;
      this.cleanup();
    });

    effect(() => {
      const options = this.chartOptions();
      if (this.chartInstance && options) {
        this.updateChart(options);
      } else if (options && this.isBrowser) {
        setTimeout(() => this.initChart(options), 0);
      }
    });

    // Re-init chart if theme changes
    effect(() => {
      this.effectiveTheme(); 
      const options = untracked(() => this.chartOptions());
      
      if (this.chartInstance && options) {
        this.disposeChart();
        setTimeout(() => this.initChart(options), 0);
      }
    });
  }

  ngAfterViewInit(): void {
    if (this.isBrowser) {
      this.setupResizeStrategy();

      if (this.chartOptions()) {
        this.initChart(this.chartOptions());
      }
    }
  }

  private initChart(options: EChartsCoreOption | null): void {
    if (this.isDestroyed || !this.isBrowser || !this.chartContainerRef() || !options) return;
    if (this.chartInstance) return; 

    const el = this.chartContainerRef().nativeElement;

    if (el.clientWidth === 0 || el.clientHeight === 0) {
      return;
    }

    this.ngZone.runOutsideAngular(() => {
      this.chartInstance = echarts.init(el, this.effectiveTheme(), {
        renderer: 'canvas',
        useDirtyRect: false 
      });

      this.lastWidth = el.clientWidth;
      this.lastHeight = el.clientHeight;

      // [NEW] Apply formatting middleware
      this.applyAutoFormatting(options);
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
      // [NEW] Apply formatting middleware
      this.applyAutoFormatting(options);
      
      this.chartInstance?.setOption(options, {
        notMerge: false,
        lazyUpdate: true 
      });
    });
  }

  /**
   * [NEW] Middleware to inject Vietnamese number formatting into
   * Axis Labels, Tooltips, and Series Labels if they are not manually defined.
   */
  private applyAutoFormatting(option: any): void {
    if (!option) return;

    const formatFn = (val: number) => this.vnNumberFormatter.format(val);

    // 1. Y-Axis: Format numbers like 1.000
    if (option.yAxis) {
      const yAxes = Array.isArray(option.yAxis) ? option.yAxis : [option.yAxis];
      yAxes.forEach((axis: any) => {
        if (axis.type === 'value') {
          axis.axisLabel = axis.axisLabel || {};
          if (!axis.axisLabel.formatter) {
            axis.axisLabel.formatter = formatFn;
          }
        }
      });
    }

    // 2. Series: Format Tooltips and Labels
    if (option.series) {
      const seriesList = Array.isArray(option.series) ? option.series : [option.series];
      seriesList.forEach((series: any) => {
         // Tooltip Value Formatter (ECharts 5.3+)
         // This puts "1.000" in the tooltip list automatically
         series.tooltip = series.tooltip || {};
         if (!series.tooltip.valueFormatter) {
            series.tooltip.valueFormatter = (val: any) => (typeof val === 'number' ? formatFn(val) : val);
         }

         // Label Formatter (Text on bars/lines)
         if (series.label?.show && !series.label.formatter) {
             series.label.formatter = (params: any) => {
                 // Handle simple values and array values [x, y]
                 const val = Array.isArray(params.value) ? params.value[1] : params.value;
                 return typeof val === 'number' ? formatFn(val) : val;
             };
         }
      });
    }
  }

  private setupResizeStrategy(): void {
    const el = this.chartContainerRef().nativeElement;

    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => {
        this.triggerResize();
      });
      this.resizeObserver.observe(el);
    } 
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
    if (!this.isBrowser || this.isDestroyed) return;

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

    if (currentWidth === this.lastWidth && currentHeight === this.lastHeight) {
      return;
    }

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