import { Component, OnInit, OnDestroy, ElementRef, ViewChild, inject } from '@angular/core';
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
const PEACOCK_BLUE_COLOR = '#006E96'; // var(--peacock-blue)

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
export class BedUsageComponent implements OnInit, OnDestroy {
  @ViewChild('chartContainer', { static: true }) chartContainer!: ElementRef<HTMLDivElement>;

  private http = inject(HttpClient);
  private chartInstance?: EChartsType;
  private resizeListener?: () => void;
  private dataRefreshInterval?: ReturnType<typeof setInterval>;

  currentDateTime: string = '';
  public isLoading: boolean = false; 

  widgetData: WidgetData[] = [
    { id: 'occupancyRate', title: 'Công Suất Sử Dụng', value: '0,00%', caption: 'Occupancy Rate', icon: 'fas fa-chart-pie', accentColor: PEACOCK_BLUE_COLOR },
    { id: 'totalBeds', title: 'Tổng Số Giường', value: '0', caption: 'Total Beds', icon: 'fas fa-hospital', accentColor: PEACOCK_BLUE_COLOR },
    { id: 'dangDieuTri', title: 'Đang Điều Trị', value: '0', caption: 'In Treatment', icon: 'fas fa-user-injured', accentColor: '#94A3B8' },
    { id: 'giuongTrong', title: 'Giường Trống', value: '0', caption: 'Vacant Beds', icon: 'fas fa-check-circle', accentColor: '#94A3B8' },
    { id: 'daBook', title: 'Đã Book', value: '0', caption: 'Booked Beds', icon: 'fas fa-bookmark', accentColor: '#F59E0B' },
    { id: 'choXuatVien', title: 'Chờ Xuất Viện', value: '0', caption: 'Awaiting Discharge', icon: 'fas fa-door-open', accentColor: '#94A3B8' },
    { id: 'chuaSanSang', title: 'Chưa Sẵn Sàng', value: '0', caption: 'Not Ready', icon: 'fas fa-tools', accentColor: '#94A3B8' }
  ];

  private bedStatusSeries: BedStatusSeries[] = [
    { name: 'Giường trống', dataKey: 'giuongTrong', color: '#28A745' },
    { name: 'Đang điều trị', dataKey: 'dangDieuTri', color: '#006E96' },
    { name: 'Chờ xuất viện', dataKey: 'choXuatVien', color: '#66A9C5' },
    { name: 'Đã book', dataKey: 'daBook', color: '#F59E0B' },
    { name: 'Chưa sẵn sàng', dataKey: 'chuaSanSang', color: '#94A3B8' },
    { name: 'Cho mượn giường', dataKey: 'choMuonGiuong', color: '#70B4B3' }
  ];

  ngOnInit(): void {
    this.initChart();
    this.loadData();
    this.setupResizeListener();
    this.dataRefreshInterval = setInterval(() => {
      this.loadData();
    }, 60000);
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

        // Sort the data alphabetically by Vietnamese name to prevent "swapping"
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
    
    // === 1. MODIFIED THIS LINE ===
    // Create two-line labels. E.g. "Khoa Cấp Cứu\n(Emergency)"
    const xAxisData = data.map(item => 
      item.enName ? `${item.viName}\n(${item.enName})` : item.viName
    );

    const series = this.bedStatusSeries.map(config => ({
      name: config.name,
      type: 'bar' as const,
      stack: 'beds',
      barWidth: '40%',
      itemStyle: {
        color: config.color
      },
      label: {
        show: true,
        position: 'inside' as const,
        formatter: ({ value }: any) => (value && value >= 1) ? String(value) : '',
        fontSize: 9,
        fontWeight: 600,
        color: '#fff',
        textBorderColor: 'rgba(0,0,0,.4)',
        textBorderWidth: 1,
        distance: 0
      },
      labelLayout: {
        hideOverlap: true
      },
      emphasis: {
        focus: 'series' as const
      },
      data: data.map(item => item[config.dataKey])
    }));

    return {
      textStyle: {
        fontFamily: GLOBAL_FONT_FAMILY,
        fontSize: 12
      },
      animation: true,
      animationDurationUpdate: 300, 
      animationEasingUpdate: 'cubicInOut', 
      
      color: this.bedStatusSeries.map(s => s.color),
      tooltip: {
        trigger: 'axis',
        axisPointer: {
          type: 'shadow' as const
        },
        formatter: (params: any) => {
          if (!params || params.length === 0) return '';
          // This still works because 'data' (the function param) is sorted
          // and has the original, clean 'viName' and 'enName'.
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
        }
      },
      legend: {
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
      // === 2. MODIFIED THIS BLOCK ===
      grid: {
        left: '5%',
        right: '5%',
        top: '8%',
        bottom: '18%', // Increased from 10% to make room for 2-line labels
        containLabel: true
      },
      xAxis: {
        type: 'category',
        data: xAxisData, // This now contains the two-line labels
        // === 3. MODIFIED THIS BLOCK ===
        axisLabel: {
          interval: 0,
          fontSize: 12,
          fontWeight: 'bold',
          overflow: 'break',
          hideOverlap: true,
          margin: 5,
          lineHeight: 11 // Added for better spacing of 2-line labels
        },
        axisTick: {
          alignWithLabel: true,
          length: 3
        },
        axisLine: {
          show: true,
          lineStyle: {
            color: '#2b2c50ff'
          }
        }
      },
      yAxis: {
        type: 'value',
        name: 'Tổng Số Giường',
        nameLocation: 'middle',
        nameGap: 20,
        nameRotate: 90,
        nameTextStyle: {
          fontSize: 11,
          fontWeight: 'bold'
        },
        min: 0,
        max: 60,
        interval: 10,
        splitLine: {
          show: true,
          lineStyle: {
            color: '#e0e0e0',
            width: 0.8,
            type: 'solid'
          }
        },
        axisLine: {
          show: true,
          lineStyle: {
            color: '#999'
          }
        },
        axisLabel: {
          fontSize: 9,
          margin: 1
        }
      },
      series: series,
      barCategoryGap: '30%'
    };
  }
}