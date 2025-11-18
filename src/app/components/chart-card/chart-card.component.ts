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
// Removed MatIconModule to use FontAwesome (<i> tags) for consistency

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
  
  // --- Empty State Configuration ---
  @Input() emptyText: string = 'Không có dữ liệu'; 
  @Input() emptyIcon: string = 'fas fa-chart-bar'; // Default FontAwesome icon

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
    this.setupIntersectionObserver();
  }

  ngOnChanges(changes: SimpleChanges): void {
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
    await this.lazyLoadECharts();
    this.initChartInstance();
    this.updateChartOption();
    this.setupResizeObserver();
  }

  private async lazyLoadECharts(): Promise<void> {
    try {
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

      this.chartInstance.on('click', (params) => {
        this.ngZone.run(() => this.chartClick.emit(params));
      });
    });
  }

  private updateChartOption(): void {
    if (!this.chartInstance) return;

    if (this.chartOptions) {
      this.ngZone.runOutsideAngular(() => {
        this.chartInstance!.setOption(this.chartOptions!, {
          notMerge: false, 
          lazyUpdate: true,
          silent: false
        });
      });
    } else {
        this.chartInstance.clear();
    }
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