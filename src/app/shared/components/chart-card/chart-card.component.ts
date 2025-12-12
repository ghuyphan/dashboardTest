// [file name]: ghuyphan/dashboardtest/dashboardTest-b072c46ca3f3caf2752f70d6fb29b9fb407de393/src/app/shared/components/chart-card/chart-card.component.ts
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
  signal,
  Renderer2,
} from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { ActivatedRoute } from '@angular/router';

import type {
  EChartsType,
  EChartsCoreOption,
  ECElementEvent,
} from 'echarts/core';
import { ThemeService } from '../../../core/services/theme.service';
import { NumberUtils } from '../../utils/number.utils';
import { HasPermissionDirective } from '../../directives/has-permission.directive';
import { TooltipDirective } from '../../directives/tooltip.directive';

export type ChartSkeletonType =
  | 'bar'
  | 'horizontal-bar'
  | 'line'
  | 'area'
  | 'pie'
  | 'doughnut'
  | 'scatter';

@Component({
  selector: 'app-chart-card',
  standalone: true,
  imports: [CommonModule, HasPermissionDirective, TooltipDirective],
  templateUrl: './chart-card.component.html',
  styleUrls: ['./chart-card.component.scss'],
  encapsulation: ViewEncapsulation.Emulated,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[attr.title]': 'null',
  },
})
export class ChartCardComponent implements AfterViewInit {
  private readonly ngZone = inject(NgZone);
  private readonly destroyRef = inject(DestroyRef);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly themeService = inject(ThemeService);
  private readonly route = inject(ActivatedRoute);
  private readonly renderer = inject(Renderer2);
  private readonly isBrowser = isPlatformBrowser(this.platformId);

  // === INPUTS ===
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
  public legendSelectedMode = input<'multiple' | 'single'>('multiple');
  public isolateLegend = input<boolean>(true);

  // --- Export Inputs ---
  public enableExport = input<boolean>(false);
  public isExporting = input<boolean>(false);

  /**
   * [Optional] Manually specify the permission key for the export button.
   * If provided, this overrides the auto-detected route permission.
   */
  public exportPermission = input<string | undefined>(undefined);

  /**
   * Computes the final permission string required to see the Export button.
   * Priority:
   * 1. `exportPermission` input (Manual override).
   * 2. Auto-derived from the current Route's `data.permission` + `.REXPORT`.
   * 3. `undefined` (If no permission found, button is visible to all).
   */
  public fullExportPermission = computed(() => {
    // 1. Check for manual override input
    const manualOverride = this.exportPermission();
    if (manualOverride) {
      return manualOverride;
    }

    // 2. Traverse to find the deepest active route (where the data usually lives)
    let currentRoute = this.route.snapshot;
    while (currentRoute.firstChild) {
      currentRoute = currentRoute.firstChild;
    }

    // 3. Derive from Route Data
    const basePermission = currentRoute.data['permission'] as
      | string
      | undefined;
    if (basePermission) {
      return `${basePermission}.REXPORT`;
    }

    return undefined;
  });

  // === OUTPUTS ===
  public chartClick = output<any>();
  public chartLegendSelectChanged = output<any>();
  public zoomReset = output<void>();
  public exportClicked = output<void>();

  private chartContainerRef =
    viewChild.required<ElementRef<HTMLDivElement>>('chartContainer');
  private indicatorDisplayRef =
    viewChild<ElementRef<HTMLSpanElement>>('indicatorDisplay');

  // === COMPUTED STATE ===
  public showEmptyState = computed(
    () => !this.isLoading() && !this.chartOptions() && !this.chartError()
  );
  public showChart = computed(
    () => !!this.chartOptions() && !this.chartError()
  );
  public showErrorState = computed(() => !!this.chartError());

  private effectiveTheme = computed(() => {
    return this.theme() || (this.themeService.isDarkTheme() ? 'dark' : 'light');
  });

  // === INTERNAL STATE ===
  private chartInstance?: EChartsType;
  private resizeObserver?: ResizeObserver;
  private windowResizeListener?: () => void;
  private orientationListener?: () => void;
  private resizeTimer?: ReturnType<typeof setTimeout>;
  private globalClickListener?: () => void; // Listener for outside clicks

  // Logic for smart isolation
  private currentSoloName: string | null = null;
  private isProgrammaticLegendChange = false;

  // Mobile detection signals (reactive)
  private isMobile = signal(false);
  private isTablet = signal(false);

  // Public computed for template bindings
  public isMobileView = computed(() => this.isMobile());
  public isTabletView = computed(() => this.isTablet());
  public isCompactView = computed(() => this.isMobile() || this.isCompact);

  // Data info for UI display
  public hasLargeData = signal(false);
  public totalDataPoints = signal(0);
  public visibleDataPoints = signal(0);
  public chartError = signal<string | null>(null);

  // Indicator animation state
  private displayedVisiblePoints = 0;
  private indicatorAnimationId?: number;

  // Mobile tooltip auto-dismiss
  private tooltipDismissTimer?: ReturnType<typeof setTimeout>;
  private readonly TOOLTIP_AUTO_DISMISS_MS = 4000; // Auto-hide after 4 seconds
  private lastTapPoint: number[] = [0, 0]; // Track tap position for positioning

  // === CONFIGURATION ===
  private readonly RESIZE_DEBOUNCE_MS = 100; // Reduced for snappier response
  private readonly MOBILE_BREAKPOINT = 480;
  private readonly TABLET_BREAKPOINT = 768;

  // Data thresholds
  private readonly LARGE_DATA_THRESHOLD = 35;
  private readonly VERY_LARGE_DATA_THRESHOLD = 100;
  private readonly EXTREME_DATA_THRESHOLD = 500;

  // Layout thresholds
  private readonly COMPACT_BREAKPOINT = 768;

  private lastWidth = 0;
  private lastHeight = 0;
  private isDestroyed = false;
  private isInitializing = false; // Track if init is in progress to prevent race condition
  private isCompact = false; // Tracks if container is in compact mode

  constructor() {
    this.destroyRef.onDestroy(() => {
      this.isDestroyed = true;
      this.cleanup();
    });

    // Initialize mobile detection
    if (this.isBrowser) {
      this.updateDeviceType();
    }

    effect(() => {
      const options = this.chartOptions();
      if (this.chartInstance && options) {
        this.updateChart(options);
      } else if (options && this.isBrowser) {
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

  // === PUBLIC METHODS ===

  /**
   * Toggle between zoomed-in view and full view.
   * - If currently zoomed in: save state and zoom all the way out (with spread labels)
   * - If currently zoomed out (showing all): restore previous zoom state (with auto labels)
   */
  public toggleZoom(): void {
    if (!this.chartInstance) return;

    const option = this.chartInstance.getOption() as any;
    const dataZoom = option?.dataZoom?.[0];
    if (!dataZoom) return;

    const currentStart = dataZoom.start ?? 0;
    const currentEnd = dataZoom.end ?? 100;
    const isFullView = currentStart === 0 && currentEnd === 100;
    const totalPoints = this.totalDataPoints();

    this.ngZone.runOutsideAngular(() => {
      if (isFullView && this.savedZoomState) {
        // Restore previous zoom state with auto interval
        this.chartInstance?.dispatchAction({
          type: 'dataZoom',
          start: this.savedZoomState.start,
          end: this.savedZoomState.end,
        });

        // Restore auto interval for zoomed view
        this.updateAxisInterval('auto');
        this.isZoomedOut.set(false);
      } else {
        // Save current state and zoom all the way out
        if (!isFullView) {
          this.savedZoomState = { start: currentStart, end: currentEnd };
        }
        this.chartInstance?.dispatchAction({
          type: 'dataZoom',
          start: 0,
          end: 100,
        });

        // Spread out labels for full view of large data
        if (totalPoints > this.LARGE_DATA_THRESHOLD) {
          const interval = Math.ceil(totalPoints / 15); // Show ~15 labels max
          this.updateAxisInterval(interval);
        }
        this.isZoomedOut.set(true);
      }
    });

    this.zoomReset.emit();
  }

  /**
   * Update x-axis label interval
   */
  private updateAxisInterval(interval: number | 'auto'): void {
    if (!this.chartInstance) return;

    const option = this.chartInstance.getOption() as any;
    if (option.xAxis) {
      const xAxes = Array.isArray(option.xAxis) ? option.xAxis : [option.xAxis];
      const updatedXAxis = xAxes.map((axis: any) => ({
        ...axis,
        axisLabel: {
          ...axis.axisLabel,
          interval: interval,
        },
      }));

      this.chartInstance.setOption(
        { xAxis: updatedXAxis },
        { notMerge: false }
      );
    }
  }

  /**
   * Animate the indicator display with counting effect (similar to widget-card)
   */
  private animateIndicator(start: number, end: number, total: number): void {
    if (this.indicatorAnimationId)
      cancelAnimationFrame(this.indicatorAnimationId);

    const el = this.indicatorDisplayRef()?.nativeElement;
    if (!el) {
      // Fallback: just set text directly
      this.displayedVisiblePoints = end;
      return;
    }

    // Check for reduced motion preference
    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (start === end || prefersReducedMotion) {
      this.displayedVisiblePoints = end;
      el.textContent = `${end}/${total}`;
      return;
    }

    const duration = 200; // Quick 200ms animation
    const startTime = performance.now();

    this.ngZone.runOutsideAngular(() => {
      const step = (currentTime: number) => {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const easedProgress = 1 - Math.pow(1 - progress, 3); // Ease-out cubic

        const interpolated = Math.round(start + (end - start) * easedProgress);
        el.textContent = `${interpolated}/${total}`;

        if (progress < 1) {
          this.indicatorAnimationId = requestAnimationFrame(step);
        } else {
          this.displayedVisiblePoints = end;
          el.textContent = `${end}/${total}`;
          this.indicatorAnimationId = undefined;
        }
      };
      this.indicatorAnimationId = requestAnimationFrame(step);
    });
  }

  // State for zoom toggle
  private savedZoomState: { start: number; end: number } | null = null;
  public isZoomedOut = signal(true); // Track if showing full view

  /**
   * Handle export button click
   */
  public onExport(): void {
    this.exportClicked.emit();
  }

  /**
   * Export chart as image
   */
  public exportAsImage(filename = 'chart'): void {
    if (!this.chartInstance) return;

    const url = this.chartInstance.getDataURL({
      type: 'png',
      pixelRatio: 2,
      backgroundColor: '#fff',
    });

    const link = document.createElement('a');
    link.download = `${filename}.png`;
    link.href = url;
    link.click();
  }

  // === PRIVATE METHODS ===

  private updateDeviceType(): void {
    if (!this.isBrowser) return;
    const width = window.innerWidth;
    this.isMobile.set(width < this.MOBILE_BREAKPOINT);
    this.isTablet.set(
      width >= this.MOBILE_BREAKPOINT && width < this.TABLET_BREAKPOINT
    );
  }

  private async initChart(options: EChartsCoreOption | null): Promise<void> {
    if (
      this.isDestroyed ||
      !this.isBrowser ||
      !this.chartContainerRef() ||
      !options
    )
      return;
    if (this.chartInstance || this.isInitializing) return;

    this.isInitializing = true;

    const el = this.chartContainerRef().nativeElement;

    if (el.clientWidth === 0 || el.clientHeight === 0) {
      return;
    }

    // Clear any previous error
    this.chartError.set(null);

    try {
      // Dynamic Import for tree-shaking
      const [
        echarts,
        { BarChart, LineChart, PieChart, ScatterChart },
        {
          TitleComponent,
          TooltipComponent,
          GridComponent,
          LegendComponent,
          DataZoomComponent,
          TimelineComponent,
        },
        { CanvasRenderer },
      ] = await Promise.all([
        import('echarts/core'),
        import('echarts/charts'),
        import('echarts/components'),
        import('echarts/renderers'),
      ]);

      echarts.use([
        BarChart,
        LineChart,
        PieChart,
        ScatterChart,
        TitleComponent,
        TooltipComponent,
        GridComponent,
        LegendComponent,
        DataZoomComponent,
        TimelineComponent,
        CanvasRenderer,
      ]);

      this.ngZone.runOutsideAngular(() => {
        const rendererConfig = this.getRendererConfig();

        this.chartInstance = echarts.init(
          el,
          this.effectiveTheme(),
          rendererConfig
        );

        this.lastWidth = el.clientWidth;
        this.lastHeight = el.clientHeight;

        // Apply all optimizations
        let processedOptions = this.applyAutoFormatting({ ...options });

        // 1. Enforce strict layout (Legend Top-Center, Grid spacing)
        processedOptions = this.applyStrictLayout(processedOptions);

        // 2. Apply mobile specific tweaks if needed (overrides strict layout small details)
        processedOptions = this.applyMobileOptimizations(processedOptions);

        // 3. Large data optimizations
        processedOptions = this.optimizeForLargeData(processedOptions);

        // 4. Responsive media queries
        processedOptions = this.makeOptionsResponsive(processedOptions);

        this.chartInstance?.setOption(processedOptions);

        // Setup event handlers
        this.setupEventHandlers();
      });
    } catch (error) {
      console.error('[ChartCard] Failed to initialize chart:', error);
      this.ngZone.run(() => {
        this.chartError.set('Không thể tải biểu đồ');
      });
    } finally {
      this.isInitializing = false;
    }
  }

  private updateChart(options: EChartsCoreOption): void {
    if (!this.chartInstance) return;

    this.ngZone.runOutsideAngular(() => {
      let processedOptions = this.applyAutoFormatting({ ...options });

      // 1. Enforce strict layout
      processedOptions = this.applyStrictLayout(processedOptions);

      // 2. Mobile optimizations
      processedOptions = this.applyMobileOptimizations(processedOptions);

      // 3. Large data
      processedOptions = this.optimizeForLargeData(processedOptions);

      // 4. Responsive
      processedOptions = this.makeOptionsResponsive(processedOptions);

      this.chartInstance?.setOption(processedOptions, {
        notMerge: false,
        lazyUpdate: true,
      });
    });
  }

  private setupEventHandlers(): void {
    if (!this.chartInstance) return;

    // Click handler
    this.chartInstance.on('click', (params: unknown) => {
      this.ngZone.run(() => this.chartClick.emit(params as ECElementEvent));
    });

    // Legend selection handler
    this.chartInstance.on('legendselectchanged', (params: any) => {
      // Smart Isolation Logic
      if (this.isolateLegend() && this.chartInstance) {
        if (this.isProgrammaticLegendChange) {
          // If this event was triggered by our own logic, ignore it but reset flag if needed
          // Actually, ECharts emits event synchronously usually, but we should be careful.
          return;
        }

        const name = params.name;
        // Check current state before this change?
        // We know what happened: User clicked `name`. ECharts toggled it.
        // If we are in 'isolate' mode:

        this.isProgrammaticLegendChange = true;

        try {
          if (this.currentSoloName === name) {
            // Was already solo on this. Toggle back to ALL.
            this.chartInstance.dispatchAction({
              type: 'legendAllSelect',
            });
            this.currentSoloName = null;
          } else {
            // Was not solo on this (could be All On, or Solo on something else).
            // Isolate this one.

            // OPTIMIZATION: Use batch commands to avoid looping through all series
            // 1. Select All (Reset state)
            this.chartInstance.dispatchAction({
              type: 'legendAllSelect',
            });

            // 2. Inverse (Turns All ON -> All OFF)
            this.chartInstance.dispatchAction({
              type: 'legendInverseSelect',
            });

            // 3. Select Target (Turns Target OFF -> Target ON)
            this.chartInstance.dispatchAction({
              type: 'legendSelect',
              name: name,
            });

            this.currentSoloName = name;
          }

          // Emit the NEW state so parent components (like BedUsage) render correctly
          // We need to construct the selected map manually or fetch it
          const newSelected: Record<string, boolean> = {};
          const option = this.chartInstance.getOption() as any;
          if (option.series) {
            option.series.forEach((s: any) => {
              newSelected[s.name] =
                this.currentSoloName === null
                  ? true
                  : s.name === this.currentSoloName;
            });
          }

          this.ngZone.run(() =>
            this.chartLegendSelectChanged.emit({
              name: name,
              selected: newSelected,
              type: 'legendselectchanged',
            })
          );

          return; // Stop processing to avoid double emit with stale data
        } finally {
          // Reset flag after all dispatches
          this.isProgrammaticLegendChange = false;
        }
      }

      this.ngZone.run(() =>
        this.chartLegendSelectChanged.emit(params as ECElementEvent)
      );
    });

    // DataZoom handler - update visible points indicator
    this.chartInstance.on('datazoom', (params: unknown) => {
      // DataZoom event params are not exactly ECElementEvent, so we cast to a custom shape or keep generic access safely
      const p = params as {
        start?: number;
        end?: number;
        batch?: Array<{ start: number; end: number }>;
      };
      const total = this.totalDataPoints();
      if (total > 0) {
        const start = p.start ?? p.batch?.[0]?.start ?? 0;
        const end = p.end ?? p.batch?.[0]?.end ?? 100;
        const visible = Math.round(((end - start) / 100) * total);

        // Only animate if value actually changed
        if (visible !== this.visibleDataPoints()) {
          this.visibleDataPoints.set(visible);
          this.animateIndicator(this.displayedVisiblePoints, visible, total);
        }
      }
    });

    // Touch-specific: close tooltip on outside tap (mobile)
    if (this.isMobile()) {
      // 1. Internal blank space tap
      this.chartInstance.getZr().on('click', (params: unknown) => {
        const p = params as { target?: unknown };
        if (!p.target) {
          this.chartInstance?.dispatchAction({ type: 'hideTip' });
        }
      });

      // 2. External tap (outside chart container)
      this.setupOutsideTapListener();
    }
  }

  /**
   * Set up global listener to dismiss tooltip when tapping outside
   */
  private setupOutsideTapListener(): void {
    if (this.globalClickListener) return;

    this.ngZone.runOutsideAngular(() => {
      this.globalClickListener = this.renderer.listen(
        'document',
        'click',
        (event: Event) => {
          if (!this.chartInstance || !this.isMobile()) return;

          const chartEl = this.chartContainerRef()?.nativeElement;
          const target = event.target as Node;

          // If click is outside the chart container, dismiss tooltip
          if (chartEl && !chartEl.contains(target)) {
            this.chartInstance.dispatchAction({ type: 'hideTip' });
          }
        }
      );
    });
  }

  private removeOutsideTapListener(): void {
    if (this.globalClickListener) {
      this.globalClickListener();
      this.globalClickListener = undefined;
    }
  }

  private getRendererConfig(): {
    renderer: 'canvas' | 'svg';
    useDirtyRect: boolean;
  } {
    const isMobileDevice = this.isMobile() || this.isTablet();

    return {
      renderer: 'canvas', // Canvas is faster on mobile
      useDirtyRect: !isMobileDevice, // Disable on mobile for stability
    };
  }

  /**
   * Detect chart type from options
   */
  private detectChartType(
    option: EChartsCoreOption
  ): 'cartesian' | 'horizontal-bar' | 'pie' {
    const opt = option as any; // Cast for easier property access since EChartsCoreOption is strict
    if (!opt?.series) return 'cartesian';

    const series = Array.isArray(opt.series) ? opt.series : [opt.series];

    // Check for pie/doughnut
    if (series.some((s: any) => s?.type === 'pie')) {
      return 'pie';
    }

    // Check for horizontal bar (yAxis is category)
    const yAxis = Array.isArray(opt.yAxis) ? opt.yAxis[0] : opt.yAxis;
    if (
      yAxis?.type === 'category' &&
      series.some((s: any) => s?.type === 'bar')
    ) {
      return 'horizontal-bar';
    }

    return 'cartesian';
  }

  /**
   * Apply stric layout rules:
   * 1. Legend always Top-Center
   * 2. Grid top margin sufficient to avoid overlap
   */
  private applyStrictLayout(option: EChartsCoreOption): EChartsCoreOption {
    if (!option) return option;
    const newOption = { ...option } as any; // Working with a clone, cast to any for layout manipulation logic

    const chartType = this.detectChartType(option);
    const mobile = this.isMobile();
    const tablet = this.isTablet();

    // 1. Enforce Legend Position - different for pie vs other charts
    if (newOption.legend !== false) {
      if (chartType === 'pie') {
        const isCompact = mobile || this.isCompact;
        // PIE CHART: Vertical legend on the right side if space allows, otherwise bottom
        newOption.legend = {
          ...(newOption.legend || {}),
          type: 'scroll',
          orient: isCompact ? 'horizontal' : 'vertical',
          // Position: right side for desktop/wide, bottom for mobile/compact
          top: isCompact ? 'auto' : 'middle',
          bottom: isCompact ? 10 : undefined,
          left: isCompact ? 'center' : undefined,
          right: isCompact ? undefined : 20,
          itemGap: isCompact ? 10 : 14,
          padding: isCompact ? [5, 10] : [10, 0],
          selectedMode: this.legendSelectedMode(),
          textStyle: {
            ...(newOption.legend?.textStyle || {}),
            fontSize: mobile ? 10 : 12,
          },
          itemWidth: mobile ? 12 : 16,
          itemHeight: mobile ? 10 : 12,
          pageButtonPosition: 'end',
        };
      } else {
        // OTHER CHARTS: Horizontal legend at top (current behavior)
        newOption.legend = {
          ...(newOption.legend || {}),
          top: 0,
          bottom: undefined,
          left: 'center',
          right: undefined,
          orient: 'horizontal',
          type: 'scroll',
          pageButtonPosition: 'end',
          selectedMode: this.legendSelectedMode(),
          itemGap: mobile ? 12 : 20,
          padding: [5, 10],
          textStyle: {
            ...(newOption.legend?.textStyle || {}),
            fontSize: mobile ? 10 : 12,
          },
          itemWidth: mobile ? 14 : 20,
          itemHeight: mobile ? 10 : 14,
        };
      }
    }

    // 2. Enforce Grid Layout - optimized for space efficiency (non-pie charts only)
    const hasLegend = newOption.legend !== false;
    const baseTop = hasLegend ? (mobile ? 45 : tablet ? 38 : 35) : 10;

    if (chartType !== 'pie') {
      newOption.grid = {
        ...(newOption.grid || {}),
        top: baseTop,
        bottom: mobile ? 22 : 18,
        left: mobile ? 5 : 8,
        right: mobile ? 8 : 8,
        containLabel: true,
      };
    }

    // 3. Optimize axis labels for better layout
    if (chartType === 'cartesian' || chartType === 'horizontal-bar') {
      // X-Axis optimization
      if (newOption.xAxis) {
        const xAxes = Array.isArray(newOption.xAxis)
          ? newOption.xAxis
          : [newOption.xAxis];
        newOption.xAxis = xAxes.map((axis: any) => {
          if (axis.type === 'category') {
            return {
              ...axis,
              axisLabel: {
                ...axis.axisLabel,
                fontSize: mobile ? 9 : 11,
                rotate: mobile ? 30 : axis.axisLabel?.rotate || 0,
                hideOverlap: true,
                interval: 'auto',
                overflow: 'truncate',
                width: mobile ? 50 : 80,
                margin: mobile ? 8 : 10,
              },
              axisTick: {
                alignWithLabel: true,
                ...(axis.axisTick || {}),
              },
            };
          }
          return axis;
        });
      }

      // Y-Axis optimization
      if (newOption.yAxis) {
        const yAxes = Array.isArray(newOption.yAxis)
          ? newOption.yAxis
          : [newOption.yAxis];
        newOption.yAxis = yAxes.map((axis: any) => ({
          ...axis,
          axisLabel: {
            ...axis.axisLabel,
            fontSize: mobile ? 9 : 11,
            margin: mobile ? 6 : 8,
          },
        }));
      }
    }

    // 4. For Pie charts: position left with legend on right
    if (chartType === 'pie' && newOption.series) {
      const isCompact = mobile || this.isCompact;
      const seriesList = Array.isArray(newOption.series)
        ? newOption.series
        : [newOption.series];
      newOption.series = seriesList.map((s: any) => {
        if (s.type === 'pie') {
          // Desktop/Wide: Pie on left (35%), leaving room for legend on right
          // Mobile/Compact: Pie centered at top, legend at bottom
          const baseCenter = isCompact ? ['50%', '45%'] : ['35%', '50%'];
          const defaultRadius: [string, string] = isCompact
            ? mobile
              ? ['25%', '50%']
              : ['35%', '60%']
            : ['35%', '60%'];

          let finalRadius = s.radius || defaultRadius;

          // Cap radius on mobile
          if (mobile && Array.isArray(finalRadius) && finalRadius.length >= 2) {
            const outerRadius = finalRadius[1];
            if (typeof outerRadius === 'string' && outerRadius.endsWith('%')) {
              const outerVal = parseFloat(outerRadius);
              if (outerVal > 50) {
                const innerRadius = finalRadius[0];
                const innerVal =
                  typeof innerRadius === 'string' && innerRadius.endsWith('%')
                    ? parseFloat(innerRadius)
                    : 25;
                const scaleFactor = 50 / outerVal;
                finalRadius = [`${Math.round(innerVal * scaleFactor)}%`, '50%'];
              }
            }
          }

          return {
            ...s,
            center: s.center || baseCenter,
            radius: finalRadius,
            label: {
              ...s.label,
              fontSize: mobile ? 10 : 12,
            },
          };
        }
        return s;
      });
    }

    return newOption;
  }

  /**
   * Apply mobile-specific optimizations
   */
  private applyMobileOptimizations(
    option: EChartsCoreOption
  ): EChartsCoreOption {
    if (!option) return option;

    const mobile = this.isMobile();
    const tablet = this.isTablet();

    if (!mobile && !tablet) return option;

    const newOption = { ...option } as any;

    // Calculate adaptive max-width based on viewport
    const viewportWidth =
      typeof window !== 'undefined' ? window.innerWidth : 375;
    const maxTooltipWidth = Math.min(viewportWidth - 24, 320); // 12px margin each side, max 320px

    // 1. Optimize tooltip for touch - smart positioning and contained
    newOption.tooltip = {
      ...newOption.tooltip,
      trigger: newOption.tooltip?.trigger || 'axis',
      confine: true,
      enterable: mobile,
      triggerOn: mobile ? 'click' : 'mousemove|click',
      position: mobile ? this.getMobileTooltipPosition.bind(this) : undefined,
      textStyle: {
        ...newOption.tooltip?.textStyle,
        fontSize: mobile ? 11 : 12,
        lineHeight: mobile ? 16 : 18,
      },
      extraCssText: mobile
        ? `max-width: ${maxTooltipWidth}px; white-space: normal; padding: 10px 12px; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.15);`
        : '',
      // Append dismiss hint for mobile tooltips
      appendToBody: false,
    };

    // 2. Legend already handled in applyStrictLayout, just ensure consistency
    // Skip redundant legend tweaks as applyStrictLayout handles it

    // 3. Additional mobile-only axis tweaks (rotation handled in applyStrictLayout)
    // This method now focuses on touch/interaction optimizations only

    return newOption;
  }

  /**
   * Smart mobile tooltip positioning:
   * - Positions tooltip above or below the tap point based on available space
   * - Horizontally centers the tooltip or aligns it to avoid edge clipping
   * - Avoids obscuring the data point being viewed
   */
  private getMobileTooltipPosition(
    point: number[],
    _params: unknown,
    _dom: HTMLElement,
    _rect: unknown,
    size: { contentSize: number[]; viewSize: number[] }
  ): number[] {
    const [contentWidth, contentHeight] = size.contentSize;
    const [viewWidth, viewHeight] = size.viewSize;
    const [tapX, tapY] = point;

    // Store tap point for potential use
    this.lastTapPoint = point;

    // Start auto-dismiss timer for mobile
    this.startTooltipDismissTimer();

    const margin = 8; // Margin from edges and tap point
    const fingerOffset = 40; // Offset to avoid finger obstruction

    // Horizontal positioning: try to center on tap point, but keep within bounds
    let x = tapX - contentWidth / 2;
    x = Math.max(margin, Math.min(viewWidth - contentWidth - margin, x));

    // Vertical positioning: prefer below the tap point, but flip to above if not enough space
    const spaceBelow = viewHeight - tapY - fingerOffset;
    const spaceAbove = tapY - fingerOffset;

    let y: number;
    if (spaceBelow >= contentHeight + margin) {
      // Enough space below - position below tap point
      y = tapY + fingerOffset;
    } else if (spaceAbove >= contentHeight + margin) {
      // Not enough below, but enough above - position above tap point
      y = tapY - contentHeight - fingerOffset;
    } else {
      // Not enough space either way - position at top with margin
      y = margin;
    }

    // Ensure tooltip stays within vertical bounds
    y = Math.max(margin, Math.min(viewHeight - contentHeight - margin, y));

    return [x, y];
  }

  /**
   * Start or restart the tooltip auto-dismiss timer
   */
  private startTooltipDismissTimer(): void {
    // Clear any existing timer
    if (this.tooltipDismissTimer) {
      clearTimeout(this.tooltipDismissTimer);
    }

    // Set new timer to auto-hide tooltip
    this.tooltipDismissTimer = setTimeout(() => {
      if (this.chartInstance && !this.isDestroyed) {
        this.chartInstance.dispatchAction({ type: 'hideTip' });
      }
    }, this.TOOLTIP_AUTO_DISMISS_MS);
  }

  /**
   * Clear the tooltip dismiss timer (called on cleanup)
   */
  private clearTooltipDismissTimer(): void {
    if (this.tooltipDismissTimer) {
      clearTimeout(this.tooltipDismissTimer);
      this.tooltipDismissTimer = undefined;
    }
  }

  /**
   * Make options responsive using ECharts media query system
   */
  private makeOptionsResponsive(options: EChartsCoreOption): EChartsCoreOption {
    const opt = options as any;
    if (opt.baseOption || opt.media) {
      return options; // Avoid nesting if already formatted
    }

    return options; // Rely on our strict layout + resize logic instead of complex media queries for now to ensure consistency
  }

  private scaleRadius(radius: any, factor: number): any {
    if (Array.isArray(radius)) {
      return radius.map(r => this.scaleSingleRadius(r, factor));
    }
    return this.scaleSingleRadius(radius, factor);
  }

  private scaleSingleRadius(
    val: string | number,
    factor: number
  ): string | number {
    if (typeof val === 'number') {
      return Math.round(val * factor);
    }
    if (typeof val === 'string' && val.endsWith('%')) {
      const num = parseFloat(val);
      if (!isNaN(num)) {
        return `${Math.round(num * factor)}%`;
      }
    }
    return val;
  }

  private applyAutoFormatting(option: EChartsCoreOption): EChartsCoreOption {
    if (!option) return option;

    const opt = option as any;
    const formatFn = (val: number) => NumberUtils.format(val);

    // Detect if this is a pie chart
    const isPieChart = this.detectChartType(option) === 'pie';

    // For pie charts, apply a consistent tooltip formatter at the top level
    if (isPieChart) {
      opt.tooltip = opt.tooltip || {};
      // Only apply if no custom formatter is already set
      if (!opt.tooltip.formatter) {
        opt.tooltip.formatter = (params: any) => {
          // Handle both single item and array (for series with multiple data points)
          const item = Array.isArray(params) ? params[0] : params;
          if (!item) return '';

          // params.marker gives us the colored circle/marker
          const marker = item.marker || '';
          const name = item.name || '';
          const value =
            typeof item.value === 'number' ? formatFn(item.value) : item.value;
          const percent =
            item.percent !== undefined ? item.percent.toFixed(1) : '0';

          return `${marker} ${name}: <b>${value}</b> (${percent}%)`;
        };
      }
    }

    if (opt.yAxis) {
      const yAxes = Array.isArray(opt.yAxis) ? opt.yAxis : [opt.yAxis];
      yAxes.forEach((axis: any) => {
        if (axis.type === 'value') {
          axis.axisLabel = axis.axisLabel || {};
          if (!axis.axisLabel.formatter) {
            axis.axisLabel.formatter = formatFn;
          }
        }
      });
    }

    if (opt.series) {
      const seriesList = Array.isArray(opt.series) ? opt.series : [opt.series];
      seriesList.forEach((series: any) => {
        if (!series) return;

        // For non-pie charts, apply valueFormatter as before
        if (!isPieChart) {
          series.tooltip = series.tooltip || {};
          if (!series.tooltip.valueFormatter) {
            series.tooltip.valueFormatter = (val: any) =>
              typeof val === 'number' ? formatFn(val) : val;
          }
        }

        if (series.label?.show && !series.label.formatter) {
          series.label.formatter = (params: any) => {
            const val = Array.isArray(params.value)
              ? params.value[1]
              : params.value;
            return typeof val === 'number' ? formatFn(val) : val;
          };
        }
      });
    }

    return option;
  }

  private optimizeForLargeData(option: EChartsCoreOption): EChartsCoreOption {
    if (!option) return option;
    const opt = option as any; // Cast for internal access

    if (!opt.series) return option;

    // 1. Detect data length
    let dataLength = 0;
    if (opt.xAxis && Array.isArray(opt.xAxis.data)) {
      dataLength = opt.xAxis.data.length;
    } else if (Array.isArray(opt.xAxis)) {
      dataLength = opt.xAxis[0]?.data?.length || 0;
    } else if (Array.isArray(opt.series)) {
      dataLength = opt.series[0]?.data?.length || 0;
    }

    // Update signals for UI
    this.totalDataPoints.set(dataLength);
    this.hasLargeData.set(dataLength > this.LARGE_DATA_THRESHOLD);

    // 2. If data is small, return original
    if (dataLength <= this.LARGE_DATA_THRESHOLD) {
      this.visibleDataPoints.set(dataLength);
      return option;
    }

    // 3. Apply large data modifications
    const newOption = { ...option } as any;
    const mobile = this.isMobile();
    const tablet = this.isTablet();

    // Calculate zoom percentage
    const targetItems =
      dataLength > this.VERY_LARGE_DATA_THRESHOLD
        ? this.VERY_LARGE_DATA_THRESHOLD
        : this.LARGE_DATA_THRESHOLD;

    const zoomEnd = 100;
    const zoomStart = Math.max(
      0,
      100 - Math.floor((targetItems / dataLength) * 100)
    );

    const initialVisible = Math.round(
      ((zoomEnd - zoomStart) / 100) * dataLength
    );
    this.visibleDataPoints.set(initialVisible);
    this.displayedVisiblePoints = initialVisible;

    // Initialize display text after a tick (element may not be ready yet)
    setTimeout(() => {
      const el = this.indicatorDisplayRef()?.nativeElement;
      if (el) el.textContent = `${initialVisible}/${dataLength}`;
    }, 0);

    // A. DataZoom configuration
    const zoomConfig = [
      {
        type: 'slider',
        show: true,
        xAxisIndex: [0],
        start: zoomStart,
        end: zoomEnd,
        bottom: mobile ? 25 : 10,
        height: mobile ? 24 : 20,
        handleSize: mobile ? '120%' : '100%',
        handleStyle: {
          borderRadius: 4,
        },
        borderColor: 'transparent',
        fillerColor: 'rgba(0,0,0,0.1)',
        brushSelect: !mobile, // Disable brush on mobile
        emphasis: {
          handleStyle: {
            borderWidth: 2,
          },
        },
      },
      {
        type: 'inside',
        xAxisIndex: [0],
        start: zoomStart,
        end: zoomEnd,
        zoomOnMouseWheel: true,
        moveOnMouseWheel: true,
        moveOnMouseMove: false,
        preventDefaultMouseMove: mobile,
        zoomLock: mobile, // Prevent pinch conflicts on mobile
      },
    ];

    (newOption as any).dataZoom = zoomConfig;

    // B. Grid adjustment to make room for dataZoom
    if ((newOption as any).grid) {
      // safer access
      const grid = (newOption as any).grid;
      (newOption as any).grid = {
        ...grid,
        bottom: mobile ? 60 : 40, // More space at bottom
      };
    } else {
      (newOption as any).grid = {
        bottom: mobile ? 60 : 40,
      };
    }

    // C. X-Axis specific tweaks for large data (if cartesian)
    if ((newOption as any).xAxis) {
      const xAxes = Array.isArray((newOption as any).xAxis)
        ? (newOption as any).xAxis
        : [(newOption as any).xAxis];
      (newOption as any).xAxis = xAxes.map((axis: any) => ({
        ...axis,
        axisLabel: {
          ...axis.axisLabel,
          interval: 'auto', // Force auto-hide to prevent overlap
          hideOverlap: true,
        },
      }));
    }

    // D. Hide labels for very large data (original D)
    if (dataLength > this.VERY_LARGE_DATA_THRESHOLD) {
      const seriesList = Array.isArray((newOption as any).series)
        ? (newOption as any).series
        : [(newOption as any).series];
      newOption.series = seriesList.map((s: any) => ({
        ...s,
        label: { ...(s?.label || {}), show: false },
      }));
    }

    // D. Series optimization (downsampling if extremely large) (new D)
    if ((newOption as any).series && dataLength > 5000) {
      const seriesList = Array.isArray((newOption as any).series)
        ? (newOption as any).series
        : [(newOption as any).series];
      (newOption as any).series = seriesList.map((s: any) => ({
        ...s,
        sampling: 'lttb', // Largest-Triangle-Three-Buckets downsampling
        showSymbol: false, // Hide symbols for performance
        showAllSymbol: false,
      }));
    }

    // E. Extreme data optimizations (500+ points) (original E, modified)
    if (dataLength > this.EXTREME_DATA_THRESHOLD) {
      const seriesList = Array.isArray((newOption as any).series)
        ? (newOption as any).series
        : [(newOption as any).series];
      newOption.series = seriesList.map((s: any) => {
        if (s?.type === 'line' || s?.type === 'bar') {
          return {
            ...s,
            sampling: 'lttb', // Largest Triangle Three Buckets algorithm
            showSymbol: false,
            animation: false,
            progressive: 400,
            progressiveThreshold: 1000,
            large: true,
            largeThreshold: 500,
          };
        }
        return s;
      });

      // Disable animation globally
      newOption.animation = false;
    }

    return newOption;
  }

  private setupResizeStrategy(): void {
    const el = this.chartContainerRef().nativeElement;

    // Use ResizeObserver for container-level changes
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(entries => {
        // 1. Immediate Visual Update (Cheap Resize)
        // Scale the existing canvas to fit the new container size immediately.
        // This prevents white flashes and makes resizing feel instant/smooth.
        if (this.chartInstance && this.lastWidth > 0 && this.lastHeight > 0) {
          const entry = entries[0];
          // Use contentRect or client dimensions
          const newWidth = entry.contentRect.width;
          const newHeight = entry.contentRect.height;

          if (newWidth > 0 && newHeight > 0) {
            const scaleX = newWidth / this.lastWidth;
            const scaleY = newHeight / this.lastHeight;

            const dom = this.chartInstance.getDom();
            const wrapper = dom?.firstElementChild as HTMLElement; // The inner wrapper div created by ECharts
            if (wrapper) {
              wrapper.style.transformOrigin = '0 0';
              wrapper.style.transition = 'none'; // Ensure no CSS transition delays this
              wrapper.style.transform = `scale(${scaleX}, ${scaleY})`;
            }
          }
        }

        // 2. Debounce Actual Redraw
        this.triggerResize();
      });
      this.resizeObserver.observe(el);
    }

    // Window resize listener as fallback / ensuring global layout changes are caught
    this.ngZone.runOutsideAngular(() => {
      this.windowResizeListener = () => {
        // Window resize explicitly triggers logic too, though RO usually catches the side effects
        this.triggerResize();
      };
      window.addEventListener('resize', this.windowResizeListener, {
        passive: true,
      });
    });

    // Orientation change listener
    if (this.isBrowser && 'onorientationchange' in window) {
      this.ngZone.runOutsideAngular(() => {
        this.orientationListener = () => {
          this.updateDeviceType();
          // Orientation changes are abrupt, so we skip the scaling trick and just resize
          setTimeout(() => this.triggerResize(), 150);
        };
        window.addEventListener('orientationchange', this.orientationListener);
      });
    }
  }

  private triggerResize(): void {
    if (this.resizeTimer) clearTimeout(this.resizeTimer);

    // Debounce resize to prevent performance kill
    this.ngZone.runOutsideAngular(() => {
      this.resizeTimer = setTimeout(() => {
        // Run actual resize in RAF to sync with render cycle
        requestAnimationFrame(() => {
          this.updateDeviceType();
          this.performResize();
        });
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

    // Reset visual scaling before actual redraw
    const dom = this.chartInstance.getDom();
    const wrapper = dom?.firstElementChild as HTMLElement;
    if (wrapper) {
      wrapper.style.transform = '';
      wrapper.style.transformOrigin = '';
    }

    const currentWidth = el.clientWidth;
    const currentHeight = el.clientHeight;

    // Skip resize only if dimensions are exactly the same AND both are valid
    if (currentWidth === this.lastWidth && currentHeight === this.lastHeight) {
      return;
    }

    if (currentWidth > 0 && currentHeight > 0) {
      this.lastWidth = currentWidth;
      this.lastHeight = currentHeight;

      // Check for compact mode transition
      const newIsCompact = currentWidth < this.COMPACT_BREAKPOINT;

      if (this.isCompact !== newIsCompact) {
        // Layout mode changed - full update required (re-apply options with new layout)
        this.isCompact = newIsCompact;
        const options = this.chartOptions();
        if (options) {
          this.updateChart(options);
          // Still call resize after updateChart to ensure dimensions are correct
          this.ngZone.runOutsideAngular(() => {
            setTimeout(() => {
              this.chartInstance?.resize({
                width: 'auto',
                height: 'auto',
                animation: { duration: 0 },
              });
            }, 50);
          });
          return;
        }
      }

      // Normal resize (layout mode didn't change)
      this.ngZone.runOutsideAngular(() => {
        this.chartInstance?.resize({
          width: 'auto',
          height: 'auto',
          animation: { duration: 0 },
        });
      });
    }
  }

  private disposeChart(): void {
    this.clearTooltipDismissTimer();
    if (this.chartInstance) {
      this.chartInstance.dispose();
      this.chartInstance = undefined;
      this.lastWidth = 0;
      this.lastHeight = 0;
    }
  }

  private cleanup(): void {
    if (this.resizeTimer) clearTimeout(this.resizeTimer);
    if (this.indicatorAnimationId)
      cancelAnimationFrame(this.indicatorAnimationId);

    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = undefined;
    }

    if (this.windowResizeListener) {
      window.removeEventListener('resize', this.windowResizeListener);
      this.windowResizeListener = undefined;
    }

    if (this.orientationListener) {
      window.removeEventListener('orientationchange', this.orientationListener);
      this.orientationListener = undefined;
    }

    this.removeOutsideTapListener();
    this.disposeChart();
  }
}
