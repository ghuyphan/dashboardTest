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
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { finalize } from 'rxjs/operators';

// --- ECHARTS IMPORTS ---
import * as echarts from 'echarts/core';
import type { EChartsType, EChartsCoreOption } from 'echarts/core';
import { CanvasRenderer } from 'echarts/renderers';
import { BarChart } from 'echarts/charts';
import {
  TitleComponent,
  TooltipComponent,
  GridComponent,
  LegendComponent,
  DataZoomComponent, // 1. IMPORTED DataZoom
} from 'echarts/components';
import { WidgetCardComponent } from '../components/widget-card/widget-card.component';
import { environment } from '../../environments/environment.development';

echarts.use([
  CanvasRenderer,
  BarChart,
  TitleComponent,
  TooltipComponent,
  GridComponent,
  LegendComponent,
  DataZoomComponent, // 2. ADDED DataZoom
]);

type EChartsOption = EChartsCoreOption;

// --- STYLING CONSTANTS ---
const GLOBAL_FONT_FAMILY =
  'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

// --- Helper: Read CSS custom property ---
function getCssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

// --- INTERFACES ---
interface ApiResponseData {
  TenPhongBan: string;
  PhongBan_Id: number;
  Tang: number;
  GiuongTrong: number;
  DangSuDung: number;
  ChoXuatVien: number;
  DaBook: number;
  ChuaSanSang: number;
  ChoMuonGiuong: number;
  Tong: number;
}

interface DepartmentChartData {
  tenPhongBan: string;
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

interface BedStatusSeries {
  name: string;
  dataKey: keyof Omit<DepartmentChartData, 'viName' | 'enName' | 'totalBeds'>;
  color: string;
}

interface WidgetData {
  id: string;
  icon: string;
  title: string;
  value: string;
  caption: string;
  accentColor: string;
}

@Component({
  selector: 'app-bed-usage',
  standalone: true,
  imports: [CommonModule, WidgetCardComponent],
  templateUrl: './bed-usage.component.html',
  styleUrl: './bed-usage.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush, // 3. ADDED OnPush
})
export class BedUsageComponent implements OnInit, OnDestroy, AfterViewInit { // 4. ADDED AfterViewInit
  @ViewChild('chartContainer', { static: true })
  chartContainer!: ElementRef<HTMLDivElement>;

  private http = inject(HttpClient);
  private cd = inject(ChangeDetectorRef); // 5. INJECTED ChangeDetectorRef
  private chartInstance?: EChartsType;
  private resizeListener?: () => void;
  private dataRefreshInterval?: ReturnType<typeof setInterval>;

  currentDateTime: string = '';
  public isLoading: boolean = false;

  // 6. KEPT your isFirstLoad property
  private isFirstLoad: boolean = true;

  // 7. Data is now initialized in initColors()
  widgetData: WidgetData[] = [];
  private bedStatusSeries: BedStatusSeries[] = [];
  
  // 8. Cached CSS Vars - Using your defined chart colors
  private chartColor1 = '';
  private chartColor2 = '';
  private chartColor3 = '';
  private chartColor6 = '';
  private chartColor7 = '';
  private chartColor8 = '';
  private chartColor9 = '';
  private gray200 = '';
  private gray300 = '';
  private gray700 = '';
  private gray800 = '';
  private peacockBlue = '';
  private white = '';

  ngOnInit(): void {
    // 9. Initialize colors first to prevent "ExpressionChanged" error
    this.initColors();
    this.loadData();

    this.dataRefreshInterval = setInterval(() => {
      this.loadData();
    }, 60000);
  }

  // 10. ADDED ngAfterViewInit for chart init
  ngAfterViewInit(): void {
    this.initChart();
    this.setupResizeListener();
  }

  ngOnDestroy(): void {
    if (this.resizeListener) {
      window.removeEventListener('resize', this.resizeListener);
    }
    if (this.chartInstance) {
      this.chartInstance.dispose();
    }
    if (this.dataRefreshInterval) {
      clearInterval(this.dataRefreshInterval);
    }
  }

  // 11. ADDED initColors() to use CSS variables
  private initColors(): void {
    const c = (name: string) => getCssVar(name);

    // Initialize widget data with CSS variables
    this.widgetData = [
      { id: 'occupancyRate', title: 'Công Suất Sử Dụng', value: '0,00%', caption: 'Occupancy Rate', icon: 'fas fa-chart-pie', accentColor: c('--chart-color-1') },
      { id: 'totalBeds', title: 'Tổng Số Giường', value: '0', caption: 'Total Beds', icon: 'fas fa-hospital', accentColor: c('--chart-color-2') },
      { id: 'giuongTrong', title: 'Giường Trống', value: '0', caption: 'Vacant Beds', icon: 'fas fa-check-circle', accentColor: c('--chart-color-3') },
      { id: 'dangDieuTri', title: 'Đang Điều Trị', value: '0', caption: 'In Treatment', icon: 'fas fa-user-injured', accentColor: c('--chart-color-1') },
      { id: 'choXuatVien', title: 'Chờ Xuất Viện', value: '0', caption: 'Awaiting Discharge', icon: 'fas fa-door-open', accentColor: c('--chart-color-8') },
      { id: 'daBook', title: 'Đã Book', value: '0', caption: 'Booked Beds', icon: 'fas fa-bookmark', accentColor: c('--chart-color-6') },
      { id: 'chuaSanSang', title: 'Chưa Sẵn Sàng', value: '0', caption: 'Not Ready', icon: 'fas fa-tools', accentColor: c('--chart-color-7') }
    ];

    // Initialize bed status series with CSS variables
    this.bedStatusSeries = [
      { name: 'Giường trống (Vacant)', dataKey: 'giuongTrong', color: c('--chart-color-3') }, // aqua-island
      { name: 'Đang điều trị (In Treatment)', dataKey: 'dangDieuTri', color: c('--chart-color-1') }, // teal-blue
      { name: 'Chờ xuất viện (Awaiting Discharge)', dataKey: 'choXuatVien', color: c('--chart-color-8') }, // teal-midtone
      { name: 'Đã book (Booked)', dataKey: 'daBook', color: c('--chart-color-6') }, // orange
      { name: 'Chưa sẵn sàng (Not Ready)', dataKey: 'chuaSanSang', color: c('--chart-color-7') }, // dark-gray
      { name: 'Cho mượn giường (On Loan)', dataKey: 'choMuonGiuong', color: c('--chart-color-9') } // beige-midtone
    ];
    
    // Cache frequently used CSS variables
    this.chartColor1 = c('--chart-color-1');
    this.chartColor2 = c('--chart-color-2');
    this.chartColor3 = c('--chart-color-3');
    this.chartColor6 = c('--chart-color-6');
    this.chartColor7 = c('--chart-color-7');
    this.chartColor8 = c('--chart-color-8');
    this.chartColor9 = c('--chart-color-9');
    this.gray200 = c('--gray-200');
    this.gray300 = c('--gray-300');
    this.gray700 = c('--gray-700');
    this.gray800 = c('--gray-800');
    this.peacockBlue = c('--peacock-blue');
    this.white = c('--white');
  }

  private initChart(): void {
    const container = this.chartContainer.nativeElement;
    this.chartInstance = echarts.init(container);

    setTimeout(() => {
      this.chartInstance?.resize();
    }, 100);
  }

  private setupResizeListener(): void {
    this.resizeListener = () => {
      this.chartInstance?.resize();
    };
    window.addEventListener('resize', this.resizeListener);

    if (typeof ResizeObserver !== 'undefined') {
      const resizeObserver = new ResizeObserver(() => {
        this.chartInstance?.resize();
      });
      resizeObserver.observe(this.chartContainer.nativeElement);
    }
  }

  public loadData(): void {
    if (this.isLoading) return;
    this.isLoading = true;
    this.cd.markForCheck(); // 12. ADDED markForCheck

    const apiUrl = environment.bedUsageUrl;
    const getTimestamp = () =>
      new Date().toLocaleString('vi-VN', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });

    this.http
      .get<ApiResponseData[]>(apiUrl)
      .pipe(
        finalize(() => {
          this.isLoading = false;
          this.currentDateTime = getTimestamp();
          this.cd.markForCheck(); // 13. ADDED markForCheck
        })
      )
      .subscribe({
        next: (rawData) => {
          const chartData = this.transformApiData(rawData);
          // 14. Sort data for consistency
          chartData.sort((a, b) => a.viName.localeCompare(b.viName));
          
          this.calculateAndUpdateWidgets(rawData);
          const option = this.buildOption(chartData);

          // === KEPT YOUR MODIFIED BLOCK ===
          if (this.isFirstLoad) {
            this.isFirstLoad = false;
          } else {
            option.animation = false;
          }
          // === END MODIFIED BLOCK ===

          this.chartInstance?.setOption(option, true);
        },
        error: (error) => {
          console.error('Error loading bed utilization data:', error);
          this.chartInstance?.clear();
          this.resetWidgetsToZero();
          this.cd.markForCheck(); // 15. ADDED markForCheck
        },
      });
  }

  private transformApiData(apiData: ApiResponseData[]): DepartmentChartData[] {
    return apiData.map((item) => {
      const parts = this.parseDepartmentName(item.TenPhongBan);
      return {
        tenPhongBan: item.TenPhongBan,
        viName: parts.viName,
        enName: parts.enName,
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

  private parseDepartmentName(
    fullName: string
  ): { viName: string; enName: string } {
    const withoutTotal = fullName.replace(/\s*-?\s*\(Σ:\s*\d+\)\s*$/, '').trim();
    const parts = withoutTotal.split(/\s+-\s+/);
    if (parts.length >= 2) {
      return {
        viName: parts[0].trim(),
        enName: parts.slice(1).join(' - ').trim(),
      };
    }
    const match = withoutTotal.match(/^(.+?)\s+([A-Z][a-zA-Z\s&()]+)$/);
    if (match) {
      return {
        viName: match[1].trim(),
        enName: match[2].trim(),
      };
    }
    return {
      viName: withoutTotal,
      enName: '',
    };
  }

  private updateWidgetValue(id: string, value: string) {
    const widget = this.widgetData.find((w) => w.id === id);
    if (widget) {
      widget.value = value;
    }
  }

  // 16. REPLACED with OPTIMIZED single-reduce function
  private calculateAndUpdateWidgets(apiData: ApiResponseData[]): void {
    const totals = apiData.reduce(
      (acc, item) => {
        acc.giuongTrong += item.GiuongTrong;
        acc.dangDieuTri += item.DangSuDung;
        acc.choXuatVien += item.ChoXuatVien;
        acc.daBook += item.DaBook;
        acc.chuaSanSang += item.ChuaSanSang;
        acc.choMuonGiuong += item.ChoMuonGiuong;
        acc.totalBeds += item.Tong;
        return acc;
      },
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

    const occupiedBeds =
      totals.dangDieuTri +
      totals.choXuatVien +
      totals.daBook +
      totals.chuaSanSang +
      totals.choMuonGiuong;

    let occupancyRateStr = '0,00%';
    if (totals.totalBeds > 0) {
      const rate = (occupiedBeds / totals.totalBeds) * 100;
      occupancyRateStr = this.formatPercentage(rate);
    }

    this.updateWidgetValue('giuongTrong', this.formatNumber(totals.giuongTrong));
    this.updateWidgetValue('dangDieuTri', this.formatNumber(totals.dangDieuTri));
    this.updateWidgetValue('choXuatVien', this.formatNumber(totals.choXuatVien));
    this.updateWidgetValue('daBook', this.formatNumber(totals.daBook));
    this.updateWidgetValue('chuaSanSang', this.formatNumber(totals.chuaSanSang));
    this.updateWidgetValue('totalBeds', this.formatNumber(totals.totalBeds));
    this.updateWidgetValue('occupancyRate', occupancyRateStr);
  }

  private resetWidgetsToZero(): void {
    this.updateWidgetValue('occupancyRate', '0,00%');
    this.updateWidgetValue('totalBeds', '0');
    this.updateWidgetValue('dangDieuTri', '0');
    this.updateWidgetValue('giuongTrong', '0');
    this.updateWidgetValue('daBook', '0');
    this.updateWidgetValue('choXuatVien', '0');
    this.updateWidgetValue('chuaSanSang', '0');
  }

  trackByWidgetId(index: number, item: WidgetData): string {
    return item.id;
  }

  private formatNumber(value: number): string {
    return new Intl.NumberFormat('vi-VN', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  }

  private formatPercentage(value: number): string {
    return (
      new Intl.NumberFormat('vi-VN', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(value) + '%'
    );
  }

  private buildOption(data: DepartmentChartData[]): EChartsOption {
    // 17. Use both Vi and En names for x-axis
    const xAxisData = data.map((item) =>
      item.enName ? `${item.viName}\n(${item.enName})` : item.viName
    );
    const currentColors = this.bedStatusSeries.map((s) => s.color);

    const series = this.bedStatusSeries.map((config, index) => ({
      name: config.name,
      type: 'bar' as const,
      stack: 'beds',
      barWidth: '35%',
      itemStyle: {
        color: config.color,
        borderRadius: [4, 4, 0, 0], // Rounded top corners
        borderColor: 'rgba(255, 255, 255, 0.3)',
        borderWidth: 1,
      },
      label: {
        show: true,
        position: 'inside' as const,
        formatter: ({ value }: any) => (value && value >= 1 ? String(value) : ''),
        fontSize: 10,
        fontWeight: 600,
        color: '#fff',
        textBorderColor: 'rgba(0,0,0,.3)',
        textBorderWidth: 1,
        distance: 0,
      },
      labelLayout: {
        hideOverlap: true,
      },
      emphasis: {
        focus: 'series' as const,
        itemStyle: {
          borderColor: currentColors[0],
          borderWidth: 2,
          shadowBlur: 8,
          shadowColor: 'rgba(0, 174, 203, 0.25)',
        },
      },
      // Explicitly type 'item' as DepartmentChartData
      data: data.map((item: DepartmentChartData) => item[config.dataKey]),
    }));

    return {
      backgroundColor: this.white,
      textStyle: {
        fontFamily: GLOBAL_FONT_FAMILY,
        fontSize: 12,
        color: this.gray700,
      },
      // 18. ADDED animation properties for your logic to work
      animation: true,
      animationDuration: 800,
      animationDurationUpdate: 300,
      animationEasingUpdate: 'cubicInOut',
      animationEasing: 'quadraticInOut',
      color: currentColors,
      tooltip: {
        trigger: 'axis',
        axisPointer: {
          type: 'shadow' as const,
          shadowStyle: {
            color: 'rgba(0, 89, 112, 0.1)',
          },
        },
        // 19. Using your preferred tooltip formatter
        formatter: (params: any) => {
          if (!params || params.length === 0) return '';
          const dataIndex = params[0].dataIndex;
          const item = data[dataIndex];
          let result = `<div style="font-weight: bold; margin-bottom: 5px; font-size: 12px; font-family: ${GLOBAL_FONT_FAMILY};">${item.viName}</div>`;
          result += `<div style="margin-bottom: 5px; color: #666; font-family: ${GLOBAL_FONT_FAMILY};">${item.enName}</div>`;
          let total = 0;
          params.forEach((param: any) => {
            if (param.value > 0) {
              total += param.value;
              result += `<div style="margin: 3px 0; font-family: ${GLOBAL_FONT_FAMILY};">`;
              result += `${param.marker} ${param.seriesName}: <strong>${param.value}</strong>`;
              result += `</div>`;
            }
          });
          result += `<div style="margin-top: 5px; padding-top: 5px; border-top: 1px solid #ccc; font-weight: bold; font-family: ${GLOBAL_FONT_FAMILY};">`;
          result += `Tổng số giường: <strong>${item.totalBeds}</strong>`;
          result += `</div>`;
          return result;
        },
      },
      legend: {
        // 20. Using your preferred legend style
        data: this.bedStatusSeries.map(s => s.name),
        top: '2%',
        left: 'center',
        show: true,
        type: 'scroll',
        orient: 'horizontal',
        itemGap: 8,
        textStyle: {
          fontSize: 10
        },
        backgroundColor: 'rgba(255, 255, 255, 0.85)',
        borderRadius: 4,
        pageTextStyle: {
          fontFamily: GLOBAL_FONT_FAMILY
        }
      },
      grid: {
        left: '5%',
        right: '5%',
        top: '12%',
        bottom: '28%', // 21. INCREASED bottom margin for DataZoom
        containLabel: true,
      },
      xAxis: {
        type: 'category',
        data: xAxisData,
        axisLabel: {
          interval: 0,
          fontSize: 9,
          fontWeight: 'bold',
          overflow: 'break',
          hideOverlap: true,
          margin: 3
        },
        axisTick: {
          alignWithLabel: true,
          length: 5,
          lineStyle: {
            color: this.gray300,
          },
        },
        axisLine: {
          show: true,
          lineStyle: {
            color: this.peacockBlue,
            width: 2,
          },
        },
        splitLine: {
          show: false,
        },
      },
      yAxis: {
        type: 'value',
        name: 'Tổng Số Giường\n(Total Beds)',
        nameLocation: 'middle',
        nameGap: 45, // 23. Using safer 45px gap
        nameRotate: 90,
        nameTextStyle: {
          fontSize: 12,
          fontWeight: 'bold',
          color: this.gray800,
          lineHeight: 16,
        },
        min: 0,
        max: 60,
        interval: 10,
        splitLine: {
          show: true,
          lineStyle: {
            color: this.gray200,
            width: 1,
            type: 'dotted',
          },
        },
        axisLine: {
          show: true,
          lineStyle: {
            color: this.gray700,
            width: 1.5,
          },
        },
        axisTick: {
          show: true,
          length: 4,
          lineStyle: {
            color: this.gray700,
          },
        },
        axisLabel: {
          fontSize: 11,
          color: this.gray700,
          margin: 10,
        },
      },
      series: series,
      barCategoryGap: '30%',
      // 24. ADDED DataZoom configuration
      dataZoom: [
        {
          type: 'slider',
          xAxisIndex: 0,
          filterMode: 'filter',
          start: 0,
          end: data.length > 10 ? 50 : 100,
          bottom: 20,
          height: 20,
          handleIcon:
            'path://M306.1,4.3C306.1,4.3,306.1,4.3,306.1,4.3C306.1,4.3,306.1,4.3,306.1,4.3C306.1,4.3,306.1,4.3,306.1,4.3C306.1,4.3,306.1,4.3,306.1,4.3z M306.1,4.3C306.1,4.3,306.1,4.3,306.1,4.3C306.1,4.3,306.1,4.3,306.1,4.3C306.1,4.3,306.1,4.3,306.1,4.3C306.1,4.3,306.1,4.3,306.1,4.3z M306.1,4.3C306.1,4.3,306.1,4.3,306.1,4.3C306.1,4.3,306.1,4.3,306.1,4.3C306.1,4.3,306.1,4.3,306.1,4.3C306.1,4.3,306.1,4.3,306.1,4.3z M306.1,4.3C306.1,4.3,306.1,4.3,306.1,4.3C306.1,4.3,306.1,4.3,306.1,4.3C306.1,4.3,306.1,4.3,306.1,4.3C306.1,4.3,306.1,4.3,306.1,4.3z',
          handleSize: '110%',
          handleStyle: { color: '#fff', borderColor: '#aaa', borderWidth: 1, },
          backgroundColor: '#f3f3f3',
          dataBackground: { lineStyle: { color: this.gray200 }, areaStyle: { color: this.gray200 }, },
          selectedDataBackground: { lineStyle: { color: this.peacockBlue }, areaStyle: { color: this.peacockBlue, opacity: 0.1 }, },
          moveHandleStyle: { color: this.peacockBlue, opacity: 0.7, },
        },
        {
          type: 'inside',
          xAxisIndex: 0,
          filterMode: 'filter',
          start: 0,
          end: data.length > 10 ? 50 : 100,
        },
      ],
    };
  }
}