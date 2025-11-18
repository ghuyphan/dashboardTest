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
  ViewEncapsulation
} from '@angular/core';
import { CommonModule } from '@angular/common';

// Import ECharts Types (Types only, no heavy code)
import type { EChartsType, EChartsCoreOption } from 'echarts/core';
import type * as echarts from 'echarts/core';

@Component({
  selector: 'app-chart-card',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './chart-card.component.html',
  styleUrls: ['./chart-card.component.scss'],
  encapsulation: ViewEncapsulation.Emulated
})
export class ChartCardComponent implements AfterViewInit, OnDestroy, OnChanges {
  // --- UI Inputs ---
  @Input() title: string = '';
  @Input() subtitle: string = '';
  @Input() icon: string = '';
  @Input() iconClass: string = '';
  @Input() isLoading: boolean = false;

  // --- Chart Inputs ---
  @Input() chartOptions: EChartsCoreOption | null = null;
  
  // --- Outputs ---
  @Output() chartClick = new EventEmitter<any>();

  // --- Internal State ---
  @ViewChild('chartContainer') chartContainerRef!: ElementRef<HTMLDivElement>;
  
  private echartsInstance?: typeof echarts;
  private chartInstance?: EChartsType;
  private resizeObserver?: ResizeObserver;
  private intersectionObserver?: IntersectionObserver;
  private isInitialized = false;
  private isChartLoaded = false;
  
  private ngZone = inject(NgZone);

  ngAfterViewInit(): void {
    // Use IntersectionObserver to only initialize chart when it scrolls into view
    this.setupIntersectionObserver();
  }

  ngOnChanges(changes: SimpleChanges): void {
    // Update chart if options change and chart is already active
    if (changes['chartOptions'] && this.isChartLoaded && this.chartInstance) {
      this.updateChartOption();
    }
  }

  ngOnDestroy(): void {
    this.resizeObserver?.disconnect();
    this.intersectionObserver?.disconnect();
    if (this.chartInstance) {
      this.chartInstance.dispose();
    }
  }

  private setupIntersectionObserver(): void {
    if (typeof IntersectionObserver === 'undefined') {
      this.initChartWorkflow();
      return;
    }

    this.intersectionObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting && !this.isInitialized) {
          this.isInitialized = true;
          this.intersectionObserver?.disconnect();
          this.initChartWorkflow();
        }
      });
    });

    this.intersectionObserver.observe(this.chartContainerRef.nativeElement);
  }

  private async initChartWorkflow(): Promise<void> {
    // 1. Lazy Load ECharts Modules
    await this.lazyLoadECharts();
    
    // 2. Initialize Instance
    this.initChartInstance();
    
    // 3. Set Initial Options
    this.updateChartOption();
    
    // 4. Setup Auto-Resize
    this.setupResizeObserver();
  }

  private async lazyLoadECharts(): Promise<void> {
    try {
      // Parallel import of required modules
      const [
        echartsCore,
        CanvasRenderer,
        charts,
        components
      ] = await Promise.all([
        import('echarts/core'),
        import('echarts/renderers'),
        import('echarts/charts'),
        import('echarts/components')
      ]);

      this.echartsInstance = echartsCore;

      // Register the components we use across the app
      this.echartsInstance.use([
        CanvasRenderer.CanvasRenderer,
        charts.BarChart,
        charts.LineChart,
        charts.PieChart,
        components.TitleComponent,
        components.TooltipComponent,
        components.GridComponent,
        components.LegendComponent,
        components.DataZoomComponent
      ]);
      
      this.isChartLoaded = true;
    } catch (error) {
      console.error('Failed to lazy load ECharts', error);
    }
  }

  private initChartInstance(): void {
    if (!this.echartsInstance || !this.chartContainerRef) return;

    this.ngZone.runOutsideAngular(() => {
      this.chartInstance = this.echartsInstance!.init(
        this.chartContainerRef.nativeElement, 
        undefined, 
        { renderer: 'canvas', useDirtyRect: true }
      );

      // Forward click events to parent
      this.chartInstance.on('click', (params) => {
        this.ngZone.run(() => this.chartClick.emit(params));
      });
    });
  }

  private updateChartOption(): void {
    if (!this.chartInstance || !this.chartOptions) return;

    this.ngZone.runOutsideAngular(() => {
      this.chartInstance!.setOption(this.chartOptions!, {
        notMerge: false, // Allow merging for smoother updates
        lazyUpdate: true,
        silent: false
      });
    });
  }

  private setupResizeObserver(): void {
    if (!this.chartContainerRef) return;

    this.resizeObserver = new ResizeObserver(() => {
      this.ngZone.runOutsideAngular(() => {
        requestAnimationFrame(() => {
          this.chartInstance?.resize();
        });
      });
    });

    this.resizeObserver.observe(this.chartContainerRef.nativeElement);
  }
}