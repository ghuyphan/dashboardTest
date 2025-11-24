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

// [UPDATED] Expanded types for more realistic loading states
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

  // --- VIEW CHILD ---
  private chartContainerRef = viewChild.required<ElementRef<HTMLDivElement>>('chartContainer');

  // --- COMPUTED ---
  public showEmptyState = computed(() => !this.isLoading() && !this.chartOptions());
  
  public showChart = computed(() => !!this.chartOptions());

  private effectiveTheme = computed(() => {
    return this.theme() || (this.themeService.isDarkTheme() ? 'dark' : 'light');
  });

  private chartInstance?: EChartsType;
  private resizeObserver?: ResizeObserver;
  private resizeTimer?: ReturnType<typeof setTimeout>;
  private readonly RESIZE_DEBOUNCE_MS = 200;

  constructor() {
    effect(() => {
      const options = this.chartOptions();
      if (this.chartInstance && options) {
        this.updateChart(options);
      }
    });

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
      this.setupResizeObserver();
    }
  }

  private initChart(options: EChartsCoreOption | null): void {
    if (!this.isBrowser || !this.chartContainerRef() || !options) return;

    const el = this.chartContainerRef().nativeElement;

    this.ngZone.runOutsideAngular(() => {
      this.chartInstance = echarts.init(el, this.effectiveTheme(), {
        renderer: 'canvas',
        useDirtyRect: true 
      });

      this.chartInstance.setOption(options);

      this.chartInstance.on('click', (params) => {
        this.ngZone.run(() => this.chartClick.emit(params));
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
    });
  }

  private setupResizeObserver(): void {
    this.resizeObserver = new ResizeObserver(() => {
      if (this.resizeTimer) clearTimeout(this.resizeTimer);
      this.resizeTimer = setTimeout(() => {
        if (this.chartInstance) {
          this.ngZone.runOutsideAngular(() => this.chartInstance?.resize());
        } else if (this.chartOptions()) {
            this.initChart(this.chartOptions());
        }
      }, this.RESIZE_DEBOUNCE_MS);
    });
    
    this.resizeObserver.observe(this.chartContainerRef().nativeElement);
  }

  private disposeChart(): void {
    if (this.chartInstance) {
      this.chartInstance.dispose();
      this.chartInstance = undefined;
    }
  }

  private cleanup(): void {
    if (this.resizeTimer) clearTimeout(this.resizeTimer);
    this.resizeObserver?.disconnect();
    this.disposeChart();
  }
}