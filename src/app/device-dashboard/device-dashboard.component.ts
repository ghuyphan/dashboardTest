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
  if (typeof document === 'undefined') return '';
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
    // Safely get CSS variables if in browser
    if (typeof window !== 'undefined') {
      setTimeout(() => this.initColors(), 0);
    }
    
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
    const c = getCssVar;
    // Helper to update vars if available
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
          // Set to null to trigger empty state
          this.statusChartOptions = null;
          this.categoryChartOptions = null;
          this.locationChartOptions = null;
          this.trendChartOptions = null;
        },
      });
  }

  private refilterAndRenderAll(): void {
    let filteredDevices = this.allDevices;

    // 1. Apply Filters to create the "Filtered Set" (Used for Grids, Widgets, and Drill-down charts)
    if (this.currentFilter) {
      const { type, name } = this.currentFilter;
      
      switch (type) {
        case 'status':
          filteredDevices = this.allDevices.filter(
            (d) => (d.TrangThai_Ten || 'Không xác định') === name
          );
          break;
        case 'category':
          filteredDevices = this.allDevices.filter(
            (d) => (d.TenLoaiThietBi || 'Không xác định') === name
          );
          break;
        case 'location':
          filteredDevices = this.allDevices.filter((d) => {
             // Special location logic
            const statusLower = (d.TrangThai_Ten || '').toLowerCase();
            const needsAttention =
              statusLower.includes('bảo trì') ||
              statusLower.includes('hỏng') ||
              statusLower.includes('sửa chữa');
            return (
              needsAttention && (d.ViTri || 'Không xác định') === name
            );
          });
          break;
      }
    }

    // 2. Calculate Widgets & Grids (Always use filtered set)
    const filteredAggregates = this.aggregateGeneralData(filteredDevices);
    this.updateWidgets(filteredAggregates.widgetData);
    this.attentionDevices = filteredAggregates.attentionDevices;
    this.expiringDevices = filteredAggregates.expiringDevices;

    // 3. Calculate Charts
    // STRATEGY: If a chart represents the ACTIVE FILTER, use ALL data + Highlight (Fade out others).
    // Otherwise, use FILTERED data (Drill-down behavior).

    // --- Status Chart Data ---
    let statusData: DeviceStatsData[];
    let highlightStatus: string | undefined;

    if (this.currentFilter?.type === 'status') {
       statusData = this.aggregateStatus(this.allDevices); // Show context (Full set)
       highlightStatus = this.currentFilter.name; // Highlight selected
    } else {
       statusData = this.aggregateStatus(filteredDevices); // Show filtered subset
    }

    // --- Category Chart Data ---
    let categoryData: AggregatedData[];
    let highlightCategory: string | undefined;

    if (this.currentFilter?.type === 'category') {
        categoryData = this.aggregateCategory(this.allDevices);
        highlightCategory = this.currentFilter.name;
    } else {
        categoryData = this.aggregateCategory(filteredDevices);
    }

    // --- Location Chart Data ---
    let locationData: AggregatedData[];
    let highlightLocation: string | undefined;

    if (this.currentFilter?.type === 'location') {
        locationData = this.aggregateLocation(this.allDevices);
        highlightLocation = this.currentFilter.name;
    } else {
        locationData = this.aggregateLocation(filteredDevices);
    }
    
    // Sort/Slice chart data
    categoryData.sort((a, b) => b.value - a.value);
    locationData.sort((a, b) => b.value - a.value).slice(0, 10); // Top 10 locations only

    // --- Trend Chart (Always uses filtered context) ---
    const trendData = filteredAggregates.trendData; 

    // 4. Render Charts (Assign Options or NULL for Empty State)

    // Status Chart
    const totalStatus = statusData.reduce((sum, item) => sum + item.SoLuong, 0);
    this.statusChartSubtext = this.currentFilter
      ? `Tổng (đã lọc): ${this.formatNumber(totalStatus)}`
      : `Tổng số: ${this.formatNumber(totalStatus)} thiết bị`;

    this.statusChartOptions = statusData.length > 0
      ? this.buildDonutOption(statusData, highlightStatus)
      : null; // Trigger empty state icon

    // Category Chart
    this.categoryChartOptions = categoryData.length > 0
      ? this.buildBarOption(
          categoryData.map((d) => d.name).reverse(),
          categoryData.map((d) => d.value).reverse(),
          this.cssVars.colorBlue,
          highlightCategory
        )
      : null;

    // Location Chart
    this.locationChartTitle = this.currentFilter
      ? `Vị trí (Đã lọc)`
      : `Vị trí có TB cần chú ý (Top 10)`;

    this.locationChartOptions = locationData.length > 0
      ? this.buildBarOption(
          locationData.map((d) => d.name).reverse(),
          locationData.map((d) => d.value).reverse(),
          this.cssVars.colorBlue,
          highlightLocation
        )
      : null;

    // Trend Chart
    this.trendChartOptions = trendData.length > 0
      ? this.buildLineOption(
          trendData.map((d) => d.month),
          trendData.map((d) => d.value)
        )
      : null;

    this.cd.markForCheck();
  }

  // --- Aggregation Helpers ---

  private aggregateStatus(devices: Device[]): DeviceStatsData[] {
    const statusMap = new Map<string, number>();
    devices.forEach(d => {
       const name = d.TrangThai_Ten || 'Không xác định';
       statusMap.set(name, (statusMap.get(name) || 0) + 1);
    });
    return Array.from(statusMap, ([TenTrangThai, SoLuong]) => ({ TenTrangThai, SoLuong }));
  }

  private aggregateCategory(devices: Device[]): AggregatedData[] {
    const map = new Map<string, number>();
    devices.forEach(d => {
       const name = d.TenLoaiThietBi || 'Không xác định';
       map.set(name, (map.get(name) || 0) + 1);
    });
    return Array.from(map, ([name, value]) => ({ name, value }));
  }

  private aggregateLocation(devices: Device[]): AggregatedData[] {
    const map = new Map<string, number>();
    devices.forEach(d => {
      // Special logic: Location chart only shows devices that need attention
      const statusLower = (d.TrangThai_Ten || '').toLowerCase();
      if (
        statusLower.includes('bảo trì') ||
        statusLower.includes('hỏng') ||
        statusLower.includes('sửa chữa')
      ) {
        const name = d.ViTri || 'Không xác định';
        map.set(name, (map.get(name) || 0) + 1);
      }
    });
    return Array.from(map, ([name, value]) => ({ name, value }));
  }

  private aggregateGeneralData(filteredDevices: Device[]) {
    // Reuses logic to calculate widgets, attention list, expiring list, and trend
    const trendMap = new Map<string, number>();
    const attentionDevices: ActionableDevice[] = [];
    const expiringDevices: ActionableDevice[] = [];

    let attentionValue = 0;
    let inUse = 0;
    let ready = 0;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const thirtyDaysFromNow = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000);
    const oneYearAgo = new Date(today.getTime() - 365 * 24 * 60 * 60 * 1000);

    for (const device of filteredDevices) {
      if (!device.Id) continue;
      const statusName = device.TrangThai_Ten || 'Không xác định';
      const statusLower = statusName.toLowerCase();

      if (statusLower.includes('đang sử dụng')) inUse++;
      else if (statusLower.includes('sẵn sàng')) ready++;

      // Trend
      if (device.NgayTao) {
        try {
          const createdDate = this.parseDate(device.NgayTao);
          if (createdDate && createdDate >= oneYearAgo) {
            const monthKey = `${createdDate.getFullYear()}-${(createdDate.getMonth() + 1).toString().padStart(2, '0')}`;
            trendMap.set(monthKey, (trendMap.get(monthKey) || 0) + 1);
          }
        } catch (e) {}
      }

      // Attention
      const needsAttentionCheck = statusLower.includes('bảo trì') || statusLower.includes('hỏng') || statusLower.includes('sửa chữa');
      if (needsAttentionCheck) {
        attentionDevices.push({
          Id: device.Id,
          Ten: `${device.Ten} (${device.Ma})`,
          Ma: device.Ma,
          ViTri: device.ViTri || 'N/A',
          TrangThai_Ten: device.TrangThai_Ten,
        });
        const price = this.parseValue(device.GiaMua);
        if (!isNaN(price)) attentionValue += price;
      }

      // Expiring
      if (device.NgayHetHanBH) {
        try {
          const expiryDate = this.parseDate(device.NgayHetHanBH);
          const isExpiringCheck = expiryDate && expiryDate <= thirtyDaysFromNow && expiryDate >= today;
          if (isExpiringCheck) {
            expiringDevices.push({
              Id: device.Id,
              Ten: `${device.Ten} (${device.Ma})`,
              Ma: device.Ma,
              ViTri: device.ViTri || 'N/A',
              NgayHetHanBH: this.formatDate(device.NgayHetHanBH),
            });
          }
        } catch (e) {}
      }
    }

    const trendData = Array.from(trendMap, ([month, value]) => ({ month, value })).sort((a, b) => a.month.localeCompare(b.month));

    expiringDevices.sort((a, b) => this.parseDate(a.NgayHetHanBH!)!.getTime() - this.parseDate(b.NgayHetHanBH!)!.getTime());

    const widgetData = {
      totalDevices: filteredDevices.length,
      attentionValue,
      inUse,
      ready,
      needsAttention: attentionDevices.length,
      expiring: expiringDevices.length,
    };

    return { trendData, attentionDevices, expiringDevices, widgetData };
  }

  private updateWidgets(data: any): void {
    this.updateWidgetValue('totalDevices', this.formatNumber(data.totalDevices));
    this.updateWidgetValue('attentionValue', this.formatCurrency(data.attentionValue));
    this.updateWidgetValue('inUse', this.formatNumber(data.inUse));
    this.updateWidgetValue('ready', this.formatNumber(data.ready));
    this.updateWidgetValue('needsAttention', this.formatNumber(data.needsAttention));
    this.updateWidgetValue('expiring', this.formatNumber(data.expiring));
  }

  public onChartClick(type: FilterType, params: any): void {
    const clickedName = params.name;
    if (!clickedName) return;

    clearTimeout(this.filterTransitionTimer);

    // Toggle logic: If clicking the same filter, clear it.
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

  private buildDonutOption(data: DeviceStatsData[], highlightName?: string): EChartsCoreOption {
    const chartData = data.map((item) => {
      // Fade out items that don't match the highlightName (if one exists)
      const opacity = (highlightName && item.TenTrangThai !== highlightName) ? 0.2 : 1;
      
      return {
        name: item.TenTrangThai,
        value: item.SoLuong,
        itemStyle: {
          color: this.statusColorMap.get(item.TenTrangThai) || this.cssVars.colorDefault,
          opacity: opacity
        },
      };
    });

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
    color: string = this.cssVars.colorBlue,
    highlightName?: string
  ): EChartsCoreOption {
    
    // Map simple data to object with styles to apply fading
    const formattedData = seriesData.map((val, index) => {
      const name = yAxisData[index];
      // Fade out items that don't match the highlightName
      const opacity = (highlightName && name !== highlightName) ? 0.2 : 1;
      
      return {
        value: val,
        itemStyle: {
          color: color,
          opacity: opacity,
          borderRadius: [0, 4, 4, 0],
        }
      };
    });

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
          data: formattedData,
          // Global itemStyle is fallback, specific itemStyle in data overrides it
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