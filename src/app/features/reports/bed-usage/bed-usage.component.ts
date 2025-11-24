import {
  Component,
  OnInit,
  inject,
  ChangeDetectionStrategy,
  DestroyRef,
  signal,
  computed,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { finalize } from 'rxjs/operators';
import { timer } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import type { EChartsCoreOption } from 'echarts/core';

import { WidgetCardComponent } from '../../../components/widget-card/widget-card.component';
import { ChartCardComponent } from '../../../components/chart-card/chart-card.component';
import { environment } from '../../../../environments/environment.development';
import {
  ThemeService,
  ThemePalette,
} from '../../../core/services/theme.service';

const GLOBAL_FONT_FAMILY =
  'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
const AUTO_REFRESH_INTERVAL = 60_000;
const CHART_BAR_WIDTH = '60%';

interface ApiResponseData {
  TenPhongBan: string;
  Tong: number;
  GiuongTrong: number;
  DangSuDung: number;
  ChoXuatVien: number;
  DaBook: number;
  ChuaSanSang: number;
  ChoMuonGiuong: number;
}

interface DepartmentChartData {
  viName: string;
  enName: string;
  totalBeds: number;
  giuongTrong: number;
  dangDieuTri: number;
  choXuatVien: number;
  daBook: number;
  chuaSanSang: number;
  choMuonGiuong: number;
}

interface WidgetData {
  id: string;
  icon: string;
  title: string;
  value: string;
  caption: string;
  accentColor: string;
}

interface BedStatusSeries {
  name: string;
  dataKey: keyof DepartmentChartData;
  color: string;
}

@Component({
  selector: 'app-bed-usage',
  standalone: true,
  imports: [CommonModule, WidgetCardComponent, ChartCardComponent],
  templateUrl: './bed-usage.component.html',
  styleUrl: './bed-usage.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BedUsageComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly destroyRef = inject(DestroyRef);
  public readonly themeService = inject(ThemeService);

  public isLoading = signal<boolean>(true);
  public currentDateTime = signal<string>('');
  private rawData = signal<ApiResponseData[]>([]);
  private visibleSeriesMap = signal<Record<string, boolean> | null>(null);

  public widgetData = computed<WidgetData[]>(() => {
    const data = this.rawData();
    const palette = this.themeService.currentPalette();
    const totals = this.calculateTotals(data);
    return this.buildWidgetList(totals, palette);
  });

  public chartOptions = computed<EChartsCoreOption | null>(() => {
    const data = this.rawData();
    const palette = this.themeService.currentPalette();
    const visibleMap = this.visibleSeriesMap();

    if (data.length === 0) return null;

    const chartData = this.transformApiData(data);
    chartData.sort((a, b) => a.viName.localeCompare(b.viName));
    
    return this.buildChartOptions(chartData, palette, visibleMap);
  });

  private isRefreshing = false;

  ngOnInit(): void {
    timer(0, AUTO_REFRESH_INTERVAL)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.loadData();
      });
  }

  public loadData(): void {
    if (this.isRefreshing) return;

    if (this.rawData().length === 0) {
      this.isLoading.set(true);
    } else {
      this.isRefreshing = true;
    }

    this.http
      .get<ApiResponseData[]>(environment.bedUsageUrl)
      .pipe(
        finalize(() => this.handleRequestComplete()),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe({
        next: (data) => {
          this.rawData.set(data);
        },
        error: (error) => this.handleDataError(error),
      });
  }

  public onLegendChange(params: { name: string; selected: Record<string, boolean> }): void {
    this.visibleSeriesMap.set(params.selected);
  }

  private handleRequestComplete(): void {
    this.isLoading.set(false);
    this.isRefreshing = false;
    this.updateCurrentDateTime();
  }

  private updateCurrentDateTime(): void {
    const now = new Date().toLocaleString('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
    this.currentDateTime.set(now);
  }

  private handleDataError(error: HttpErrorResponse): void {
    console.error('Failed to load bed usage data:', error);
    this.rawData.set([]);
  }

  private calculateTotals(apiData: ApiResponseData[]) {
    return apiData.reduce(
      (acc, item) => ({
        giuongTrong: acc.giuongTrong + item.GiuongTrong,
        dangDieuTri: acc.dangDieuTri + item.DangSuDung,
        choXuatVien: acc.choXuatVien + item.ChoXuatVien,
        daBook: acc.daBook + item.DaBook,
        chuaSanSang: acc.chuaSanSang + item.ChuaSanSang,
        choMuonGiuong: acc.choMuonGiuong + item.ChoMuonGiuong,
        totalBeds: acc.totalBeds + item.Tong,
      }),
      {
        giuongTrong: 0,
        dangDieuTri: 0,
        choXuatVien: 0,
        daBook: 0,
        chuaSanSang: 0,
        choMuonGiuong: 0,
        totalBeds: 0,
      }
    );
  }

  private buildWidgetList(totals: any, palette: ThemePalette): WidgetData[] {
    const occupied =
      totals.dangDieuTri +
      totals.choXuatVien +
      totals.daBook +
      totals.chuaSanSang +
      totals.choMuonGiuong;
    
    const rate = totals.totalBeds > 0 ? (occupied / totals.totalBeds) * 100 : 0;
    const occupancyRate = `${rate.toFixed(1).replace('.', ',')}%`;

    const format = (val: number) => new Intl.NumberFormat('vi-VN').format(val);

    return [
      {
        id: 'occupancyRate',
        title: 'Công Suất',
        value: occupancyRate,
        caption: 'Occupancy Rate',
        icon: 'fas fa-chart-pie',
        accentColor: palette.chart1,
      },
      {
        id: 'totalBeds',
        title: 'Tổng Số',
        value: format(totals.totalBeds),
        caption: 'Total Beds',
        icon: 'fas fa-hospital',
        accentColor: palette.chart2,
      },
      {
        id: 'giuongTrong',
        title: 'Giường Trống',
        value: format(totals.giuongTrong),
        caption: 'Vacant Beds',
        icon: 'fas fa-check-circle',
        accentColor: palette.chart3,
      },
      {
        id: 'dangDieuTri',
        title: 'Đang Điều Trị',
        value: format(totals.dangDieuTri),
        caption: 'In Treatment',
        icon: 'fas fa-user-injured',
        accentColor: palette.chart1,
      },
      {
        id: 'choXuatVien',
        title: 'Chờ Xuất Viện',
        value: format(totals.choXuatVien),
        caption: 'Awaiting Discharge',
        icon: 'fas fa-door-open',
        accentColor: palette.chart8,
      },
      {
        id: 'daBook',
        title: 'Đã Book',
        value: format(totals.daBook),
        caption: 'Booked Beds',
        icon: 'fas fa-bookmark',
        accentColor: palette.chart6,
      },
      {
        id: 'chuaSanSang',
        title: 'Chưa Sẵn Sàng',
        value: format(totals.chuaSanSang),
        caption: 'Not Ready',
        icon: 'fas fa-tools',
        accentColor: palette.chart7,
      },
      {
        id: 'choMuonGiuong',
        title: 'Cho Mượn Giường',
        value: format(totals.choMuonGiuong),
        caption: 'On Loan',
        icon: 'fas fa-hand-holding-medical',
        accentColor: palette.chart9,
      },
    ];
  }

  private transformApiData(apiData: ApiResponseData[]): DepartmentChartData[] {
    return apiData.map((item) => {
      let cleanName = item.TenPhongBan.replace(
        /\s*-?\s*\(Σ:\s*\d+\)\s*$/,
        ''
      ).trim();
      let viName = cleanName;
      let enName = '';

      if (cleanName.includes('\n')) {
        const parts = cleanName.split('\n');
        viName = parts[0].trim();
        enName = parts.slice(1).join(' ').trim();
      } else {
        const match = cleanName.match(/^(.+?)\s+([A-Z][a-zA-Z\s&()]+)$/);
        if (match) {
          viName = match[1].trim();
          enName = match[2].trim();
        }
      }

      return {
        viName,
        enName,
        totalBeds: item.Tong,
        giuongTrong: item.GiuongTrong,
        dangDieuTri: item.DangSuDung,
        choXuatVien: item.ChoXuatVien,
        daBook: item.DaBook,
        chuaSanSang: item.ChuaSanSang,
        choMuonGiuong: item.ChoMuonGiuong,
      };
    });
  }

  private buildChartOptions(
    data: DepartmentChartData[], 
    palette: ThemePalette,
    visibleMap: Record<string, boolean> | null
  ): EChartsCoreOption {
    
    const xAxisData = data.map((item) =>
      item.enName ? `${item.viName}\n(${item.enName})` : item.viName
    );

    const bedStatusSeries: BedStatusSeries[] = [
      { name: 'Giường trống (Vacant)', dataKey: 'giuongTrong', color: palette.chart3 },
      { name: 'Đang điều trị (In Treatment)', dataKey: 'dangDieuTri', color: palette.chart1 },
      { name: 'Chờ xuất viện (Awaiting Discharge)', dataKey: 'choXuatVien', color: palette.chart8 },
      { name: 'Đã book (Booked)', dataKey: 'daBook', color: palette.chart6 },
      { name: 'Chưa sẵn sàng (Not Ready)', dataKey: 'chuaSanSang', color: palette.chart7 },
      { name: 'Cho mượn giường (On Loan)', dataKey: 'choMuonGiuong', color: palette.chart9 },
    ];

    const dynamicTotals = data.map(dept => {
      let sum = 0;
      bedStatusSeries.forEach(s => {
        if (visibleMap === null || visibleMap[s.name] !== false) {
          sum += (dept[s.dataKey] as number);
        }
      });
      return sum;
    });

    return {
      backgroundColor: 'transparent',
      textStyle: {
        fontFamily: GLOBAL_FONT_FAMILY,
        fontSize: 12,
        color: palette.textPrimary,
      },
      tooltip: {
        trigger: 'axis',
        backgroundColor: palette.bgCard,
        borderColor: palette.gray200,
        textStyle: { color: palette.textPrimary },
        axisPointer: {
          type: 'shadow',
          shadowStyle: { color: 'rgba(0, 0, 0, 0.05)' },
        },
        formatter: this.createTooltipFormatter(data, palette),
      },
      legend: {
        data: bedStatusSeries.map((s) => s.name),
        top: '2%',
        left: 'center',
        type: 'scroll',
        textStyle: { fontSize: 10, color: palette.textSecondary },
      },
      grid: {
        left: '5%',
        right: '5%',
        bottom: '15%',
        containLabel: true,
      },
      xAxis: {
        type: 'category',
        data: xAxisData,
        axisLabel: {
          interval: 0,
          rotate: 45,
          fontSize: 10,
          fontWeight: 'bold',
          overflow: 'truncate',
          color: palette.textPrimary,
        },
        axisLine: {
          lineStyle: { color: palette.secondary },
        },
      },
      yAxis: {
        type: 'value',
        name: 'Tổng Số Giường (Total)',
        nameLocation: 'middle',
        nameGap: 40,
        splitLine: {
          lineStyle: {
            color: palette.gray200,
            type: 'dotted',
          },
        },
      },
      series: [
        ...bedStatusSeries.map((config) => ({
          name: config.name,
          type: 'bar',
          stack: 'beds',
          barWidth: CHART_BAR_WIDTH,
          itemStyle: {
            color: config.color,
            borderRadius: [4, 4, 0, 0],
            borderColor: palette.bgCard,
            borderWidth: 1,
          },
          data: data.map((item) => item[config.dataKey]),
          label: {
            show: true,
            position: 'inside',
            color: '#fff',
            fontSize: 9,
            formatter: (p: any) => (p.value > 0 ? p.value : ''),
          },
        })),
        {
          name: 'Tổng (Total)',
          type: 'bar',
          barGap: '-100%',
          barWidth: CHART_BAR_WIDTH,
          data: dynamicTotals,
          itemStyle: { color: 'transparent' },
          label: {
            show: true,
            position: 'top',
            color: '#ffffff',
            // [UPDATED] Use a neutral gray for the badge background
            backgroundColor: palette.gray600,
            padding: [3, 6],
            borderRadius: 4,
            fontWeight: 'bold',
            fontSize: 11,
            formatter: '{c}',
            distance: 5,
            shadowBlur: 2,
            shadowColor: 'rgba(0,0,0,0.2)',
            shadowOffsetY: 1
          },
          tooltip: { show: false },
          z: 10,
          silent: true,
        } as any,
      ],
    };
  }

  private createTooltipFormatter(data: DepartmentChartData[], palette: ThemePalette) {
    return (params: any): string => {
      if (!params?.length) return '';
      const idx = params[0].dataIndex;
      const item = data[idx];

      let result = `<div style="font-weight:bold;margin-bottom:5px;">${item.viName}</div>`;
      if (item.enName)
        result += `<div style="color:${palette.textSecondary};font-size:11px;margin-bottom:8px;">${item.enName}</div>`;
      
      let visibleTotal = 0;

      params.forEach((p: any) => {
        if (p.seriesName === 'Tổng (Total)') return; 
        if (p.value !== 0) {
            result += `<div>${p.marker} ${p.seriesName}: <b>${p.value}</b></div>`;
        }
        visibleTotal += (typeof p.value === 'number' ? p.value : 0);
      });
      
      result += `<div style="margin-top:5px;padding-top:5px;border-top:1px solid ${palette.gray200};">Total: <b>${visibleTotal}</b></div>`;
      return result;
    };
  }

  public trackByWidgetId(_index: number, item: WidgetData): string {
    return item.id;
  }
}