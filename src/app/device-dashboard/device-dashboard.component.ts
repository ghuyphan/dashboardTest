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
import { Subject, Subscription } from 'rxjs';
import { Router } from '@angular/router';

import type { EChartsType, EChartsCoreOption } from 'echarts/core';
import type * as echarts from 'echarts/core';
import { environment } from '../../environments/environment.development';

import { Device } from '../models/device.model';
import { ToastService } from '../services/toast.service';
import { WidgetCardComponent } from '../components/widget-card/widget-card.component';
import {
  ReusableTableComponent,
  GridColumn,
} from '../components/reusable-table/reusable-table.component';

const GLOBAL_FONT_FAMILY =
  'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

function getCssVar(name: string): string {
  return getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
}

type EChartsOption = EChartsCoreOption;

interface WidgetData {
  id: string;
  icon: string;
  title: string;
  value: string;
  caption: string;
  accentColor: string;
}
interface DeviceStatsData {
  TenTrangThai: string;
  SoLuong: number;
}
interface AggregatedData {
  name: string;
  value: number;
}
interface TemporalData {
  month: string;
  value: number;
}
interface ActionableDevice {
  Id: number;
  Ten: string;
  Ma: string;
  ViTri: string;
  TrangThai_Ten?: string | null;
  NgayHetHanBH?: string | null;
}
type FilterType = 'status' | 'category' | 'location';
interface ChartFilter {
  type: FilterType;
  name: string;
}

@Component({
  selector: 'app-device-dashboard',
  standalone: true,
  imports: [CommonModule, WidgetCardComponent, ReusableTableComponent],
  templateUrl: './device-dashboard.component.html',
  styleUrl: './device-dashboard.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DeviceDashboardComponent implements OnInit, OnDestroy, AfterViewInit {
  @ViewChild('chartContainerStatus')
  chartContainerStatus!: ElementRef<HTMLDivElement>;
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

  private chartInstanceStatus?: EChartsType;
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
  public visibleFilter: ChartFilter | null = null;
  private filterTransitionTimer: any;

  public widgetData: WidgetData[] = [];
  public statusData: DeviceStatsData[] = [];
  public categoryData: AggregatedData[] = [];
  public locationData: AggregatedData[] = [];
  public trendData: TemporalData[] = [];
  public attentionDevices: ActionableDevice[] = [];
  public expiringDevices: ActionableDevice[] = [];

  public statusChartSubtext: string = '';
  public locationChartTitle: string = '';

  public attentionTableColumns: GridColumn[] = [
    { key: 'Ten', label: 'Tên Thiết Bị (Mã)', sortable: true, width: '50%' },
    { key: 'ViTri', label: 'Vị Trí', sortable: true, width: '25%' },
    {
      key: 'TrangThai_Ten',
      label: 'Trạng Thái',
      sortable: true,
      width: '25%',
    },
  ];

  public expiringTableColumns: GridColumn[] = [
    { key: 'Ten', label: 'Tên Thiết Bị (Mã)', sortable: true, width: '50%' },
    { key: 'ViTri', label: 'Vị Trí', sortable: true, width: '25%' },
    {
      key: 'NgayHetHanBH',
      label: 'Ngày Hết Hạn',
      sortable: true,
      width: '25%',
    },
  ];

  private statusColorMap = new Map<string, string>();
  private cssVars = {
    gray200: '',
    gray700: '',
    gray800: '',
    white: '',
    colorSuccess: '',
    colorWarning: '',
    colorDanger: '',
    colorInfo: '',
    colorPurple: '',
    colorBlue: '',
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
    this.chartInstanceStatus?.dispose();
    this.chartInstanceCategory?.dispose();
    this.chartInstanceLocation?.dispose();
    this.chartInstanceTrend?.dispose();
    this.chartResizeSubscription?.unsubscribe();
    clearTimeout(this.filterTransitionTimer);
  }

  private setupResizeHandling(): void {
    this.chartResizeSubscription = this.resizeSubject
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        this.ngZone.runOutsideAngular(() => {
          this.chartInstanceStatus?.resize();
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

    if (!this.chartContainerStatus || !this.chartContainerStatus.nativeElement) {
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
    this.intersectionObserver.observe(this.chartContainerStatus.nativeElement);
  }

  private async initializeCharts(): Promise<void> {
    if (this.isChartInitialized) return;
    this.isChartInitialized = true;

    await this.lazyLoadECharts();

    this.chartInstanceStatus = this.initChart(
      this.chartContainerStatus.nativeElement
    );
    this.chartInstanceCategory = this.initChart(
      this.chartContainerCategory.nativeElement
    );
    this.chartInstanceLocation = this.initChart(
      this.chartContainerLocation.nativeElement
    );
    this.chartInstanceTrend = this.initChart(
      this.chartContainerTrend.nativeElement
    );

    this.chartInstanceStatus?.on('click', (params) => {
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
        echartsCore,
        CanvasRenderer,
        chartsModule,
        componentsModule,
      ] = await Promise.all([
        import('echarts/core'),
        import('echarts/renderers'),
        import('echarts/charts'),
        import('echarts/components'),
      ]);

      const { PieChart, BarChart, LineChart } = chartsModule;
      const {
        TitleComponent,
        TooltipComponent,
        LegendComponent,
        GridComponent,
        DataZoomComponent,
      } = componentsModule;

      this.echartsInstance = echartsCore;

      this.echartsInstance.use([
        CanvasRenderer.CanvasRenderer,
        PieChart,
        BarChart,
        LineChart,
        TitleComponent,
        TooltipComponent,
        LegendComponent,
        GridComponent,
        DataZoomComponent,
      ]);
    } catch (error) {
      console.error('Error lazy-loading ECharts', error);
    }
  }

  private initColors(): void {
    const c = getCssVar;

    this.cssVars = {
      gray200: c('--gray-200'),
      gray700: c('--gray-700'),
      gray800: c('--gray-800'),
      white: c('--white'),
      colorSuccess: c('--color-success'),
      colorWarning: c('--color-warning'),
      colorDanger: c('--color-danger'),
      colorInfo: c('--color-info'),
      colorPurple: c('--chart-color-6'),
      colorBlue: c('--teal-blue'),
      colorInUse: c('--peacock-blue-light'),
      colorBooked: c('--chart-color-6'),
      colorLoaned: c('--chart-color-9'),
      colorDefault: c('--gray-500'),
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
      {
        id: 'totalDevices',
        icon: 'fas fa-server',
        title: 'Tổng Thiết Bị',
        value: '0',
        caption: 'Total Devices',
        accentColor: this.cssVars.colorBlue,
      },
      {
        id: 'attentionValue',
        icon: 'fas fa-dollar-sign',
        title: 'Giá trị TB cần sửa',
        value: '0 ₫',
        caption: 'Value of Attention Devices',
        accentColor: this.cssVars.colorWarning,
      },
      {
        id: 'inUse',
        icon: 'fas fa-power-off',
        title: 'Đang Sử Dụng',
        value: '0',
        caption: 'In Use',
        accentColor: this.cssVars.colorInfo,
      },
      {
        id: 'ready',
        icon: 'fas fa-check-circle',
        title: 'Sẵn Sàng',
        value: '0',
        caption: 'Ready',
        accentColor: this.cssVars.colorSuccess,
      },
      {
        id: 'needsAttention',
        icon: 'fas fa-exclamation-triangle',
        title: 'Cần Chú Ý',
        value: '0',
        caption: 'Needs Attention',
        accentColor: this.cssVars.colorWarning,
      },
      {
        id: 'expiring',
        icon: 'fas fa-calendar-times',
        title: 'Sắp Hết BH',
        value: '0',
        caption: 'Warranty Expiring',
        accentColor: this.cssVars.colorDanger,
      },
    ];
  }

  private initChart(container: HTMLElement): EChartsType | undefined {
    if (!this.echartsInstance || !container) return;
    let chart: EChartsType | undefined;
    this.ngZone.runOutsideAngular(() => {
      chart = this.echartsInstance!.init(container, undefined, {
        renderer: 'canvas',
        useDirtyRect: true,
      });
    });
    return chart;
  }

  private setupResizeListener(): void {
    if (!this.chartContainerStatus) return;
    this.ngZone.runOutsideAngular(() => {
      let resizeTimeout: any;
      const onResize = () => {
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(() => this.triggerResize(), 150);
      };
      window.addEventListener('resize', onResize, { passive: true });
      this.resizeObserver = new ResizeObserver(onResize);
      this.resizeObserver.observe(this.chartContainerStatus.nativeElement);
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
          this.toastService.showError(
            'Không thể tải dữ liệu thống kê thiết bị.'
          );
          this.chartInstanceStatus?.clear();
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
          filteredDevices = this.allDevices.filter(
            (d) => (d.TrangThai_Ten || 'Không xác định') === filterName
          );
          break;
        case 'category':
          filteredDevices = this.allDevices.filter(
            (d) => (d.TenLoaiThietBi || 'Không xác định') === filterName
          );
          break;
        case 'location':
          filteredDevices = this.allDevices.filter((d) => {
            const statusLower = (d.TrangThai_Ten || '').toLowerCase();
            const needsAttention =
              statusLower.includes('bảo trì') ||
              statusLower.includes('hỏng') ||
              statusLower.includes('sửa chữa');
            return (
              needsAttention && (d.ViTri || 'Không xác định') === filterName
            );
          });
          break;
      }
    }

    const {
      statusData,
      categoryData,
      locationData,
      trendData,
      attentionDevices,
      expiringDevices,
      widgetData,
    } = this.aggregateAllData(filteredDevices, this.allDevices);

    this.updateWidgetValue(
      'totalDevices',
      this.formatNumber(widgetData.totalDevices)
    );
    this.updateWidgetValue(
      'attentionValue',
      this.formatCurrency(widgetData.attentionValue)
    );
    this.updateWidgetValue('inUse', this.formatNumber(widgetData.inUse));
    this.updateWidgetValue('ready', this.formatNumber(widgetData.ready));
    this.updateWidgetValue(
      'needsAttention',
      this.formatNumber(widgetData.needsAttention)
    );
    this.updateWidgetValue(
      'expiring',
      this.formatNumber(widgetData.expiring)
    );

    this.statusData = statusData;
    this.categoryData = categoryData;
    this.locationData = locationData;
    this.trendData = trendData;
    this.attentionDevices = attentionDevices;
    this.expiringDevices = expiringDevices;

    const totalStatus = this.statusData.reduce(
      (sum, item) => sum + item.SoLuong,
      0
    );
    this.statusChartSubtext = this.currentFilter
      ? `Tổng (đã lọc): ${this.formatNumber(totalStatus)}`
      : `Tổng số: ${this.formatNumber(totalStatus)} thiết bị`;

    this.locationChartTitle = this.currentFilter
      ? `Vị trí (Đã lọc)`
      : `Vị trí có TB cần chú ý (Top 10)`;

    this.renderStatusChart(this.statusData);
    this.renderCategoryChart(this.categoryData);
    this.renderLocationChart(this.locationData);
    this.renderTrendChart(this.trendData);

    this.cd.markForCheck();
  }

  private onChartClick(type: FilterType, params: any): void {
    const clickedName = params.name;
    if (!clickedName) return;

    clearTimeout(this.filterTransitionTimer);

    if (
      this.currentFilter &&
      this.currentFilter.type === type &&
      this.currentFilter.name === clickedName
    ) {
      this.clearFilter();
    } else {
      const newFilter = { type, name: clickedName };
      this.currentFilter = newFilter;
      this.visibleFilter = newFilter;
      this.refilterAndRenderAll();
    }
  }

  public clearFilter(): void {
    clearTimeout(this.filterTransitionTimer);

    this.currentFilter = null;
    this.refilterAndRenderAll();

    this.filterTransitionTimer = setTimeout(() => {
      this.visibleFilter = null;
      this.cd.markForCheck();
    }, 300);
  }

  private aggregateAllData(
    filteredDevices: Device[],
    allDevices: Device[]
  ): {
    statusData: DeviceStatsData[];
    categoryData: AggregatedData[];
    locationData: AggregatedData[];
    trendData: TemporalData[];
    attentionDevices: ActionableDevice[];
    expiringDevices: ActionableDevice[];
    widgetData: {
      totalDevices: number;
      attentionValue: number;
      inUse: number;
      ready: number;
      needsAttention: number;
      expiring: number;
    };
  } {
    const statusMap = new Map<string, number>();
    const categoryMap = new Map<string, number>();
    const trendMap = new Map<string, number>();
    const attentionDevices: ActionableDevice[] = [];
    const expiringDevices: ActionableDevice[] = [];

    let attentionValue = 0;
    let inUse = 0;
    let ready = 0;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const thirtyDaysFromNow = new Date(
      today.getTime() + 30 * 24 * 60 * 60 * 1000
    );
    const oneYearAgo = new Date(
      today.getTime() - 365 * 24 * 60 * 60 * 1000
    );

    for (const device of filteredDevices) {
      if (!device.Id) continue;
      const statusName = device.TrangThai_Ten || 'Không xác định';
      const categoryName = device.TenLoaiThietBi || 'Không xác định';
      const statusLower = statusName.toLowerCase();

      statusMap.set(statusName, (statusMap.get(statusName) || 0) + 1);
      categoryMap.set(categoryName, (categoryMap.get(categoryName) || 0) + 1);

      if (statusLower.includes('đang sử dụng')) {
        inUse++;
      } else if (statusLower.includes('sẵn sàng')) {
        ready++;
      }

      if (device.NgayTao) {
        try {
          const createdDate = this.parseDate(device.NgayTao);
          if (createdDate && createdDate >= oneYearAgo) {
            const monthKey = `${createdDate.getFullYear()}-${(
              createdDate.getMonth() + 1
            )
              .toString()
              .padStart(2, '0')}`;
            trendMap.set(monthKey, (trendMap.get(monthKey) || 0) + 1);
          }
        } catch (e) { }
      }

      const needsAttentionCheck =
        statusLower.includes('bảo trì') ||
        statusLower.includes('hỏng') ||
        statusLower.includes('sửa chữa');

      if (needsAttentionCheck) {
        attentionDevices.push({
          Id: device.Id,
          Ten: `${device.Ten} (${device.Ma})`,
          Ma: device.Ma,
          ViTri: device.ViTri || 'N/A',
          TrangThai_Ten: device.TrangThai_Ten,
        });

        const price = this.parseValue(device.GiaMua);
        if (!isNaN(price)) {
          attentionValue += price;
        }
      }

      if (device.NgayHetHanBH) {
        try {
          const expiryDate = this.parseDate(device.NgayHetHanBH);
          const isExpiringCheck =
            expiryDate &&
            expiryDate <= thirtyDaysFromNow &&
            expiryDate >= today;

          if (isExpiringCheck) {
            expiringDevices.push({
              Id: device.Id,
              Ten: `${device.Ten} (${device.Ma})`,
              Ma: device.Ma,
              ViTri: device.ViTri || 'N/A',
              NgayHetHanBH: this.formatDate(device.NgayHetHanBH),
            });
          }
        } catch (e) { }
      }
    }

    const locationMap = new Map<string, number>();
    const devicesForLocationChart =
      this.currentFilter?.type === 'location' ? filteredDevices : allDevices;

    for (const device of devicesForLocationChart) {
      const statusLower = (device.TrangThai_Ten || '').toLowerCase();
      if (
        statusLower.includes('bảo trì') ||
        statusLower.includes('hỏng') ||
        statusLower.includes('sửa chữa')
      ) {
        const locationName = device.ViTri || 'Không xác định';
        locationMap.set(locationName, (locationMap.get(locationName) || 0) + 1);
      }
    }

    const statusData = Array.from(statusMap, ([ten, sl]) => ({
      TenTrangThai: ten,
      SoLuong: sl,
    }));
    const categoryData = Array.from(categoryMap, ([name, value]) => ({
      name,
      value,
    })).sort((a, b) => b.value - a.value);
    const locationData = Array.from(locationMap, ([name, value]) => ({
      name,
      value,
    }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);
    const trendData = Array.from(trendMap, ([month, value]) => ({
      month,
      value,
    })).sort((a, b) => a.month.localeCompare(b.month));

    expiringDevices.sort(
      (a, b) =>
        this.parseDate(a.NgayHetHanBH!)!.getTime() -
        this.parseDate(b.NgayHetHanBH!)!.getTime()
    );

    return {
      statusData,
      categoryData,
      locationData,
      trendData,
      attentionDevices,
      expiringDevices,
      widgetData: {
        totalDevices: filteredDevices.length,
        attentionValue: attentionValue,
        inUse: inUse,
        ready: ready,
        needsAttention: attentionDevices.length,
        expiring: expiringDevices.length,
      },
    };
  }

  private parseDate(dateString: string | null | undefined): Date | null {
    if (!dateString) return null;
    try {
      if (dateString.includes('/')) {
        const parts = dateString.substring(0, 10).split('/');
        const d = new Date(
          Number(parts[2]),
          Number(parts[1]) - 1,
          Number(parts[0])
        );
        return isNaN(d.getTime()) ? null : d;
      } else {
        const d = new Date(dateString);
        return isNaN(d.getTime()) ? null : d;
      }
    } catch (e) {
      return null;
    }
  }

  public formatDate(dateString: string | null | undefined): string {
    const date = this.parseDate(dateString);
    if (!date) return 'N/A';
    return date.toLocaleDateString('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  }

  private updateWidgetValue(id: string, value: string): void {
    const widget = this.widgetData.find((w) => w.id === id);
    if (widget) {
      widget.value = value;
    }
  }

  private parseValue(val: any): number {
    if (typeof val === 'number') return val;
    if (typeof val === 'string') {
      const cleaned = val.replace(/[.,]/g, '').trim();
      const num = parseFloat(cleaned);
      return isNaN(num) ? 0 : num;
    }
    return 0;
  }

  private formatNumber(value: number): string {
    return new Intl.NumberFormat('vi-VN').format(value);
  }

  private formatCurrency(value: number): string {
    return new Intl.NumberFormat('vi-VN', {
      style: 'currency',
      currency: 'VND',
    }).format(value);
  }

  private formatPercentage(value: number): string {
    return (
      new Intl.NumberFormat('vi-VN', {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      }).format(value) + '%'
    );
  }

  trackByWidgetId(index: number, item: WidgetData): string {
    return item.id;
  }

  public navigateToDetail(device: ActionableDevice): void {
    if (device && device.Id) {
      this.router.navigate(['/app/equipment/catalog', device.Id]);
    }
  }

  // --- CHART BUILDER FUNCTIONS ---

  private renderStatusChart(data: DeviceStatsData[]): void {
    if (!this.chartInstanceStatus) return;

    const option = this.buildDonutOption(data);

    this.ngZone.runOutsideAngular(() => {
      requestAnimationFrame(() => {
        this.chartInstanceStatus?.setOption(option, {
          notMerge: false,
          lazyUpdate: true,
          silent: false
        });
      });
    });
  }

  private renderCategoryChart(data: AggregatedData[]): void {
    if (!this.chartInstanceCategory) return;
    const option = this.buildBarOption(
      data.map((d) => d.name).reverse(),
      data.map((d) => d.value).reverse()
    );
    this.ngZone.runOutsideAngular(() => {
      requestAnimationFrame(() => {
        this.chartInstanceCategory?.setOption(option, {
          notMerge: false,
          lazyUpdate: true,
          silent: false
        });
      });
    });
  }

  private renderLocationChart(data: AggregatedData[]): void {
    if (!this.chartInstanceLocation) return;
    const option = this.buildBarOption(
      data.map((d) => d.name).reverse(),
      data.map((d) => d.value).reverse(),
      this.cssVars.colorBlue
    );
    this.ngZone.runOutsideAngular(() => {
      requestAnimationFrame(() => {
        this.chartInstanceLocation?.setOption(option, {
          notMerge: false,
          lazyUpdate: true,
          silent: false
        });
      });
    });
  }

  private renderTrendChart(data: TemporalData[]): void {
    if (!this.chartInstanceTrend) return;
    const option = this.buildLineOption(
      data.map((d) => d.month),
      data.map((d) => d.value)
    );
    this.ngZone.runOutsideAngular(() => {
      requestAnimationFrame(() => {
        this.chartInstanceTrend?.setOption(option, {
          notMerge: true,
          lazyUpdate: true,
        });
      });
    });
  }

  private buildDonutOption(data: DeviceStatsData[]): EChartsOption {
    if (!this.echartsInstance) return {};

    const chartData = data.map((item) => ({
      name: item.TenTrangThai,
      value: item.SoLuong,
      itemStyle: {
        color:
          this.statusColorMap.get(item.TenTrangThai) ||
          this.cssVars.colorDefault,
      },
    }));

    const totalDevices = data.reduce((sum, item) => sum + item.SoLuong, 0);

    return {
      backgroundColor: this.cssVars.white,
      textStyle: {
        fontFamily: GLOBAL_FONT_FAMILY,
      },
      tooltip: {
        trigger: 'item',
        textStyle: { fontFamily: GLOBAL_FONT_FAMILY },
        formatter: (params: any) => {
          if (!params.name) return '';
          const percent = ((params.value / totalDevices) * 100).toFixed(1);
          return `${params.marker} <b>${params.name
            }</b><br/>Số lượng: <b>${this.formatNumber(
              params.value
            )}</b> (${percent}%)`;
        },
      },
      legend: {
        orient: 'vertical',
        left: '4%',
        top: '25%',
        align: 'left',
        itemGap: 10,
        icon: 'circle',
        textStyle: {
          fontSize: 11,
          color: this.cssVars.gray700,
          width: 150,
          overflow: 'truncate',
        },
        formatter: (name: string) => {
          const item = chartData.find((d) => d.name === name);
          const value = item ? this.formatNumber(item.value) : '0';
          const truncatedName =
            name.length > 18 ? name.substring(0, 18) + '...' : name;
          return `${truncatedName}  |  ${value}`;
        },
      },
      series: [
        {
          name: 'Trạng thái',
          type: 'pie',
          radius: ['50%', '75%'],
          center: ['68%', '55%'],
          avoidLabelOverlap: true,
          label: {
            show: true,
            position: 'outer',
            alignTo: 'labelLine',
            formatter: (params: any) => {
              if (!params.value) return '';
              const percent = ((params.value / totalDevices) * 100).toFixed(1);
              return `${params.name}\n${percent}%`;
            },
            textStyle: {
              color: this.cssVars.gray700,
              fontSize: 12,
              fontFamily: GLOBAL_FONT_FAMILY,
            },
            overflow: 'truncate',
            width: 80,
          },
          labelLine: {
            show: true,
            length: 10,
            length2: 15,
            lineStyle: {
              width: 1,
              color: this.cssVars.gray700,
            },
            smooth: true,
          },
          emphasis: {
            label: {
              show: true,
              fontSize: 24,
              fontWeight: 'bold',
              formatter: (params: any) => {
                if (!params.value) return '0%';
                return `${((params.value / totalDevices) * 100).toFixed(0)}%`;
              },
            },
          },
          data: chartData,
        },
      ],
    };
  }

  private buildBarOption(
    yAxisData: string[],
    seriesData: number[],
    color: string | ((params: any) => string) = this.cssVars.colorBlue
  ): EChartsOption {
    return {
      backgroundColor: this.cssVars.white,
      textStyle: {
        fontFamily: GLOBAL_FONT_FAMILY,
        fontSize: 12,
        color: this.cssVars.gray700,
      },
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        textStyle: { fontFamily: GLOBAL_FONT_FAMILY },
      },
      grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
      xAxis: {
        type: 'value',
        boundaryGap: [0, 0.01],
        splitLine: {
          lineStyle: { color: this.cssVars.gray200, type: 'dotted' },
        },
      },
      yAxis: {
        type: 'category',
        data: yAxisData,
        axisTick: { show: false },
        axisLine: { show: false },
        axisLabel: { fontSize: 10, overflow: 'truncate', width: 100 },
      },
      series: [
        {
          name: 'Số lượng',
          type: 'bar',
          data: seriesData,
          itemStyle: {
            color: color,
            borderRadius: [0, 4, 4, 0],
          },
          label: {
            show: true,
            position: 'right',
            color: this.cssVars.gray700,
            fontSize: 10,
          },
        },
      ],
    };
  }

  private buildLineOption(
    xAxisData: string[],
    seriesData: number[]
  ): EChartsOption {
    const chartColor = this.cssVars.colorBlue;

    return {
      backgroundColor: this.cssVars.white,
      textStyle: {
        fontFamily: GLOBAL_FONT_FAMILY,
        fontSize: 12,
        color: this.cssVars.gray700,
      },
      tooltip: {
        trigger: 'axis',
        textStyle: { fontFamily: GLOBAL_FONT_FAMILY },
      },
      grid: { left: '3%', right: '4%', containLabel: true },
      xAxis: { type: 'category', boundaryGap: false, data: xAxisData },
      yAxis: {
        type: 'value',
        splitLine: {
          lineStyle: { color: this.cssVars.gray200, type: 'dotted' },
        },
      },
      series: [
        {
          name: 'Thiết bị mới',
          type: 'line',
          smooth: true,
          data: seriesData,
          itemStyle: { color: chartColor },
          areaStyle: {
            color: new (this.echartsInstance as any).graphic.LinearGradient(
              0,
              0,
              0,
              1,
              [
                { offset: 0, color: chartColor },
                { offset: 1, color: this.cssVars.white },
              ]
            ),
          },
        },
      ],
    };
  }
}