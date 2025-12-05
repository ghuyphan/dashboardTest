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
import { ThemeService } from '../../../core/services/theme.service';
import { NumberUtils } from '../../utils/number.utils';

export type ChartSkeletonType = 'bar' | 'horizontal-bar' | 'line' | 'area' | 'pie' | 'doughnut' | 'scatter';

@Component({
  selector: 'app-chart-card',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './chart-card.component.html',
  styleUrls: ['./chart-card.component.scss'],
  encapsulation: ViewEncapsulation.Emulated,
  changeDetection: ChangeDetectionStrategy.OnPush,
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

  // Threshold 1: Enable Data Zoom (e.g., > 35 points - monthly view)
  private readonly LARGE_DATA_THRESHOLD = 35;

  // Threshold 2: Hide Labels (e.g., > 100 points - quarterly/yearly view)
  private readonly VERY_LARGE_DATA_THRESHOLD = 100;

  private lastWidth = 0;
  private lastHeight = 0;
  private isDestroyed = false;

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
        // [OPTIMIZATION] Lazy load ECharts only when needed
        setTimeout(() => this.initChart(options), 0);
      }
    });

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

  private async initChart(options: EChartsCoreOption | null): Promise<void> {
    if (this.isDestroyed || !this.isBrowser || !this.chartContainerRef() || !options) return;
    if (this.chartInstance) return;

    const el = this.chartContainerRef().nativeElement;

    if (el.clientWidth === 0 || el.clientHeight === 0) {
      return;
    }

    // [OPTIMIZATION] Dynamic Import
    const [
      echarts,
      { BarChart, LineChart, PieChart, ScatterChart },
      { TitleComponent, TooltipComponent, GridComponent, LegendComponent, DataZoomComponent, TimelineComponent },
      { CanvasRenderer }
    ] = await Promise.all([
      import('echarts/core'),
      import('echarts/charts'),
      import('echarts/components'),
      import('echarts/renderers')
    ]);

    echarts.use([
      BarChart, LineChart, PieChart, ScatterChart,
      TitleComponent, TooltipComponent, GridComponent, LegendComponent, DataZoomComponent,
      TimelineComponent,
      CanvasRenderer
    ]);

    this.ngZone.runOutsideAngular(() => {
      this.chartInstance = echarts.init(el, this.effectiveTheme(), {
        renderer: 'canvas',
        useDirtyRect: false
      });

      this.lastWidth = el.clientWidth;
      this.lastHeight = el.clientHeight;

      this.applyAutoFormatting(options);
      let responsiveOptions = this.makeOptionsResponsive(options);
      responsiveOptions = this.optimizeForLargeData(responsiveOptions);

      this.chartInstance?.setOption(responsiveOptions);

      this.chartInstance?.on('click', (params: any) => {
        this.ngZone.run(() => this.chartClick.emit(params));
      });

      this.chartInstance?.on('legendselectchanged', (params: any) => {
        this.ngZone.run(() => this.chartLegendSelectChanged.emit(params));
      });
    });
  }

  private updateChart(options: EChartsCoreOption): void {
    if (!this.chartInstance) return;

    this.ngZone.runOutsideAngular(() => {
      this.applyAutoFormatting(options);
      let responsiveOptions = this.makeOptionsResponsive(options);
      responsiveOptions = this.optimizeForLargeData(responsiveOptions);

      this.chartInstance?.setOption(responsiveOptions, {
        notMerge: false,
        lazyUpdate: true
      });
    });
  }

  /**
   * High-Performance Responsive Strategy
   * Wraps the standard options in ECharts' native media query structure.
   */
  private makeOptionsResponsive(options: any): any {
    if (options.baseOption || options.media) {
      return options;
    }

    const series = Array.isArray(options.series) ? options.series : [options.series];
    const hasPie = series.some((s: any) => s.type === 'pie');

    if (!hasPie) {
      return options;
    }

    return {
      baseOption: options,
      media: [
        {
          query: { maxWidth: 500 },
          option: {
            series: series.map((s: any) => {
              if (s.type === 'pie' && s.radius) {
                return {
                  radius: this.scaleRadius(s.radius, 0.8),
                  label: { fontSize: 10 }
                };
              }
              return {};
            })
          }
        }
      ]
    };
  }

  private scaleRadius(radius: any, factor: number): any {
    if (Array.isArray(radius)) {
      return radius.map(r => this.scaleSingleRadius(r, factor));
    }
    return this.scaleSingleRadius(radius, factor);
  }

  private scaleSingleRadius(val: string | number, factor: number): string | number {
    if (typeof val === 'number') {
      return Math.round(val * factor);
    }
    if (typeof val === 'string' && val.endsWith('%')) {
      const num = parseFloat(val);
      if (!isNaN(num)) {
        return `${num * factor}%`;
      }
    }
    return val;
  }

  private applyAutoFormatting(option: any): void {
    if (!option) return;

    const formatFn = (val: number) => NumberUtils.format(val);

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

    if (option.series) {
      const seriesList = Array.isArray(option.series) ? option.series : [option.series];
      seriesList.forEach((series: any) => {
        series.tooltip = series.tooltip || {};
        if (!series.tooltip.valueFormatter) {
          series.tooltip.valueFormatter = (val: any) => (typeof val === 'number' ? formatFn(val) : val);
        }

        if (series.label?.show && !series.label.formatter) {
          series.label.formatter = (params: any) => {
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

  private optimizeForLargeData(option: any): any {
    if (!option || !option.series) return option;

    // 1. Detect Data Length
    let dataLength = 0;
    if (option.xAxis && Array.isArray(option.xAxis.data)) {
      dataLength = option.xAxis.data.length;
    } else if (Array.isArray(option.series)) {
      dataLength = option.series[0]?.data?.length || 0;
    }

    // 2. If data is small, return original options
    if (dataLength <= this.LARGE_DATA_THRESHOLD) {
      return option;
    }

    // 3. Apply "Large Data" Modifications
    const newOption = { ...option };

    // A. Calculate Zoom Percentage (Smart Zooming)
    // - If data > 100 (Yearly): Show 100 points initially (Labels Hidden by step E)
    // - If data > 35 (Monthly): Show 35 points initially (Labels Visible)
    const targetItems = dataLength > this.VERY_LARGE_DATA_THRESHOLD
      ? this.VERY_LARGE_DATA_THRESHOLD
      : this.LARGE_DATA_THRESHOLD;

    const zoomStart = 100 - Math.floor((targetItems / dataLength) * 100);

    // B. Enable DataZoom Slider
    newOption.dataZoom = [
      {
        type: 'slider',
        show: true,
        xAxisIndex: [0],
        start: zoomStart,
        end: 100,
        bottom: 10,
        height: 20,
        handleSize: '100%',
        borderColor: 'transparent',
        fillerColor: 'rgba(0,0,0,0.1)'
      },
      {
        type: 'inside',
        xAxisIndex: [0],
        start: zoomStart,
        end: 100,
        zoomOnMouseWheel: false,
        moveOnMouseWheel: true
      }
    ];

    // C. Adjust Grid for Slider
    if (!newOption.grid) {
      newOption.grid = {};
    }
    if (newOption.grid.bottom === undefined ||
      (typeof newOption.grid.bottom === 'number' && newOption.grid.bottom < 45) ||
      (typeof newOption.grid.bottom === 'string' && parseFloat(newOption.grid.bottom) < 15)) {
      newOption.grid.bottom = 45;
    }

    // D. Optimize X-Axis
    if (newOption.xAxis) {
      const xAxes = Array.isArray(newOption.xAxis) ? newOption.xAxis : [newOption.xAxis];
      newOption.xAxis = xAxes.map((axis: any) => ({
        ...axis,
        axisLabel: {
          ...axis.axisLabel,
          interval: 'auto',
          hideOverlap: true,
          width: 100
        }
      }));
    }

    // E. Hide Series Labels ONLY for Very Large Data
    // If data > 100 points, force labels OFF to prevent visual noise.
    if (dataLength > this.VERY_LARGE_DATA_THRESHOLD) {
      if (newOption.series) {
        const seriesList = Array.isArray(newOption.series) ? newOption.series : [newOption.series];
        newOption.series = seriesList.map((s: any) => ({
          ...s,
          label: {
            ...(s.label || {}),
            show: false
          }
        }));
      }
    }

    return newOption;
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