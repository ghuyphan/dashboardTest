import {
  Component,
  Input,
  Output,
  EventEmitter,
  ElementRef,
  ViewChild,
  AfterViewInit,
  OnDestroy,
  OnChanges,
  SimpleChanges,
  NgZone,
  inject,
  ViewEncapsulation,
  ChangeDetectionStrategy,
} from '@angular/core';
import { CommonModule } from '@angular/common';

import type { EChartsType, EChartsCoreOption } from 'echarts/core';
import type * as echarts from 'echarts/core';

/**
 * Chart Card Component
 * 
 * A reusable card component that displays ECharts visualizations with:
 * - Lazy loading for optimal performance
 * - Intersection observer for viewport-based initialization
 * - Automatic resize handling
 * - Loading and empty states
 * - Click event emission
 * 
 * @example
 * <app-chart-card
 *   [title]="'Sales Overview'"
 *   [subtitle]="'Last 30 days'"
 *   [icon]="'fas fa-chart-line'"
 *   [chartOptions]="myChartOptions"
 *   [isLoading]="loading"
 *   (chartClick)="handleChartClick($event)">
 * </app-chart-card>
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
export class ChartCardComponent implements AfterViewInit, OnDestroy, OnChanges {
  // ===================================
  // UI Configuration Inputs
  // ===================================
  
  /** Card title displayed at the top */
  @Input() title: string = '';
  
  /** Optional subtitle displayed below the title */
  @Input() subtitle: string = '';
  
  /** FontAwesome icon class for the card header */
  @Input() icon: string = '';
  
  /** Additional CSS classes for the icon */
  @Input() iconClass: string = '';
  
  /** Shows loading spinner when true */
  @Input() isLoading: boolean = false;

  // ===================================
  // Empty State Configuration
  // ===================================
  
  /** Text displayed when no data is available */
  @Input() emptyText: string = 'Không có dữ liệu';
  
  /** FontAwesome icon shown in empty state */
  @Input() emptyIcon: string = 'fas fa-chart-bar';

  // ===================================
  // Chart Configuration
  // ===================================
  
  /** ECharts configuration object */
  @Input() chartOptions: EChartsCoreOption | null = null;

  // ===================================
  // Events
  // ===================================
  
  /** Emitted when chart elements are clicked */
  @Output() chartClick = new EventEmitter<any>();

  // ===================================
  // Internal State
  // ===================================
  
  @ViewChild('chartContainer') chartContainerRef!: ElementRef<HTMLDivElement>;

  /** ECharts library instance */
  private echartsInstance?: typeof echarts;
  
  /** Active chart instance */
  private chartInstance?: EChartsType;
  
  /** Observer for container resize events */
  private resizeObserver?: ResizeObserver;
  
  /** Observer for viewport intersection */
  private intersectionObserver?: IntersectionObserver;
  
  /** Tracks if intersection observer has triggered initialization */
  private hasInitialized = false;
  
  /** Tracks if ECharts library has been loaded */
  private hasLoadedECharts = false;

  /** Debounce timer for resize events */
  private resizeTimer?: ReturnType<typeof setTimeout>;

  /** Resize debounce delay in milliseconds */
  private readonly RESIZE_DEBOUNCE_MS = 150;

  private readonly ngZone = inject(NgZone);

  // ===================================
  // Lifecycle Hooks
  // ===================================

  ngAfterViewInit(): void {
    this.initializeIntersectionObserver();
  }

  ngOnChanges(changes: SimpleChanges): void {
    // Only update chart if options changed and chart is ready
    if (changes['chartOptions'] && this.hasLoadedECharts && this.chartInstance) {
      this.updateChart();
    }
  }

  ngOnDestroy(): void {
    this.cleanup();
  }

  // ===================================
  // Initialization
  // ===================================

  /**
   * Sets up intersection observer to lazy-load chart when visible
   * Falls back to immediate initialization if IntersectionObserver is unavailable
   */
  private initializeIntersectionObserver(): void {
    // Browser compatibility check
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
      { 
        rootMargin: '50px', // Start loading slightly before visible
        threshold: 0.1 
      }
    );

    this.intersectionObserver.observe(this.chartContainerRef.nativeElement);
  }

  /**
   * Main initialization workflow
   * Loads ECharts library, creates instance, and sets up observers
   */
  private async initializeChart(): Promise<void> {
    try {
      await this.loadEChartsLibrary();
      this.createChartInstance();
      this.updateChart();
      this.setupResizeObserver();
    } catch (error) {
      console.error('[ChartCardComponent] Failed to initialize chart:', error);
    }
  }

  // ===================================
  // ECharts Library Management
  // ===================================

  /**
   * Dynamically imports ECharts modules for optimal bundle size
   */
  private async loadEChartsLibrary(): Promise<void> {
    if (this.hasLoadedECharts) {
      return;
    }

    try {
      const [echartsCore, CanvasRenderer, charts, components] = await Promise.all([
        import('echarts/core'),
        import('echarts/renderers'),
        import('echarts/charts'),
        import('echarts/components'),
      ]);

      // Store the core instance
      this.echartsInstance = echartsCore;

      // Register necessary components
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
    } catch (error) {
      console.error('[ChartCardComponent] Failed to load ECharts library:', error);
      throw error;
    }
  }

  // ===================================
  // Chart Instance Management
  // ===================================

  /**
   * Creates a new ECharts instance and attaches event listeners
   */
  private createChartInstance(): void {
    if (!this.echartsInstance || !this.chartContainerRef) {
      return;
    }

    this.ngZone.runOutsideAngular(() => {
      // Initialize chart with optimizations
      this.chartInstance = this.echartsInstance!.init(
        this.chartContainerRef.nativeElement,
        undefined,
        {
          renderer: 'canvas',
          useDirtyRect: true, // Performance optimization
        }
      );

      // Register click event handler
      this.chartInstance.on('click', (params) => {
        this.ngZone.run(() => {
          this.chartClick.emit(params);
        });
      });
    });
  }

  /**
   * Updates the chart with new options or clears it if none provided
   */
  private updateChart(): void {
    if (!this.chartInstance) {
      return;
    }

    this.ngZone.runOutsideAngular(() => {
      if (this.chartOptions) {
        this.chartInstance!.setOption(this.chartOptions, {
          notMerge: false, // Merge with existing options
          lazyUpdate: true, // Defer visual update for performance
          silent: false, // Allow events to fire
        });
      } else {
        // Clear chart if no options provided
        this.chartInstance!.clear();
      }
    });
  }

  // ===================================
  // Resize Handling
  // ===================================

  /**
   * Sets up ResizeObserver to handle container size changes
   * Debounces resize events for better performance
   */
  private setupResizeObserver(): void {
    if (!this.chartContainerRef || !this.chartInstance) {
      return;
    }

    this.resizeObserver = new ResizeObserver(() => {
      this.handleResize();
    });

    this.resizeObserver.observe(this.chartContainerRef.nativeElement);
  }

  /**
   * Debounced resize handler to prevent excessive chart redraws
   */
  private handleResize(): void {
    // Clear existing timer
    if (this.resizeTimer) {
      clearTimeout(this.resizeTimer);
    }

    // Set new timer
    this.resizeTimer = setTimeout(() => {
      this.resizeChart();
    }, this.RESIZE_DEBOUNCE_MS);
  }

  /**
   * Resizes the chart instance to fit its container
   */
  private resizeChart(): void {
    if (!this.chartInstance) {
      return;
    }

    this.ngZone.runOutsideAngular(() => {
      requestAnimationFrame(() => {
        this.chartInstance?.resize({
          animation: {
            duration: 300,
            easing: 'cubicOut',
          },
        });
      });
    });
  }

  // ===================================
  // Cleanup
  // ===================================

  /**
   * Cleans up all observers, timers, and chart instances
   */
  private cleanup(): void {
    // Clear resize timer
    if (this.resizeTimer) {
      clearTimeout(this.resizeTimer);
      this.resizeTimer = undefined;
    }

    // Disconnect observers
    this.resizeObserver?.disconnect();
    this.intersectionObserver?.disconnect();

    // Dispose chart instance
    if (this.chartInstance) {
      this.ngZone.runOutsideAngular(() => {
        this.chartInstance?.dispose();
      });
      this.chartInstance = undefined;
    }

    // Clear references
    this.echartsInstance = undefined;
    this.resizeObserver = undefined;
    this.intersectionObserver = undefined;
  }

  // ===================================
  // Public API (for template)
  // ===================================

  /**
   * Checks if chart should display empty state
   */
  get showEmptyState(): boolean {
    return !this.isLoading && !this.chartOptions;
  }

  /**
   * Checks if chart should be displayed
   */
  get showChart(): boolean {
    return !this.isLoading && !!this.chartOptions;
  }
}