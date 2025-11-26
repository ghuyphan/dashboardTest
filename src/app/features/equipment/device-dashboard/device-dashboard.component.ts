import {
  Component,
  OnInit,
  inject,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  effect,
  DestroyRef,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { finalize } from 'rxjs/operators';
import { Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import type { EChartsCoreOption } from 'echarts/core';

import { Device } from '../../../shared/models/device.model';
import { ToastService } from '../../../core/services/toast.service';
import { WidgetCardComponent } from '../../../components/widget-card/widget-card.component';
import { ChartCardComponent } from '../../../components/chart-card/chart-card.component';
import { GridColumn } from '../../../components/reusable-table/reusable-table.component';
import { TableCardComponent } from '../../../components/table-card/table-card.component';
import { DateUtils } from '../../../shared/utils/date.utils';
import {
  ThemeService,
  ThemePalette,
} from '../../../core/services/theme.service';
import { DeviceService } from '../../../core/services/device.service';

const GLOBAL_FONT_FAMILY =
  'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

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
    ChartCardComponent,
    TableCardComponent,
  ],
  templateUrl: './device-dashboard.component.html',
  styleUrl: './device-dashboard.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DeviceDashboardComponent implements OnInit {
  private deviceService = inject(DeviceService);
  private cd = inject(ChangeDetectorRef);
  private toastService = inject(ToastService);
  private router = inject(Router);
  private destroyRef = inject(DestroyRef); // [1] Inject DestroyRef
  public readonly themeService = inject(ThemeService);

  public isLoading = false;
  private allDevices: Device[] = [];

  public currentFilter: ChartFilter | null = null;
  public visibleFilter: ChartFilter | null = null;
  private filterTransitionTimer: any;

  public widgetData: WidgetData[] = [];
  public statusChartOptions: EChartsCoreOption | null = null;
  public categoryChartOptions: EChartsCoreOption | null = null;
  public locationChartOptions: EChartsCoreOption | null = null;
  public trendChartOptions: EChartsCoreOption | null = null;

  public attentionDevices: ActionableDevice[] = [];
  public expiringDevices: ActionableDevice[] = [];

  public statusChartSubtext = '';
  public locationChartTitle = '';

  public attentionTableColumns: GridColumn[] = [
    { key: 'Ten', label: 'Tên Thiết Bị (Mã)', sortable: true, width: '50%' },
    { key: 'ViTri', label: 'Vị Trí', sortable: true, width: '25%' },
    { key: 'TrangThai_Ten', label: 'Trạng Thái', sortable: true, width: '25%' },
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

  private palette!: ThemePalette;
  private statusColorMap = new Map<string, string>();

  constructor() {
    // Ensure timer is cleared if component is destroyed
    this.destroyRef.onDestroy(() => {
      clearTimeout(this.filterTransitionTimer);
    });

    effect(() => {
      this.palette = this.themeService.currentPalette();
      this.initializePaletteMaps();

      if (!this.isLoading && this.allDevices.length > 0) {
        this.refilterAndRenderAll();
      }
      this.cd.markForCheck();
    });
  }

  ngOnInit(): void {
    this.palette = this.themeService.currentPalette();
    this.initializePaletteMaps();
    this.initializeWidgetsStructure();

    this.isLoading = true;
    this.cd.markForCheck();
    this.loadData();
  }

  private initializePaletteMaps(): void {
    this.statusColorMap.set('Sẵn sàng', this.palette.success);
    this.statusColorMap.set('Đang sử dụng', this.palette.peacockLight);
    this.statusColorMap.set('Cần bảo trì', this.palette.warning);
    this.statusColorMap.set('Đang bảo trì', this.palette.gray500);
    this.statusColorMap.set('Hỏng', this.palette.danger);
    this.statusColorMap.set('Thanh lý', this.palette.danger);
    this.statusColorMap.set('Đã Book', this.palette.chart6);
    this.statusColorMap.set('Cho mượn', this.palette.chart9);
    this.statusColorMap.set('Khác', this.palette.gray400);

    if (this.widgetData.length > 0) {
      const w = this.widgetData;
      w.find((x) => x.id === 'totalDevices')!.accentColor = this.palette.primary;
      w.find((x) => x.id === 'attentionValue')!.accentColor = this.palette.warning;
      w.find((x) => x.id === 'inUse')!.accentColor = this.palette.info;
      w.find((x) => x.id === 'ready')!.accentColor = this.palette.success;
      w.find((x) => x.id === 'needsAttention')!.accentColor = this.palette.warning;
      w.find((x) => x.id === 'expiring')!.accentColor = this.palette.danger;
    }
  }

  private initializeWidgetsStructure(): void {
    this.widgetData = [
      {
        id: 'totalDevices',
        icon: 'fas fa-server',
        title: 'Tổng Thiết Bị',
        value: '0',
        caption: 'Total Devices',
        accentColor: this.palette.primary,
      },
      {
        id: 'attentionValue',
        icon: 'fas fa-dollar-sign',
        title: 'Giá trị TB cần sửa',
        value: '0 ₫',
        caption: 'Value of Attention Devices',
        accentColor: this.palette.warning,
      },
      {
        id: 'inUse',
        icon: 'fas fa-power-off',
        title: 'Đang Sử Dụng',
        value: '0',
        caption: 'In Use',
        accentColor: this.palette.info,
      },
      {
        id: 'ready',
        icon: 'fas fa-check-circle',
        title: 'Sẵn Sàng',
        value: '0',
        caption: 'Ready',
        accentColor: this.palette.success,
      },
      {
        id: 'needsAttention',
        icon: 'fas fa-exclamation-triangle',
        title: 'Cần Chú Ý',
        value: '0',
        caption: 'Needs Attention',
        accentColor: this.palette.warning,
      },
      {
        id: 'expiring',
        icon: 'fas fa-calendar-times',
        title: 'Sắp Hết BH',
        value: '0',
        caption: 'Warranty Expiring',
        accentColor: this.palette.danger,
      },
    ];
  }

  public loadData(): void {
    this.deviceService
      .getAllDevices()
      .pipe(
        finalize(() => {
          this.isLoading = false;
          this.cd.markForCheck();
        }),
        takeUntilDestroyed(this.destroyRef) // [2] Modern cancellation
      )
      .subscribe({
        next: (data) => {
          this.allDevices = data;
          this.refilterAndRenderAll();
        },
        error: (err) => {
          console.error(err);
          this.toastService.showError('Không thể tải dữ liệu thiết bị.');
        },
      });
  }

  private refilterAndRenderAll(): void {
    let filteredDevices = this.allDevices;

    if (this.currentFilter) {
      const { type, name } = this.currentFilter;
      if (type === 'status')
        filteredDevices = this.allDevices.filter(
          (d) => (d.TrangThai_Ten || 'Không xác định') === name
        );
      else if (type === 'category')
        filteredDevices = this.allDevices.filter(
          (d) => (d.TenLoaiThietBi || 'Không xác định') === name
        );
      else if (type === 'location') {
        filteredDevices = this.allDevices.filter((d) => {
          const st = (d.TrangThai_Ten || '').toLowerCase();
          return (
            (st.includes('bảo trì') ||
              st.includes('hỏng') ||
              st.includes('sửa chữa')) &&
            (d.ViTri || 'Không xác định') === name
          );
        });
      }
    }

    const stats = this.aggregateGeneralData(filteredDevices);
    this.updateWidgets(stats.widgetData);
    this.attentionDevices = stats.attentionDevices;
    this.expiringDevices = stats.expiringDevices;

    const statusData =
      this.currentFilter?.type === 'status'
        ? this.aggregateStatus(this.allDevices)
        : this.aggregateStatus(filteredDevices);

    const categoryData = (
      this.currentFilter?.type === 'category'
        ? this.aggregateCategory(this.allDevices)
        : this.aggregateCategory(filteredDevices)
    ).sort((a, b) => b.value - a.value);

    const locationData = (
      this.currentFilter?.type === 'location'
        ? this.aggregateLocation(this.allDevices)
        : this.aggregateLocation(filteredDevices)
    )
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);

    const highlight = this.currentFilter?.name;

    this.statusChartOptions = statusData.length
      ? this.buildDonutOption(
          statusData,
          this.currentFilter?.type === 'status' ? highlight : undefined
        )
      : null;

    this.categoryChartOptions = categoryData.length
      ? this.buildBarOption(
          categoryData.map((d) => d.name).reverse(),
          categoryData.map((d) => d.value).reverse(),
          this.palette.primary,
          this.currentFilter?.type === 'category' ? highlight : undefined
        )
      : null;

    this.locationChartOptions = locationData.length
      ? this.buildBarOption(
          locationData.map((d) => d.name).reverse(),
          locationData.map((d) => d.value).reverse(),
          this.palette.secondary,
          this.currentFilter?.type === 'location' ? highlight : undefined
        )
      : null;

    this.trendChartOptions = stats.trendData.length
      ? this.buildLineOption(
          stats.trendData.map((d) => d.month),
          stats.trendData.map((d) => d.value)
        )
      : null;

    this.statusChartSubtext = `Tổng số: ${this.formatNumber(
      filteredDevices.length
    )}`;
    this.locationChartTitle = this.currentFilter
      ? 'Vị Trí (Đã lọc)'
      : 'Vị Trí Có TB Cần Chú Ý (Top 10)';

    this.cd.markForCheck();
  }

  private aggregateStatus(devices: Device[]) {
    const map = new Map<string, number>();
    devices.forEach((d) => {
      const k = d.TrangThai_Ten || 'N/A';
      map.set(k, (map.get(k) || 0) + 1);
    });
    return Array.from(map, ([TenTrangThai, SoLuong]) => ({
      TenTrangThai,
      SoLuong,
    }));
  }
  private aggregateCategory(devices: Device[]) {
    const map = new Map<string, number>();
    devices.forEach((d) => {
      const k = d.TenLoaiThietBi || 'N/A';
      map.set(k, (map.get(k) || 0) + 1);
    });
    return Array.from(map, ([name, value]) => ({ name, value }));
  }
  private aggregateLocation(devices: Device[]) {
    const map = new Map<string, number>();
    devices.forEach((d) => {
      const st = (d.TrangThai_Ten || '').toLowerCase();
      if (
        st.includes('bảo trì') ||
        st.includes('hỏng') ||
        st.includes('sửa chữa')
      ) {
        const k = d.ViTri || 'N/A';
        map.set(k, (map.get(k) || 0) + 1);
      }
    });
    return Array.from(map, ([name, value]) => ({ name, value }));
  }
  private aggregateGeneralData(devices: Device[]) {
    const trendMap = new Map<string, number>();
    const attentionDevices: ActionableDevice[] = [];
    const expiringDevices: ActionableDevice[] = [];
    let attentionValue = 0,
      inUse = 0,
      ready = 0;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const in30Days = new Date(today.getTime() + 30 * 86400000);

    devices.forEach((d) => {
      const st = (d.TrangThai_Ten || '').toLowerCase();
      if (st.includes('đang sử dụng')) inUse++;
      if (st.includes('sẵn sàng')) ready++;

      if (
        st.includes('bảo trì') ||
        st.includes('hỏng') ||
        st.includes('sửa chữa')
      ) {
        attentionDevices.push({
          Id: d.Id!,
          Ten: d.Ten,
          Ma: d.Ma,
          ViTri: d.ViTri || 'N/A',
          TrangThai_Ten: d.TrangThai_Ten,
        });
        attentionValue += d.GiaMua || 0;
      }

      if (d.NgayHetHanBH) {
        const exp = DateUtils.parse(d.NgayHetHanBH);
        if (exp && exp >= today && exp <= in30Days) {
          expiringDevices.push({
            Id: d.Id!,
            Ten: d.Ten,
            Ma: d.Ma,
            ViTri: d.ViTri || 'N/A',
            NgayHetHanBH: DateUtils.formatToDisplay(d.NgayHetHanBH),
          });
        }
      }

      if (d.NgayTao) {
        const cd = DateUtils.parse(d.NgayTao);
        if (cd) {
          const key = `${cd.getFullYear()}-${(cd.getMonth() + 1)
            .toString()
            .padStart(2, '0')}`;
          trendMap.set(key, (trendMap.get(key) || 0) + 1);
        }
      }
    });

    const trendData = Array.from(trendMap, ([month, value]) => ({
      month,
      value,
    })).sort((a, b) => a.month.localeCompare(b.month));
    return {
      trendData,
      attentionDevices,
      expiringDevices,
      widgetData: {
        totalDevices: devices.length,
        attentionValue,
        inUse,
        ready,
        needsAttention: attentionDevices.length,
        expiring: expiringDevices.length,
      },
    };
  }

  private updateWidgets(data: any): void {
    const update = (id: string, val: string) => {
      const w = this.widgetData.find((x) => x.id === id);
      if (w) w.value = val;
    };
    update('totalDevices', this.formatNumber(data.totalDevices));
    update(
      'attentionValue',
      new Intl.NumberFormat('vi-VN', {
        style: 'currency',
        currency: 'VND',
      }).format(data.attentionValue)
    );
    update('inUse', this.formatNumber(data.inUse));
    update('ready', this.formatNumber(data.ready));
    update('needsAttention', this.formatNumber(data.needsAttention));
    update('expiring', this.formatNumber(data.expiring));
  }

  private buildDonutOption(
    data: DeviceStatsData[],
    highlight?: string
  ): EChartsCoreOption {
    const chartData = data.map((item) => ({
      name: item.TenTrangThai,
      value: item.SoLuong,
      itemStyle: {
        color:
          this.statusColorMap.get(item.TenTrangThai) || this.palette.gray400,
        opacity: highlight && item.TenTrangThai !== highlight ? 0.3 : 1,
      },
    }));

    return {
      backgroundColor: 'transparent',
      textStyle: { fontFamily: GLOBAL_FONT_FAMILY },
      tooltip: {
        trigger: 'item',
        backgroundColor: this.palette.bgCard,
        textStyle: { color: this.palette.textPrimary },
        borderColor: this.palette.gray200,
      },
      legend: {
        orient: 'vertical',
        left: '4%',
        top: 'center',
        textStyle: { color: this.palette.textSecondary },
      },
      series: [
        {
          type: 'pie',
          radius: ['50%', '75%'],
          center: ['65%', '50%'],
          data: chartData,
          label: {
            show: true,
            position: 'outer',
            color: this.palette.textPrimary,
            formatter: '{b}: {c} ({d}%)'
          },
        },
      ],
    };
  }

  private buildBarOption(
    y: string[],
    x: number[],
    color: string,
    highlight?: string
  ): EChartsCoreOption {
    const seriesData = x.map((val, i) => ({
      value: val,
      itemStyle: {
        color: color,
        opacity: highlight && y[i] !== highlight ? 0.3 : 1,
        borderRadius: [0, 4, 4, 0],
      },
    }));

    return {
      backgroundColor: 'transparent',
      textStyle: {
        fontFamily: GLOBAL_FONT_FAMILY,
        color: this.palette.textSecondary,
      },
      grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
      tooltip: {
        trigger: 'axis',
        backgroundColor: this.palette.bgCard,
        borderColor: this.palette.gray200,
        textStyle: { color: this.palette.textPrimary },
      },
      xAxis: {
        type: 'value',
        splitLine: {
          lineStyle: { color: this.palette.gray200, type: 'dotted' },
        },
      },
      yAxis: {
        type: 'category',
        data: y,
        axisLabel: { width: 110, overflow: 'truncate' },
      },
      series: [
        {
          type: 'bar',
          data: seriesData,
          label: {
            show: true,
            position: 'right',
            color: this.palette.textSecondary,
          },
        },
      ],
    };
  }

  private buildLineOption(x: string[], y: number[]): EChartsCoreOption {
    return {
      backgroundColor: 'transparent',
      textStyle: {
        fontFamily: GLOBAL_FONT_FAMILY,
        color: this.palette.textSecondary,
      },
      tooltip: {
        trigger: 'axis',
        backgroundColor: this.palette.bgCard,
        borderColor: this.palette.gray200,
        textStyle: { color: this.palette.textPrimary },
      },
      grid: { left: '3%', right: '4%', containLabel: true },
      xAxis: { type: 'category', data: x, boundaryGap: false },
      yAxis: {
        type: 'value',
        splitLine: {
          lineStyle: { color: this.palette.gray200, type: 'dotted' },
        },
      },
      series: [
        {
          type: 'line',
          smooth: true,
          data: y,
          itemStyle: { color: this.palette.primary },
          areaStyle: {
            color: {
              type: 'linear',
              x: 0,
              y: 0,
              x2: 0,
              y2: 1,
              colorStops: [
                { offset: 0, color: this.palette.primary },
                { offset: 1, color: this.palette.bgCard },
              ],
            },
          },
        },
      ],
    };
  }

  formatNumber(val: number) {
    return new Intl.NumberFormat('vi-VN').format(val);
  }

  onChartClick(type: FilterType, params: any) {
    const name = params.name;
    if (!name) return;
    clearTimeout(this.filterTransitionTimer);
    if (this.currentFilter?.type === type && this.currentFilter.name === name)
      this.clearFilter();
    else {
      this.currentFilter = { type, name };
      this.visibleFilter = { type, name };
      this.refilterAndRenderAll();
    }
  }

  clearFilter() {
    this.currentFilter = null;
    this.refilterAndRenderAll();
    this.filterTransitionTimer = setTimeout(() => {
      this.visibleFilter = null;
      this.cd.markForCheck();
    }, 300);
  }

  navigateToDetail(d: any) {
    if (d?.Id) this.router.navigate(['/app/equipment/catalog', d.Id]);
  }

  trackByWidgetId(i: number, item: WidgetData) {
    return item.id;
  }
}