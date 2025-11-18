import {
  Component,
  OnInit,
  OnDestroy,
  inject,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { finalize, takeUntil } from 'rxjs/operators';
import { Subject } from 'rxjs';
import { Router } from '@angular/router';

// Only import Types
import type { EChartsCoreOption } from 'echarts/core';
import { environment } from '../../environments/environment.development';

import { Device } from '../models/device.model';
import { ToastService } from '../services/toast.service';
import { WidgetCardComponent } from '../components/widget-card/widget-card.component';
import { ChartCardComponent } from '../components/chart-card/chart-card.component';
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
  imports: [
    CommonModule,
    WidgetCardComponent,
    ReusableTableComponent,
    ChartCardComponent
  ],
  templateUrl: './device-dashboard.component.html',
  styleUrl: './device-dashboard.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DeviceDashboardComponent implements OnInit, OnDestroy {
  private http = inject(HttpClient);
  privateVX = inject(ChangeDetectorRef); // Renamed to match usage (cd) or fix usage
  private cd = inject(ChangeDetectorRef);
  private toastService = inject(ToastService);
  private router = inject(Router);

  public isLoading: boolean = false;

  private allDevices: Device[] = [];

  public currentFilter: ChartFilter | null = null;
  public visibleFilter: ChartFilter | null = null;
  private filterTransitionTimer: any;

  public widgetData: WidgetData[] = [];
  
  // Chart Options
  public statusChartOptions: EChartsCoreOption | null = null;
  public categoryChartOptions: EChartsCoreOption | null = null;
  public locationChartOptions: EChartsCoreOption | null = null;
  public trendChartOptions: EChartsCoreOption | null = null;

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
    gray200: '#E2E8F0',
    gray700: '#334155',
    gray800: '#1E293B',
    white: '#FFFFFF',
    colorSuccess: '#16A34A',
    colorWarning: '#F59E0B',
    colorDanger: '#DC2626',
    colorInfo: '#0EA5E9',
    colorPurple: '#D8B4FE',
    colorBlue: '#00839B',
    colorInUse: '#38BDF8',
    colorBooked: '#F472B6',
    colorLoaned: '#FB923C',
    colorDefault: '#64748B',
  };

  private destroy$ = new Subject<void>();

  ngOnInit(): void {
    // We can try to fetch CSS vars, but fallback to defaults if running too early
    setTimeout(() => this.initColors(), 0);
    
    this.isLoading = true;
    this.cd.markForCheck();
    Promise.resolve().then(() => this.loadData());
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    clearTimeout(this.filterTransitionTimer);
  }

  private initColors(): void {
    // Safely get CSS variables if in browser
    if (typeof window !== 'undefined') {
      const c = getCssVar;
      // Update vars if available
      const checkVar = (name: string, fallback: string) => {
          const val = c(name);
          return val ? val : fallback;
      };
      
      this.cssVars.gray200 = checkVar('--gray-200', this.cssVars.gray200);
      this.cssVars.gray700 = checkVar('--gray-700', this.cssVars.gray700);
      this.cssVars.gray800 = checkVar('--gray-800', this.cssVars.gray800);
      this.cssVars.white = checkVar('--white', this.cssVars.white);
      this.cssVars.colorSuccess = checkVar('--color-success', this.cssVars.colorSuccess);
      this.cssVars.colorWarning = checkVar('--color-warning', this.cssVars.colorWarning);
      this.cssVars.colorDanger = checkVar('--color-danger', this.cssVars.colorDanger);
      this.cssVars.colorInfo = checkVar('--color-info', this.cssVars.colorInfo);
      this.cssVars.colorBlue = checkVar('--teal-blue', this.cssVars.colorBlue);
      this.cssVars.colorInUse = checkVar('--peacock-blue-light', this.cssVars.colorInUse);
      this.cssVars.colorBooked = checkVar('--chart-color-6', this.cssVars.colorBooked);
      this.cssVars.colorLoaned = checkVar('--chart-color-9', this.cssVars.colorLoaned);
      this.cssVars.colorDefault = checkVar('--gray-500', this.cssVars.colorDefault);
    }

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

  public loadData(): void {
    const apiUrl = environment.equipmentCatUrl;
    this.http
      .get<Device[]>(apiUrl)
      .pipe(
        finalize(() => {
          this.isLoading = false;
          this.cd.markForCheck();
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
          this.statusChartOptions = null;
          this.categoryChartOptions = null;
          this.locationChartOptions = null;
          this.trendChartOptions = null;
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

    this.attentionDevices = attentionDevices;
    this.expiringDevices = expiringDevices;

    const totalStatus = statusData.reduce(
      (sum, item) => sum + item.SoLuong,
      0
    );
    this.statusChartSubtext = this.currentFilter
      ? `Tổng (đã lọc): ${this.formatNumber(totalStatus)}`
      : `Tổng số: ${this.formatNumber(totalStatus)} thiết bị`;

    this.locationChartTitle = this.currentFilter
      ? `Vị trí (Đã lọc)`
      : `Vị trí có TB cần chú ý (Top 10)`;

    this.statusChartOptions = this.buildDonutOption(statusData);
    this.categoryChartOptions = this.buildBarOption(
      categoryData.map((d) => d.name).reverse(),
      categoryData.map((d) => d.value).reverse()
    );
    this.locationChartOptions = this.buildBarOption(
      locationData.map((d) => d.name).reverse(),
      locationData.map((d) => d.value).reverse(),
      this.cssVars.colorBlue
    );
    this.trendChartOptions = this.buildLineOption(
      trendData.map((d) => d.month),
      trendData.map((d) => d.value)
    );

    this.cd.markForCheck();
  }

  public onChartClick(type: FilterType, params: any): void {
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

  trackByWidgetId(index: number, item: WidgetData): string {
    return item.id;
  }

  public navigateToDetail(device: ActionableDevice): void {
    if (device && device.Id) {
      this.router.navigate(['/app/equipment/catalog', device.Id]);
    }
  }

  // --- CHART BUILDER FUNCTIONS ---

  private buildDonutOption(data: DeviceStatsData[]): EChartsCoreOption {
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
  ): EChartsCoreOption {
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
  ): EChartsCoreOption {
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
            color: {
              type: 'linear',
              x: 0,
              y: 0,
              x2: 0,
              y2: 1,
              colorStops: [
                { offset: 0, color: chartColor },
                { offset: 1, color: this.cssVars.white },
              ]
            },
          },
        },
      ],
    };
  }
}