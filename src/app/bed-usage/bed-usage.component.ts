import { Component, OnInit, OnDestroy, ElementRef, ViewChild, inject, AfterViewInit } from '@angular/core';
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
  LegendComponent
} from 'echarts/components';
import { WidgetCardComponent } from '../components/widget-card/widget-card.component';
import { environment } from '../../environments/environment.development';

echarts.use([
  CanvasRenderer,
  BarChart,
  TitleComponent,
  TooltipComponent,
  GridComponent,
  LegendComponent
]);

type EChartsOption = EChartsCoreOption;

// --- STYLING CONSTANTS ---
const GLOBAL_FONT_FAMILY = 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

// --- Helper: Read CSS custom property ---
function getCssVar(name: string): string {
  return getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
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
  styleUrl: './bed-usage.component.scss'
})
export class BedUsageComponent implements OnInit, OnDestroy, AfterViewInit {
  @ViewChild('chartContainer', { static: true }) chartContainer!: ElementRef<HTMLDivElement>;

  private http = inject(HttpClient);
  private chartInstance?: EChartsType;
  private resizeListener?: () => void;
  private dataRefreshInterval?: ReturnType<typeof setInterval>;

  currentDateTime: string = '';
  public isLoading: boolean = false;

  // We’ll initialize these AFTER view init (to ensure CSS vars are available)
  widgetData: WidgetData[] = [];
  private bedStatusSeries: BedStatusSeries[] = [];

  ngOnInit(): void {
    this.loadData();
    this.dataRefreshInterval = setInterval(() => {
      this.loadData();
    }, 60000);
  }

  ngAfterViewInit(): void {
    // Initialize chart and color-dependent data after DOM is ready
    this.initColors();
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

  private initColors(): void {
    // Fetch all needed colors from :root
    const c = (name: string) => getCssVar(name);

    this.widgetData = [
      // --- Summary Widgets ---
      { id: 'occupancyRate', title: 'Công Suất Sử Dụng', value: '0,00%', caption: 'Occupancy Rate', icon: 'fas fa-chart-pie', accentColor: c('--chart-color-1') },
      { id: 'totalBeds', title: 'Tổng Số Giường', value: '0', caption: 'Total Beds', icon: 'fas fa-hospital', accentColor: c('--chart-color-2') },
      
      // --- Status Widgets (Matching chart series order) ---
      { id: 'giuongTrong', title: 'Giường Trống', value: '0', caption: 'Vacant Beds', icon: 'fas fa-check-circle', accentColor: c('--chart-color-3') },
      { id: 'dangDieuTri', title: 'Đang Điều Trị', value: '0', caption: 'In Treatment', icon: 'fas fa-user-injured', accentColor: c('--chart-color-1') },
      { id: 'choXuatVien', title: 'Chờ Xuất Viện', value: '0', caption: 'Awaiting Discharge', icon: 'fas fa-door-open', accentColor: c('--chart-color-8') },
      { id: 'daBook', title: 'Đã Book', value: '0', caption: 'Booked Beds', icon: 'fas fa-bookmark', accentColor: c('--chart-color-6') },
      { id: 'chuaSanSang', title: 'Chưa Sẵn Sàng', value: '0', caption: 'Not Ready', icon: 'fas fa-tools', accentColor: c('--chart-color-7') }
    ];

    this.bedStatusSeries = [
      { name: 'Giường trống (Vacant)', dataKey: 'giuongTrong', color: c('--chart-color-3') },
      { name: 'Đang điều trị (In Treatment)', dataKey: 'dangDieuTri', color: c('--chart-color-1') },
      { name: 'Chờ xuất viện (Awaiting Discharge)', dataKey: 'choXuatVien', color: c('--chart-color-8') },
      { name: 'Đã book (Booked)', dataKey: 'daBook', color: c('--chart-color-6') },
      { name: 'Chưa sẵn sàng (Not Ready)', dataKey: 'chuaSanSang', color: c('--chart-color-7') },
      { name: 'Cho mượn giường (On Loan)', dataKey: 'choMuonGiuong', color: c('--chart-color-9') }
    ];
  }

  private initChart(): void {
    const container = this.chartContainer.nativeElement;
    this.chartInstance = echarts.init(container);
    setTimeout(() => {
      if (this.chartInstance) {
        this.chartInstance.resize();
      }
    }, 100);
  }

  private setupResizeListener(): void {
    this.resizeListener = () => {
      if (this.chartInstance) {
        this.chartInstance.resize();
      }
    };
    window.addEventListener('resize', this.resizeListener);

    if (typeof ResizeObserver !== 'undefined') {
      const resizeObserver = new ResizeObserver(() => {
        if (this.chartInstance) {
          this.chartInstance.resize();
        }
      });
      resizeObserver.observe(this.chartContainer.nativeElement);
    }
  }

  public loadData(): void {
    if (this.isLoading) return;
    this.isLoading = true;

    const apiUrl = environment.bedUsageUrl;
    const getTimestamp = () => new Date().toLocaleString('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });

    this.http.get<ApiResponseData[]>(apiUrl).pipe(
      finalize(() => {
        this.isLoading = false;
        this.currentDateTime = getTimestamp();
      })
    ).subscribe({
      next: (rawData) => {
        const chartData = this.transformApiData(rawData);
        chartData.sort((a, b) => a.viName.localeCompare(b.viName));
        this.calculateAndUpdateWidgets(rawData);
        const option = this.buildOption(chartData);
        if (this.chartInstance) {
          this.chartInstance.setOption(option, true);
        }
      },
      error: (error) => {
        console.error('Error loading bed utilization data:', error);
        if (this.chartInstance) {
          this.chartInstance.clear();
        }
        this.resetWidgetsToZero();
      }
    });
  }

  private transformApiData(apiData: ApiResponseData[]): DepartmentChartData[] {
    return apiData.map(item => {
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
        choMuonGiuong: item.ChoMuonGiuong
      };
    });
  }

  private parseDepartmentName(fullName: string): { viName: string; enName: string } {
    const withoutTotal = fullName.replace(/\s*-?\s*\(Σ:\s*\d+\)\s*$/, '').trim();
    const parts = withoutTotal.split(/\s+-\s+/);
    if (parts.length >= 2) {
      return {
        viName: parts[0].trim(),
        enName: parts.slice(1).join(' - ').trim()
      };
    }
    const match = withoutTotal.match(/^(.+?)\s+([A-Z][a-zA-Z\s&()]+)$/);
    if (match) {
      return {
        viName: match[1].trim(),
        enName: match[2].trim()
      };
    }
    return {
      viName: withoutTotal,
      enName: ''
    };
  }

  private updateWidgetValue(id: string, value: string) {
    const widget = this.widgetData.find(w => w.id === id);
    if (widget) {
      widget.value = value;
    }
  }

  private calculateAndUpdateWidgets(apiData: ApiResponseData[]): void {
    const giuongTrongTotal = apiData.reduce((sum, item) => sum + item.GiuongTrong, 0);
    const dangDieuTriTotal = apiData.reduce((sum, item) => sum + item.DangSuDung, 0);
    const choXuatVienTotal = apiData.reduce((sum, item) => sum + item.ChoXuatVien, 0);
    const daBookTotal = apiData.reduce((sum, item) => sum + item.DaBook, 0);
    const chuaSanSangTotal = apiData.reduce((sum, item) => sum + item.ChuaSanSang, 0);
    const choMuonGiuongTotal = apiData.reduce((sum, item) => sum + item.ChoMuonGiuong, 0);
    const totalBedsNumeric = apiData.reduce((sum, item) => sum + item.Tong, 0);

    const occupiedBeds = dangDieuTriTotal + choXuatVienTotal + daBookTotal + chuaSanSangTotal + choMuonGiuongTotal;
    let occupancyRateStr = '0,00%';
    if (totalBedsNumeric > 0) {
      const rate = (occupiedBeds / totalBedsNumeric) * 100;
      occupancyRateStr = this.formatPercentage(rate);
    }
    this.updateWidgetValue('giuongTrong', this.formatNumber(giuongTrongTotal));
    this.updateWidgetValue('dangDieuTri', this.formatNumber(dangDieuTriTotal));
    this.updateWidgetValue('choXuatVien', this.formatNumber(choXuatVienTotal));
    this.updateWidgetValue('daBook', this.formatNumber(daBookTotal));
    this.updateWidgetValue('chuaSanSang', this.formatNumber(chuaSanSangTotal));
    this.updateWidgetValue('totalBeds', this.formatNumber(totalBedsNumeric));
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
      maximumFractionDigits: 0
    }).format(value);
  }

  private formatPercentage(value: number): string {
    return new Intl.NumberFormat('vi-VN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(value) + '%';
  }

  private buildOption(data: DepartmentChartData[]): EChartsOption {
    const xAxisData = data.map(item =>
      item.enName ? `${item.viName}\n(${item.enName})` : item.viName
    );

    // Ensure colors are up to date (in case of theme switch)
    const currentColors = this.bedStatusSeries.map(s => s.color);

    const series = this.bedStatusSeries.map((config, index) => ({
      name: config.name,
      type: 'bar' as const,
      stack: 'beds',
      barWidth: '35%',
      itemStyle: {
        color: config.color,
        borderRadius: [4, 4, 0, 0],
        borderColor: 'rgba(255, 255, 255, 0.3)',
        borderWidth: 1
      },
      label: {
        show: true,
        position: 'inside' as const,
        formatter: ({ value }: any) => (value && value >= 1) ? String(value) : '',
        fontSize: 10,
        fontWeight: 600,
        color: '#fff',
        textBorderColor: 'rgba(0,0,0,.3)',
        textBorderWidth: 1,
        distance: 0
      },
      labelLayout: {
        hideOverlap: true
      },
      emphasis: {
        focus: 'series' as const,
        itemStyle: {
          borderColor: currentColors[0], // Use first color (Vacant) for emphasis border
          borderWidth: 2,
          shadowBlur: 8,
          shadowColor: 'rgba(0, 174, 203, 0.25)'
        }
      },
      data: data.map(item => item[config.dataKey])
    }));

    // Fetch gray tones for chart styling
    const gray200 = getCssVar('--gray-200');
    const gray300 = getCssVar('--gray-300');
    const gray700 = getCssVar('--gray-700');
    const gray800 = getCssVar('--gray-800');
    const darkTeal = getCssVar('--peacock-blue');

    return {
      backgroundColor: getCssVar('--white'),
      textStyle: {
        fontFamily: GLOBAL_FONT_FAMILY,
        fontSize: 12,
        color: gray700
      },
      animation: true,
      animationDuration: 800,
      animationDurationUpdate: 300,
      animationEasingUpdate: 'cubicInOut',
      animationEasing: 'quadraticInOut',
      color: currentColors,
      tooltip: {
        trigger: 'axis',
        axisPointer: {
          type: 'shadow',
          shadowStyle: {
            color: 'rgba(0, 89, 112, 0.1)'
          }
        },
        backgroundColor: 'rgba(255, 255, 255, 0.95)',
        borderColor: gray300,
        borderWidth: 1,
        borderRadius: 8,
        textStyle: {
          color: gray800,
          fontFamily: GLOBAL_FONT_FAMILY,
          fontSize: 13
        },
        padding: [10, 15],
        extraCssText: 'box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);',
        formatter: (params: any) => {
          if (!params || params.length === 0) return '';
          const dataIndex = params[0].dataIndex;
          const item = data[dataIndex];
          let result = `<div style="font-weight: 700; margin-bottom: 8px; font-size: 14px; font-family: ${GLOBAL_FONT_FAMILY}; color: ${darkTeal};">${item.viName}</div>`;
          result += `<div style="margin-bottom: 10px; color: ${gray700}; font-family: ${GLOBAL_FONT_FAMILY}; font-size: 12px; font-style: italic;">${item.enName}</div>`;
          let totalOccupied = 0;
          params.forEach((param: any) => {
            if (param.value > 0) {
              totalOccupied += param.value;
              result += `<div style="margin: 5px 0; font-family: ${GLOBAL_FONT_FAMILY}; display: flex; align-items: center; gap: 8px;">`;
              result += `<span style="display: inline-block; width: 12px; height: 12px; background-color: ${param.color}; border-radius: 3px; border: 1px solid rgba(0,0,0,0.1);"></span>`;
              result += `<span style="flex: 1; font-size: 12px;">${param.seriesName}</span>`;
              result += `<span style="font-weight: 600; color: ${gray800}; font-size: 12px;">${param.value}</span>`;
              result += `</div>`;
            }
          });
          result += `<div style="margin-top: 10px; padding-top: 10px; border-top: 1px solid ${gray200}; font-weight: 700; font-family: ${GLOBAL_FONT_FAMILY}; display: flex; justify-content: space-between; font-size: 13px;">`;
          result += `<span style="color: ${gray700};">Tổng đang sử dụng:</span>`;
          result += `<span style="color: ${getCssVar('--chart-color-1')};">${totalOccupied}</span>`;
          result += `</div>`;
          result += `<div style="display: flex; justify-content: space-between; font-size: 13px;">`;
          result += `<span style="color: ${gray700};">Tổng số giường:</span>`;
          result += `<span style="color: ${darkTeal}; font-weight: 700;">${item.totalBeds}</span>`;
          result += `</div>`;
          return result;
        }
      },
      legend: {
        data: this.bedStatusSeries.map(s => s.name),
        top: '2%',
        left: 'center',
        show: true,
        type: 'scroll',
        orient: 'horizontal',
        itemGap: 15,
        textStyle: {
          fontSize: 11,
          color: gray700
        },
        icon: 'roundRect',
        itemStyle: {
          borderRadius: 4
        },
        backgroundColor: 'rgba(255, 255, 255, 0.9)',
        borderColor: gray200,
        borderWidth: 1,
        borderRadius: 8
      },
      grid: {
        left: '5%',
        right: '5%',
        top: '12%',
        bottom: '22%',
        containLabel: true
      },
      xAxis: {
        type: 'category',
        data: xAxisData,
        axisLabel: {
          interval: 0,
          fontSize: 11,
          fontWeight: 'bold',
          color: gray800,
          overflow: 'break',
          hideOverlap: true,
          margin: 10,
          lineHeight: 13,
          padding: [4, 6],
          backgroundColor: 'rgba(255, 255, 255, 0.8)',
          borderRadius: 4,
          borderColor: gray200,
          borderWidth: 1
        },
        axisTick: {
          alignWithLabel: true,
          length: 5,
          lineStyle: {
            color: gray300
          }
        },
        axisLine: {
          show: true,
          lineStyle: {
            color: darkTeal,
            width: 2
          }
        },
        splitLine: {
          show: false
        }
      },
      yAxis: {
        type: 'value',
        name: 'Tổng Số Giường\n(Total Beds)',
        nameLocation: 'middle',
        nameGap: 45,
        nameRotate: 90,
        nameTextStyle: {
          fontSize: 12,
          fontWeight: 'bold',
          color: gray800,
          lineHeight: 16
        },
        min: 0,
        max: 60,
        interval: 10,
        splitLine: {
          show: true,
          lineStyle: {
            color: gray200,
            width: 1,
            type: 'dotted'
          }
        },
        axisLine: {
          show: true,
          lineStyle: {
            color: gray700,
            width: 1.5
          }
        },
        axisTick: {
          show: true,
          length: 4,
          lineStyle: {
            color: gray700
          }
        },
        axisLabel: {
          fontSize: 11,
          color: gray700,
          margin: 10
        }
      },
      series: series,
      barCategoryGap: '30%'
    };
  }
}