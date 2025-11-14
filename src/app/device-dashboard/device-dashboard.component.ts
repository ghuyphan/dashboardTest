// src/app/device-dashboard/device-dashboard.component.ts

import {
  Component,
  OnInit,
  OnDestroy,
  ElementRef,
  ViewChild,
  inject,
  AfterViewInit,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  NgZone,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { finalize, takeUntil } from 'rxjs/operators';
import { Subject, Subscription, fromEvent } from 'rxjs';
import { Router } from '@angular/router';

import type { EChartsType, EChartsCoreOption } from 'echarts/core';
import type * as echarts from 'echarts/core';
import { environment } from '../../environments/environment.development';

import { Device } from '../models/device.model';
import { ToastService } from '../services/toast.service';
import { WidgetCardComponent } from '../components/widget-card/widget-card.component';

import { BarChart, LineChart } from 'echarts/charts';
import { GridComponent, DataZoomComponent } from 'echarts/components';

const GLOBAL_FONT_FAMILY =
  'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

function getCssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

type EChartsOption = EChartsCoreOption;

// (Interfaces remain unchanged)
interface WidgetData {
  id: string; icon: string; title: string; value: string; caption: string; accentColor: string;
}
interface DeviceStatsData {
  TenTrangThai: string; SoLuong: number;
}
interface AggregatedData {
  name: string; value: number;
}
interface TemporalData {
  month: string; value: number;
}
interface ActionableDevice {
  Id: number; Ten: string; Ma: string; ViTri: string; TrangThai_Ten?: string | null; NgayHetHanBH?: string | null;
}
type FilterType = 'status' | 'category' | 'location';
interface ChartFilter {
  type: FilterType;
  name: string;
}


@Component({
  selector: 'app-device-dashboard',
  standalone: true,
  imports: [CommonModule, WidgetCardComponent],
  templateUrl: './device-dashboard.component.html',
  styleUrl: './device-dashboard.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DeviceDashboardComponent implements OnInit, OnDestroy, AfterViewInit {
  @ViewChild('chartContainerPie')
  chartContainerPie!: ElementRef<HTMLDivElement>;
  @ViewChild('chartContainerCategory')
  chartContainerCategory!: ElementRef<HTMLDivElement>;
  @ViewChild('chartContainerLocation')
  chartContainerLocation!: ElementRef<HTMLDivElement>;
  @ViewChild('chartContainerTrend')
  chartContainerTrend!: ElementRef<HTMLDivElement>;

  private http = inject(HttpClient);
  private cd = inject(ChangeDetectorRef);
  private ngZone = inject(NgZone);
  private toastService = inject(ToastService);
  private router = inject(Router);

  private echartsInstance?: typeof echarts;
  
  private chartInstancePie?: EChartsType;
  private chartInstanceCategory?: EChartsType;
  private chartInstanceLocation?: EChartsType;
  private chartInstanceTrend?: EChartsType;

  private resizeObserver?: ResizeObserver;
  private intersectionObserver?: IntersectionObserver;

  public isLoading: boolean = false;
  private isChartVisible: boolean = false;
  public isChartInitialized: boolean = false;
  private intersectionObserverInitialized = false;

  private allDevices: Device[] = [];
  public currentFilter: ChartFilter | null = null;

  public widgetData: WidgetData[] = [];
  public pieData: DeviceStatsData[] = [];
  public categoryData: AggregatedData[] = [];
  public locationData: AggregatedData[] = [];
  public trendData: TemporalData[] = [];
  public attentionDevices: ActionableDevice[] = [];
  public expiringDevices: ActionableDevice[] = [];
  
  private statusColorMap = new Map<string, string>();
  private cssVars = {
    gray200: '', gray700: '', gray800: '', white: '',
    colorSuccess: '', colorWarning: '', colorDanger: '',
    colorInfo: '', colorPurple: '', colorBlue: '',
    colorInUse: '', 
    colorBooked: '', 
    colorLoaned: '', 
    colorDefault: '', 
  };

  private destroy$ = new Subject<void>();
  private resizeSubject = new Subject<void>();
  private chartResizeSubscription!: Subscription;

  ngOnInit(): void {
    this.initColors();
    this.isLoading = true; 
    this.cd.markForCheck();
    Promise.resolve().then(() => this.loadData());
  }

  ngAfterViewInit(): void {
    this.setupResizeHandling();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.resizeObserver?.disconnect();
    this.intersectionObserver?.disconnect();
    this.chartInstancePie?.dispose();
    this.chartInstanceCategory?.dispose();
    this.chartInstanceLocation?.dispose();
    this.chartInstanceTrend?.dispose();
    this.chartResizeSubscription?.unsubscribe();
  }

  private setupResizeHandling(): void {
    this.chartResizeSubscription = this.resizeSubject.pipe(
      takeUntil(this.destroy$)
    ).subscribe(() => {
      this.ngZone.runOutsideAngular(() => {
        this.chartInstancePie?.resize();
        this.chartInstanceCategory?.resize();
        this.chartInstanceLocation?.resize();
        this.chartInstanceTrend?.resize();
      });
    });
  }

  private triggerResize(): void {
    this.resizeSubject.next();
  }

  private setupIntersectionObserver(): void {
    if (typeof IntersectionObserver === 'undefined') {
      this.initializeCharts();
      return;
    }
    
    if (!this.chartContainerPie || !this.chartContainerPie.nativeElement) {
      this.initializeCharts(); 
      return;
    }

    this.intersectionObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && !this.isChartVisible) {
            this.isChartVisible = true;
            this.intersectionObserver?.disconnect();
            this.initializeCharts();
          }
        });
      },
      { rootMargin: '100px', threshold: 0.01 }
    );
    this.intersectionObserver.observe(this.chartContainerPie.nativeElement);
  }

  private async initializeCharts(): Promise<void> {
    if (this.isChartInitialized) return;
    this.isChartInitialized = true;

    await this.lazyLoadECharts();
    
    this.chartInstancePie = this.initChart(this.chartContainerPie.nativeElement);
    this.chartInstanceCategory = this.initChart(this.chartContainerCategory.nativeElement);
    this.chartInstanceLocation = this.initChart(this.chartContainerLocation.nativeElement);
    this.chartInstanceTrend = this.initChart(this.chartContainerTrend.nativeElement);
    
    this.chartInstancePie?.on('click', (params) => {
      this.ngZone.run(() => this.onChartClick('status', params));
    });
    this.chartInstanceCategory?.on('click', (params) => {
      this.ngZone.run(() => this.onChartClick('category', params));
    });
    this.chartInstanceLocation?.on('click', (params) => {
      this.ngZone.run(() => this.onChartClick('location', params));
    });
    
    this.setupResizeListener();
    this.refilterAndRenderAll();
  }

  private async lazyLoadECharts(): Promise<void> {
    try {
      const [
        echartsCore, CanvasRenderer, PieChartModule, BarChartModule, LineChartModule,
        TitleComponent, TooltipComponent, LegendComponent, GridComponentModule, DataZoomComponentModule,
      ] = await Promise.all([
        import('echarts/core'), import('echarts/renderers'), import('echarts/charts'),
        import('echarts/charts'), import('echarts/charts'), import('echarts/components'),
        import('echarts/components'), import('echarts/components'), import('echarts/components'), 
        import('echarts/components'), 
      ]);
      this.echartsInstance = echartsCore;
      this.echartsInstance.use([
        CanvasRenderer.CanvasRenderer, PieChartModule.PieChart, BarChartModule.BarChart, LineChartModule.LineChart,
        TitleComponent.TitleComponent, TooltipComponent.TooltipComponent, LegendComponent.LegendComponent,
        GridComponentModule.GridComponent, DataZoomComponentModule.DataZoomComponent,
      ]);
    } catch (error) { console.error('Error lazy-loading ECharts', error); }
  }


  private initColors(): void {
    const c = getCssVar; 
    
    this.cssVars = {
      gray200: c('--gray-200'),
      gray700: c('--gray-700'),
      gray800: c('--gray-800'),
      white: c('--white'),
      colorSuccess: c('--color-success'),     // Sẵn sàng
      colorWarning: c('--color-warning'),    // Bảo trì / Sửa chữa
      colorDanger: c('--color-danger'),     // Hỏng / Thanh lý
      colorInfo: c('--color-info'),
      colorPurple: c('--chart-color-6'),
      colorBlue: c('--peacock-blue'),
      colorInUse: c('--peacock-blue-light'), // Đang sử dụng
      colorBooked: c('--chart-color-6'),     // Đã Book
      colorLoaned: c('--chart-color-9'),     // Cho mượn
      colorDefault: c('--gray-500'),          // Khác
    };

    this.statusColorMap.set('Sẵn sàng', this.cssVars.colorSuccess);
    this.statusColorMap.set('Đang sử dụng', this.cssVars.colorInUse);
    this.statusColorMap.set('Cần bảo trì', this.cssVars.colorWarning);
    this.statusColorMap.set('Đang bảo trì', this.cssVars.colorWarning);
    this.statusColorMap.set('Hỏng', this.cssVars.colorDanger);
    this.statusColorMap.set('Thanh lý', this.cssVars.colorDanger);
    this.statusColorMap.set('Đã Book', this.cssVars.colorBooked);
    this.statusColorMap.set('Cho mượn', this.cssVars.colorLoaned);

    this.widgetData = [
      { id: 'totalDevices', icon: 'fas fa-server', title: 'Tổng Thiết Bị', value: '0', caption: 'Total Devices', accentColor: this.cssVars.colorBlue },
      { id: 'totalValue', icon: 'fas fa-dollar-sign', title: 'Tổng Giá Trị', value: '0 ₫', caption: 'Total Value (VND)', accentColor: this.cssVars.colorPurple },
      { id: 'inUse', icon: 'fas fa-power-off', title: 'Đang Sử Dụng', value: '0', caption: 'In Use', accentColor: this.cssVars.colorInfo },
      { id: 'ready', icon: 'fas fa-check-circle', title: 'Sẵn Sàng', value: '0', caption: 'Ready', accentColor: this.cssVars.colorSuccess },
      { id: 'needsAttention', icon: 'fas fa-exclamation-triangle', title: 'Cần Chú Ý', value: '0', caption: 'Needs Attention', accentColor: this.cssVars.colorWarning },
      { id: 'expiring', icon: 'fas fa-calendar-times', title: 'Sắp Hết BH', value: '0', caption: 'Warranty Expiring', accentColor: this.cssVars.colorDanger }
    ];
  }

  private initChart(container: HTMLElement): EChartsType | undefined {
    if (!this.echartsInstance || !container) return;
    let chart: EChartsType | undefined;
    this.ngZone.runOutsideAngular(() => {
      chart = this.echartsInstance!.init(container, undefined, { renderer: 'canvas', useDirtyRect: true });
    });
    return chart;
  }

  private setupResizeListener(): void {
    if (!this.chartContainerPie) return; 
    this.ngZone.runOutsideAngular(() => {
      let resizeTimeout: any;
      const onResize = () => {
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(() => this.triggerResize(), 150);
      };
      window.addEventListener('resize', onResize, { passive: true });
      this.resizeObserver = new ResizeObserver(onResize);
      this.resizeObserver.observe(this.chartContainerPie.nativeElement);
      this.resizeObserver.observe(this.chartContainerCategory.nativeElement);
      this.resizeObserver.observe(this.chartContainerLocation.nativeElement);
      this.resizeObserver.observe(this.chartContainerTrend.nativeElement);
    });
  }

  public loadData(): void {
    const apiUrl = environment.equipmentCatUrl; 
    this.http
      .get<Device[]>(apiUrl) 
      .pipe(
        finalize(() => {
          this.isLoading = false;
          this.cd.markForCheck(); 
          if (!this.intersectionObserverInitialized) {
            this.ngZone.runOutsideAngular(() => {
              setTimeout(() => {
                this.setupIntersectionObserver();
                this.intersectionObserverInitialized = true;
              }, 0);
            });
          }
        }),
        takeUntil(this.destroy$)
      )
      .subscribe({
        next: (allDevices) => {
          this.allDevices = allDevices; 
          this.refilterAndRenderAll(); 
        },
        error: (error) => {
          console.error('Error loading all device data:', error);
          this.toastService.showError('Không thể tải dữ liệu thống kê thiết bị.');
          this.chartInstancePie?.clear();
          this.chartInstanceCategory?.clear();
          this.chartInstanceLocation?.clear();
          this.chartInstanceTrend?.clear();
        },
      });
  }

  private refilterAndRenderAll(): void {
    let filteredDevices = this.allDevices;

    if (this.currentFilter) {
      const { type, name } = this.currentFilter;
      const filterName = name; 

      switch (type) {
        case 'status':
          filteredDevices = this.allDevices.filter(d => (d.TrangThai_Ten || 'Không xác định') === filterName);
          break;
        case 'category':
          filteredDevices = this.allDevices.filter(d => (d.TenLoaiThietBi || 'Không xác định') === filterName);
          break;
        case 'location':
          filteredDevices = this.allDevices.filter(d => (d.ViTri || 'Không xác định') === filterName);
          break;
      }
    }

    this.calculateAndUpdateWidgets(filteredDevices);
    const { pieData, categoryData, locationData, trendData, attentionDevices, expiringDevices } = this.aggregateAllData(filteredDevices);
    
    this.pieData = pieData;
    this.categoryData = categoryData;
    this.locationData = locationData;
    this.trendData = trendData;
    this.attentionDevices = attentionDevices;
    this.expiringDevices = expiringDevices;

    this.renderPieChart(this.pieData);
    this.renderCategoryChart(this.categoryData);
    this.renderLocationChart(this.locationData);
    this.renderTrendChart(this.trendData);
    
    this.cd.markForCheck();
  }

  private onChartClick(type: FilterType, params: any): void {
    const clickedName = params.name;
    if (!clickedName) return;

    if (this.currentFilter && this.currentFilter.type === type && this.currentFilter.name === clickedName) {
      this.currentFilter = null;
    } else {
      this.currentFilter = { type, name: clickedName };
    }
    
    this.refilterAndRenderAll();
  }

  public clearFilter(): void {
    this.currentFilter = null;
    this.refilterAndRenderAll();
  }
  
  private aggregateAllData(allDevices: Device[]): {
    pieData: DeviceStatsData[], categoryData: AggregatedData[], locationData: AggregatedData[],
    trendData: TemporalData[], attentionDevices: ActionableDevice[], expiringDevices: ActionableDevice[],
  } {
    const pieMap = new Map<string, number>();
    const categoryMap = new Map<string, number>();
    const locationMap = new Map<string, number>();
    const trendMap = new Map<string, number>();
    const attentionDevices: ActionableDevice[] = [];
    const expiringDevices: ActionableDevice[] = [];
    
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const thirtyDaysFromNow = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000);
    const oneYearAgo = new Date(today.getTime() - 365 * 24 * 60 * 60 * 1000);

    for (const device of allDevices) {
      if (!device.Id) continue; 
      const statusName = device.TrangThai_Ten || 'Không xác định';
      const categoryName = device.TenLoaiThietBi || 'Không xác định';
      const locationName = device.ViTri || 'Không xác định';
      
      pieMap.set(statusName, (pieMap.get(statusName) || 0) + 1);
      categoryMap.set(categoryName, (categoryMap.get(categoryName) || 0) + 1);
      locationMap.set(locationName, (locationMap.get(locationName) || 0) + 1);

      if (device.NgayTao) {
        try {
          const createdDate = this.parseDate(device.NgayTao);
          if (createdDate && createdDate >= oneYearAgo) {
            const monthKey = `${createdDate.getFullYear()}-${(createdDate.getMonth() + 1).toString().padStart(2, '0')}`;
            trendMap.set(monthKey, (trendMap.get(monthKey) || 0) + 1);
          }
        } catch (e) { }
      }

      const statusLower = statusName.toLowerCase();
      if (statusLower.includes('bảo trì') || statusLower.includes('hỏng') || statusLower.includes('sửa chữa')) {
        attentionDevices.push({
          Id: device.Id, Ten: device.Ten, Ma: device.Ma, ViTri: device.ViTri || 'N/A', TrangThai_Ten: device.TrangThai_Ten,
        });
      }
      
      if (device.NgayHetHanBH) {
         try {
           const expiryDate = this.parseDate(device.NgayHetHanBH);
           if (expiryDate && expiryDate <= thirtyDaysFromNow && expiryDate >= today) {
              expiringDevices.push({
                Id: device.Id, Ten: device.Ten, Ma: device.Ma, ViTri: device.ViTri || 'N/A', NgayHetHanBH: this.formatDate(device.NgayHetHanBH)
              });
           }
         } catch(e) {}
      }
    }

    const pieData = Array.from(pieMap, ([ten, sl]) => ({ TenTrangThai: ten, SoLuong: sl }));
    const categoryData = Array.from(categoryMap, ([name, value]) => ({ name, value })).sort((a,b) => b.value - a.value);
    const locationData = Array.from(locationMap, ([name, value]) => ({ name, value })).sort((a,b) => b.value - a.value).slice(0, 10);
    const trendData = Array.from(trendMap, ([month, value]) => ({ month, value })).sort((a,b) => a.month.localeCompare(b.month));
    
    expiringDevices.sort((a,b) => this.parseDate(a.NgayHetHanBH!)!.getTime() - this.parseDate(b.NgayHetHanBH!)!.getTime());
    
    return { pieData, categoryData, locationData, trendData, attentionDevices, expiringDevices };
  }
  
  private calculateAndUpdateWidgets(allDevices: Device[]): void {
    let totalValue = 0, inUse = 0, ready = 0, needsAttention = 0, expiring = 0;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const thirtyDaysFromNow = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000);

    for (const device of allDevices) {
      const price = this.parseValue(device.GiaMua);
      if (!isNaN(price)) { totalValue += price; }

      const status = (device.TrangThai_Ten || '').toLowerCase();
      if (status.includes('đang sử dụng')) { inUse++; } 
      else if (status.includes('sẵn sàng')) { ready++; } 
      else if (status.includes('bảo trì') || status.includes('hỏng') || status.includes('sửa chữa')) { needsAttention++; }

      if (device.NgayHetHanBH) {
        try {
           const expiryDate = this.parseDate(device.NgayHetHanBH);
           if (expiryDate && expiryDate <= thirtyDaysFromNow && expiryDate >= today) { expiring++; }
        } catch (e) { }
      }
    }

    this.updateWidgetValue('totalDevices', this.formatNumber(allDevices.length));
    // --- UPDATED ---
    this.updateWidgetValue('totalValue', this.formatCurrency(totalValue));
    // --- END UPDATED ---
    this.updateWidgetValue('inUse', this.formatNumber(inUse));
    this.updateWidgetValue('ready', this.formatNumber(ready));
    this.updateWidgetValue('needsAttention', this.formatNumber(needsAttention));
    this.updateWidgetValue('expiring', this.formatNumber(expiring));
  }

  private parseDate(dateString: string | null | undefined): Date | null {
    if (!dateString) return null;
    try {
      if (dateString.includes('/')) {
         const parts = dateString.substring(0, 10).split('/');
         const d = new Date(Number(parts[2]), Number(parts[1]) - 1, Number(parts[0]));
         return isNaN(d.getTime()) ? null : d;
      } else {
         const d = new Date(dateString); 
         return isNaN(d.getTime()) ? null : d;
      }
    } catch (e) { return null; }
  }
  public formatDate(dateString: string | null | undefined): string {
    const date = this.parseDate(dateString);
    if (!date) return 'N/A';
    return date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }
  private updateWidgetValue(id: string, value: string): void {
    const widget = this.widgetData.find((w) => w.id === id);
    if (widget) { widget.value = value; }
  }

  // --- UPDATED ---
  private parseValue(val: any): number {
    if (typeof val === 'number') return val;
    if (typeof val === 'string') {
      // Remove commas AND dots for robustness
      const cleaned = val.replace(/[.,]/g, '').trim();
      const num = parseFloat(cleaned);
      return isNaN(num) ? 0 : num;
    }
    return 0;
  }
  // --- END UPDATED ---

  private formatNumber(value: number): string {
    return new Intl.NumberFormat('vi-VN').format(value);
  }

  // --- NEW ---
  /**
   * Formats a number as Vietnamese currency (VND).
   */
  private formatCurrency(value: number): string {
    return new Intl.NumberFormat('vi-VN', {
      style: 'currency',
      currency: 'VND'
    }).format(value);
  }
  // --- END NEW ---

  private formatPercentage(value: number): string {
    return new Intl.NumberFormat('vi-VN', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(value) + '%';
  }
  trackByWidgetId(index: number, item: WidgetData): string {
    return item.id;
  }
  public navigateToDetail(device: ActionableDevice): void {
    if (device && device.Id) {
      this.router.navigate(['/app/equipment/catalog', device.Id]);
    }
  }

  private renderPieChart(data: DeviceStatsData[]): void {
    if (!this.chartInstancePie) return;
    const option = this.buildPieOption(data);
    this.ngZone.runOutsideAngular(() => {
      requestAnimationFrame(() => {
        this.chartInstancePie?.setOption(option, { notMerge: true, lazyUpdate: true });
      });
    });
  }
  private renderCategoryChart(data: AggregatedData[]): void {
    if (!this.chartInstanceCategory) return;
    const option = this.buildBarOption('Số lượng theo Loại Thiết bị', data.map(d => d.name).reverse(), data.map(d => d.value).reverse());
    this.ngZone.runOutsideAngular(() => {
      requestAnimationFrame(() => {
        this.chartInstanceCategory?.setOption(option, { notMerge: true, lazyUpdate: true });
      });
    });
  }
  private renderLocationChart(data: AggregatedData[]): void {
    if (!this.chartInstanceLocation) return;
    const option = this.buildBarOption('Top 10 Vị trí', data.map(d => d.name).reverse(), data.map(d => d.value).reverse());
    this.ngZone.runOutsideAngular(() => {
      requestAnimationFrame(() => {
        this.chartInstanceLocation?.setOption(option, { notMerge: true, lazyUpdate: true });
      });
    });
  }
  private renderTrendChart(data: TemporalData[]): void {
    if (!this.chartInstanceTrend) return;
    const option = this.buildLineOption('Thiết bị mới theo Tháng', data.map(d => d.month), data.map(d => d.value));
    this.ngZone.runOutsideAngular(() => {
      requestAnimationFrame(() => {
        this.chartInstanceTrend?.setOption(option, { notMerge: true, lazyUpdate: true });
      });
    });
  }
  
  private buildPieOption(data: DeviceStatsData[]): EChartsOption {
    
    const chartData = data.map(item => ({
      value: item.SoLuong,
      name: item.TenTrangThai,
      itemStyle: {
        color: this.statusColorMap.get(item.TenTrangThai) || this.cssVars.colorDefault 
      }
    }));

    const totalDevices = data.reduce((sum, item) => sum + item.SoLuong, 0);

    const isFiltered = !!this.currentFilter;
    const subtext = isFiltered ? `Tổng (đã lọc): ${totalDevices}` : `Tổng số: ${totalDevices} thiết bị`;

    return {
      backgroundColor: this.cssVars.white,
      textStyle: { fontFamily: GLOBAL_FONT_FAMILY, fontSize: 12, color: this.cssVars.gray700 },
      
      title: {
        text: 'Thống Kê Trạng Thái',
        subtext: subtext,
        left: 'center',
        textStyle: { color: this.cssVars.gray800, fontWeight: 'bold', fontSize: 16 },
        subtextStyle: { 
          color: isFiltered ? this.cssVars.colorBlue : this.cssVars.gray700,
          fontSize: 13 
        },
      },
      tooltip: {
        trigger: 'item',
        formatter: '{a} <br/>{b}: {c} ({d}%)',
        textStyle: { fontFamily: GLOBAL_FONT_FAMILY }
      },
      legend: {
        orient: 'vertical',
        left: 'left',
        top: '15%',
        itemWidth: 14,
        itemHeight: 14,
        textStyle: { fontSize: 11 },
      },
      series: [
        {
          name: 'Trạng Thái',
          type: 'pie',
          radius: ['45%', '70%'],
          center: ['50%', '60%'],
          avoidLabelOverlap: true,
          label: { show: false, position: 'center' }, 
          emphasis: {
            label: {
              show: true,
              fontSize: 14,
              fontWeight: 'bold',
              formatter: '{b}\n{c} ({d}%)' 
            },
          },
          labelLine: { show: false },
          data: chartData,
        }
      ],
    };
  }

  private buildBarOption(title: string, yAxisData: string[], seriesData: number[]): EChartsOption {
    return {
      backgroundColor: this.cssVars.white,
      textStyle: { fontFamily: GLOBAL_FONT_FAMILY, fontSize: 12, color: this.cssVars.gray700 },
      title: {
        text: title,
        left: 'center',
        textStyle: { color: this.cssVars.gray800, fontWeight: 'bold', fontSize: 16 },
      },
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        textStyle: { fontFamily: GLOBAL_FONT_FAMILY }
      },
      grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
      xAxis: {
        type: 'value',
        boundaryGap: [0, 0.01],
        splitLine: { lineStyle: { color: this.cssVars.gray200, type: 'dotted' } },
      },
      yAxis: {
        type: 'category',
        data: yAxisData,
        axisTick: { show: false },
        axisLine: { show: false },
        axisLabel: { fontSize: 10, overflow: 'truncate', width: 100 }
      },
      series: [
        {
          name: 'Số lượng',
          type: 'bar',
          data: seriesData,
          itemStyle: {
            color: this.cssVars.colorBlue,
            borderRadius: [0, 4, 4, 0]
          },
          label: { show: true, position: 'right', color: this.cssVars.gray700, fontSize: 10 }
        },
      ],
    };
  }

  private buildLineOption(title: string, xAxisData: string[], seriesData: number[]): EChartsOption {
    return {
      backgroundColor: this.cssVars.white,
      textStyle: { fontFamily: GLOBAL_FONT_FAMILY, fontSize: 12, color: this.cssVars.gray700 },
      title: {
        text: title,
        left: 'center',
        textStyle: { color: this.cssVars.gray800, fontWeight: 'bold', fontSize: 16 },
      },
      tooltip: {
        trigger: 'axis',
        textStyle: { fontFamily: GLOBAL_FONT_FAMILY }
      },
      grid: { left: '3%', right: '4%', bottom: '10%', containLabel: true },
      xAxis: { type: 'category', boundaryGap: false, data: xAxisData },
      yAxis: { type: 'value', splitLine: { lineStyle: { color: this.cssVars.gray200, type: 'dotted' } } },
      dataZoom: [
        { type: 'inside', start: 0, end: 100 },
        { start: 0, end: 100, height: 20, bottom: 5 }
      ],
      series: [
        {
          name: 'Thiết bị mới',
          type: 'line',
          smooth: true,
          data: seriesData,
          itemStyle: { color: this.cssVars.colorSuccess },
          areaStyle: {
            color: new (this.echartsInstance as any).graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: this.cssVars.colorSuccess },
              { offset: 1, color: this.cssVars.white }
            ])
          },
        },
      ],
    };
  }
}