import { Component, OnInit, OnDestroy, ElementRef, ViewChild, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';

// --- ECHARTS IMPORTS (unchanged) ---
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
import { WidgetCardComponent } from '../components/widget-card/widget-card.component'; // Import new component

echarts.use([
  CanvasRenderer,
  BarChart,
  TitleComponent,
  TooltipComponent,
  GridComponent,
  LegendComponent
]);
type EChartsOption = EChartsCoreOption;
// --- END ECHARTS IMPORTS ---

const BASE_URL = 'https://10.20.26.21:6868/';
const API_CONGSUATGIUONG = 'api/CongSuatGiuongBenh';

// --- Constants for styling (from styles.scss) ---
const GLOBAL_FONT_FAMILY = 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
const PEACOCK_BLUE_COLOR = '#006E96'; // var(--peacock-blue)

// --- INTERFACES (unchanged) ---
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

// NEW: Interface for our widget data
interface WidgetData {
  id: string; // To find and update the widget
  icon: string;
  title: string;
  value: string;
  caption: string;
  accentColor: string;
}


@Component({
  selector: 'app-bed-usage',
  standalone: true,
  imports: [
    CommonModule,
    WidgetCardComponent // Add new component here
  ],
  templateUrl: './bed-usage.component.html',
  styleUrl: './bed-usage.component.scss'
})
export class BedUsageComponent implements OnInit, OnDestroy {
  @ViewChild('chartContainer', { static: true }) chartContainer!: ElementRef<HTMLDivElement>;

  private http = inject(HttpClient);
  private chartInstance?: EChartsType;
  private resizeListener?: () => void;
  private clockInterval?: ReturnType<typeof setInterval>;
  private refreshCounter = 0;

  currentDateTime: string = '';

  // NEW: A single array for all widget data
  widgetData: WidgetData[] = [
    { id: 'occupancyRate', title: 'Công Suất Sử Dụng', value: '0,00%', caption: 'Occupancy Rate', icon: 'fas fa-chart-pie', accentColor: '#5A6DA3' /* --deep-sapphire-light */ },
    { id: 'totalBeds', title: 'Tổng Số Giường', value: '0', caption: 'Total Beds', icon: 'fas fa-hospital', accentColor: '#00839B' /* --teal-blue */ },
    { id: 'dangDieuTri', title: 'Đang Điều Trị', value: '0', caption: 'In Treatment', icon: 'fas fa-user-injured', accentColor: '#005E70' /* --teal-blue-dark */ },
    { id: 'giuongTrong', title: 'Giường Trống', value: '0', caption: 'Vacant Beds', icon: 'fas fa-check-circle', accentColor: '#66B9C9' /* --teal-blue-light */ },
    { id: 'daBook', title: 'Đã Book', value: '0', caption: 'Booked Beds', icon: 'fas fa-bookmark', accentColor: '#F59E0B' /* --color-warning */ },
    { id: 'choXuatVien', title: 'Chờ Xuất Viện', value: '0', caption: 'Awaiting Discharge', icon: 'fas fa-door-open', accentColor: '#66A9C5' /* --peacock-blue-light */ },
    { id: 'chuaSanSang', title: 'Chưa Sẵn Sàng', value: '0', caption: 'Not Ready', icon: 'fas fa-tools', accentColor: '#94A3B8' /* --gray-400 */ }
  ];

  // Bed status series configuration - (unchanged)
  private bedStatusSeries: BedStatusSeries[] = [
    { name: 'Giường trống', dataKey: 'giuongTrong', color: '#66B9C9' },    // var(--teal-blue-light)
    { name: 'Đang điều trị', dataKey: 'dangDieuTri', color: '#005E70' },    // var(--teal-blue-dark)
    { name: 'Chờ xuất viện', dataKey: 'choXuatVien', color: '#66A9C5' },    // var(--peacock-blue-light)
    { name: 'Đã book', dataKey: 'daBook', color: '#F59E0B' },           // var(--color-warning)
    { name: 'Chưa sẵn sàng', dataKey: 'chuaSanSang', color: '#94A3B8' },   // var(--gray-400)
    { name: 'Cho mượn giường', dataKey: 'choMuonGiuong', color: '#70B4B3' }  // var(--aqua-island-dark)
  ];

  // (ngOnInit, startClock, updateClock, formatNumber, formatPercentage, ngOnDestroy, initChart, setupResizeListener are unchanged)
  ngOnInit(): void {
    this.initChart();
    this.loadData();
    this.setupResizeListener();
    this.startClock();
  }
  private startClock(): void {
    this.updateClock();
    this.clockInterval = setInterval(() => {
      this.updateClock();
    }, 1000);
  }
  private updateClock(): void {
    const now = new Date();
    const day = String(now.getDate()).padStart(2, '0');
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const year = now.getFullYear();
    let hours = now.getHours();
    const minutesStr = String(now.getMinutes()).padStart(2, '0');
    this.currentDateTime = `${day}/${month}/${year} ${hours}:${minutesStr}`;
    this.refreshCounter++;
    if (this.refreshCounter >= 60) {
      this.refreshCounter = 0;
      this.loadData();
    }
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
  ngOnDestroy(): void {
    if (this.resizeListener) {
      window.removeEventListener('resize', this.resizeListener);
    }
    if (this.chartInstance) {
      this.chartInstance.dispose();
    }
    if (this.clockInterval) {
      clearInterval(this.clockInterval);
    }
  }
  private initChart(): void {
    const container = this.chartContainer.nativeElement;
    this.chartInstance = echarts.init(container);
  }
  private setupResizeListener(): void {
    this.resizeListener = () => {
      if (this.chartInstance) {
        this.chartInstance.resize();
      }
    };
    window.addEventListener('resize', this.resizeListener);
  }


  // Load data from API
  private loadData(): void {
    const apiUrl = `${BASE_URL}${API_CONGSUATGIUONG}`;

    this.http.get<ApiResponseData[]>(apiUrl).subscribe({
      next: (rawData) => {
        const chartData = this.transformApiData(rawData);
        this.calculateAndUpdateWidgets(rawData);
        const option = this.buildOption(chartData);
        if (this.chartInstance) {
          this.chartInstance.setOption(option);
        }
      },
      error: (error) => {
        console.error('Error loading bed utilization data:', error);
        const sampleData = this.getSampleData();
        this.calculateAndUpdateWidgetsFromSample(sampleData);
        const option = this.buildOption(sampleData);
        if (this.chartInstance) {
          this.chartInstance.setOption(option);
        }
      }
    });
  }

  // (transformApiData and parseDepartmentName are unchanged)
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


  // NEW: Helper function to find and update a widget in the array
  private updateWidgetValue(id: string, value: string) {
    const widget = this.widgetData.find(w => w.id === id);
    if (widget) {
      widget.value = value;
    }
  }

  // RENAMED & UPDATED: from calculateBedStatusTotals
  private calculateAndUpdateWidgets(apiData: ApiResponseData[]): void {
    // Calculate numeric totals
    const giuongTrongTotal = apiData.reduce((sum, item) => sum + item.GiuongTrong, 0);
    const dangDieuTriTotal = apiData.reduce((sum, item) => sum + item.DangSuDung, 0);
    const choXuatVienTotal = apiData.reduce((sum, item) => sum + item.ChoXuatVien, 0);
    const daBookTotal = apiData.reduce((sum, item) => sum + item.DaBook, 0);
    const chuaSanSangTotal = apiData.reduce((sum, item) => sum + item.ChuaSanSang, 0);
    const choMuonGiuongTotal = apiData.reduce((sum, item) => sum + item.ChoMuonGiuong, 0);
    const totalBedsNumeric = apiData.reduce((sum, item) => sum + item.Tong, 0);

    // Calculate occupancy rate
    const occupiedBeds = dangDieuTriTotal + choXuatVienTotal + daBookTotal + chuaSanSangTotal + choMuonGiuongTotal;
    let occupancyRateStr = '0,00%';
    if (totalBedsNumeric > 0) {
      const rate = (occupiedBeds / totalBedsNumeric) * 100;
      occupancyRateStr = this.formatPercentage(rate);
    }

    // Update the widgetData array
    this.updateWidgetValue('giuongTrong', this.formatNumber(giuongTrongTotal));
    this.updateWidgetValue('dangDieuTri', this.formatNumber(dangDieuTriTotal));
    this.updateWidgetValue('choXuatVien', this.formatNumber(choXuatVienTotal));
    this.updateWidgetValue('daBook', this.formatNumber(daBookTotal));
    this.updateWidgetValue('chuaSanSang', this.formatNumber(chuaSanSangTotal));
    this.updateWidgetValue('totalBeds', this.formatNumber(totalBedsNumeric));
    this.updateWidgetValue('occupancyRate', occupancyRateStr);
  }

  // NEW: Added this function to update widgets from sample data on error
  private calculateAndUpdateWidgetsFromSample(sampleData: DepartmentChartData[]): void {
    const giuongTrongTotal = sampleData.reduce((sum: number, d: DepartmentChartData) => sum + d.giuongTrong, 0);
    const dangDieuTriTotal = sampleData.reduce((sum: number, d: DepartmentChartData) => sum + d.dangDieuTri, 0);
    const choXuatVienTotal = sampleData.reduce((sum: number, d: DepartmentChartData) => sum + d.choXuatVien, 0);
    const daBookTotal = sampleData.reduce((sum: number, d: DepartmentChartData) => sum + d.daBook, 0);
    const chuaSanSangTotal = sampleData.reduce((sum: number, d: DepartmentChartData) => sum + d.chuaSanSang, 0);
    const choMuonGiuongTotal = sampleData.reduce((sum: number, d: DepartmentChartData) => sum + d.choMuonGiuong, 0);
    const totalBedsNumeric = sampleData.reduce((sum: number, d: DepartmentChartData) => sum + d.totalBeds, 0);

    const occupiedBeds = dangDieuTriTotal + choXuatVienTotal + daBookTotal + chuaSanSangTotal + choMuonGiuongTotal;
    let occupancyRateStr = '0,00%';
    if (totalBedsNumeric > 0) {
      const rate = (occupiedBeds / totalBedsNumeric) * 100;
      occupancyRateStr = this.formatPercentage(rate);
    }

    // Update the widgetData array
    this.updateWidgetValue('giuongTrong', this.formatNumber(giuongTrongTotal));
    this.updateWidgetValue('dangDieuTri', this.formatNumber(dangDieuTriTotal));
    this.updateWidgetValue('choXuatVien', this.formatNumber(choXuatVienTotal));
    this.updateWidgetValue('daBook', this.formatNumber(daBookTotal));
    this.updateWidgetValue('chuaSanSang', this.formatNumber(chuaSanSangTotal));
    this.updateWidgetValue('totalBeds', this.formatNumber(totalBedsNumeric));
    this.updateWidgetValue('occupancyRate', occupancyRateStr);
  }

  // +++ ADDED THIS METHOD +++
  // trackBy function for the widget ngFor loop
  trackByWidgetId(index: number, item: WidgetData): string {
    return item.id;
  }

  // (buildOption and getSampleData are unchanged)
  private buildOption(data: DepartmentChartData[]): EChartsOption {
    const xAxisData = data.map(item => item.tenPhongBan);
    const viewportWidth = window.innerWidth;
    let labelRotation = 22;
    let labelFontSize = 11;
    let labelMargin = 60;
    let gridBottom = '5%';

    if (viewportWidth < 768) {
      labelRotation = 25;
      labelFontSize = 10;
      labelMargin = 35;
      gridBottom = '10%';
    } else if (viewportWidth < 1024) {
      labelRotation = 22;
      labelFontSize = 11;
      labelMargin = 40;
      gridBottom = '20%';
    }
    const series = this.bedStatusSeries.map(config => ({
      name: config.name,
      type: 'bar',
      stack: 'beds',
      barWidth: '50%',
      itemStyle: {
        color: config.color
      },
      label: {
        show: true,
        position: 'inside',
        formatter: ({ value }: any) => {
          return (value && value >= 1) ? String(value) : '';
        },
        fontSize: 11,
        fontWeight: 600,
        color: '#fff',
        textBorderColor: 'rgba(0,0,0,.4)',
        textBorderWidth: 2.5,
        distance: 0
      },
      labelLayout: {
        hideOverlap: true
      },
      emphasis: {
        focus: 'series'
      },
      data: data.map(item => item[config.dataKey])
    }));
    return {
      title: {
        text: 'Công Suất Sử Dụng Giường Bệnh Toàn Viện',
        left: 'center',
        top: 10,
        textStyle: {
          fontSize: 24,
          fontWeight: 'bold',
          fontFamily: GLOBAL_FONT_FAMILY,
          color: PEACOCK_BLUE_COLOR
        }
      },
      color: this.bedStatusSeries.map(s => s.color),
      tooltip: {
        trigger: 'axis',
        axisPointer: {
          type: 'shadow'
        },
        formatter: (params: any) => {
          if (!params || params.length === 0) return '';
          const dataIndex = params[0].dataIndex;
          const item = data[dataIndex];
          let result = `<div style="font-weight: bold; margin-bottom: 10px; font-size: 14px;font-family: ${GLOBAL_FONT_FAMILY};">${item.viName}</div>`;
          result += `<div style="margin-bottom: 8px; color: #666;font-family: ${GLOBAL_FONT_FAMILY};">${item.enName}</div>`;
          let total = 0;
          params.forEach((param: any) => {
            if (param.value > 0) {
              total += param.value;
              result += `<div style="margin: 4px 0;font-family: ${GLOBAL_FONT_FAMILY};">`;
              result += `${param.marker} ${param.seriesName}: <strong>${param.value}</strong>`;
              result += `</div>`;
            }
          });
          result += `<div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid #ccc; font-weight: bold; font-family: ${GLOBAL_FONT_FAMILY};">`;
          result += `Tổng số giường: <strong>${item.totalBeds}</strong>`;
          result += `</div>`;
          return result;
        }
      },
      legend: {
        data: this.bedStatusSeries.map(s => s.name),
        top: 60,
        left: 'center',
        show: true,
        type: 'scroll',
        orient: 'horizontal',
        itemGap: 15,
        textStyle: {
          fontSize: 13,
          fontFamily: GLOBAL_FONT_FAMILY
        }
      },
      grid: {
        left: '5%',
        right: '4%',
        top: 100,
        bottom: gridBottom,
        containLabel: true
      },
      xAxis: {
        type: 'category',
        data: xAxisData,
        axisLabel: {
          interval: 0,
          rotate: labelRotation,
          fontSize: labelFontSize,
          lineHeight: 15,
          margin: labelMargin,
          fontFamily: GLOBAL_FONT_FAMILY,
          align: 'center',
          overflow: 'break',
          hideOverlap: false,
          inside: false,
          fontWeight: 'bold',
          formatter: (value: string) => {
            const lines = value.split('\r\n');
            return lines.map(line => `{left|${line}}`).join('\n');
          },
          rich: {
            left: {
              align: 'left',
              fontSize: labelFontSize,
              lineHeight: 18,
              fontFamily: GLOBAL_FONT_FAMILY,
              fontWeight: 'bold'
            }
          }
        },
        axisTick: {
          alignWithLabel: true,
          length: 6
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
        nameGap: 50,
        nameRotate: 90,
        nameTextStyle: {
          fontSize: 18,
          fontWeight: 'bold',
          fontFamily: GLOBAL_FONT_FAMILY
        },
        min: 0,
        max: 70,
        interval: 5,
        splitLine: {
          show: true,
          lineStyle: {
            color: '#e0e0e0',
            width: 1.5,
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
          fontSize: 12,
          fontFamily: GLOBAL_FONT_FAMILY
        }
      },
      series: series,
      barCategoryGap: '35%'
    };
  }
  private getSampleData(): DepartmentChartData[] {
    return [
      { tenPhongBan: 'F5-KHOA HỒI SỨC\r\nIntensive Care Unit\r\n(Σ: 24)', viName: 'F5-KHOA HỒI SỨC', enName: 'Intensive Care Unit', totalBeds: 24, giuongTrong: 2, dangDieuTri: 20, choXuatVien: 1, daBook: 0, chuaSanSang: 1, choMuonGiuong: 0 },
      { tenPhongBan: 'F7-KHOA TIM MẠCH\r\nCardiology Department\r\n(Σ: 47)', viName: 'F7-KHOA TIM MẠCH', enName: 'Cardiology Department', totalBeds: 47, giuongTrong: 6, dangDieuTri: 40, choXuatVien: 0, daBook: 1, chuaSanSang: 0, choMuonGiuong: 0 },
      { tenPhongBan: 'F8-KHOA NỘI TỔNG HỢP\r\nGeneral Internal Medicine\r\n(Σ: 40)', viName: 'F8-KHOA NỘI TỔNG HỢP', enName: 'General Internal Medicine', totalBeds: 40, giuongTrong: 4, dangDieuTri: 32, choXuatVien: 2, daBook: 1, chuaSanSang: 1, choMuonGiuong: 0 },
      { tenPhongBan: 'F9-KHOA NGOẠI TỔNG HỢP\r\nGeneral Surgery\r\n(Σ: 40)', viName: 'F9-KHOA NGOẠI TỔNG HỢP', enName: 'General Surgery', totalBeds: 40, giuongTrong: 8, dangDieuTri: 28, choXuatVien: 1, daBook: 2, chuaSanSang: 0, choMuonGiuong: 1 },
      { tenPhongBan: 'F10-KHOA NỘI TỔNG HỢP\r\nOrthopedics\r\n(Σ: 40)', viName: 'F10-KHOA NỘI TỔNG HỢP', enName: 'Orthopedics', totalBeds: 40, giuongTrong: 7, dangDieuTri: 30, choXuatVien: 1, daBook: 2, chuaSanSang: 0, choMuonGiuong: 0 },
      { tenPhongBan: 'F11-KHOA SẢN PHỤ KHOA\r\nObstetrics & Gynecology\r\n(Σ: 53)', viName: 'F11-KHOA SẢN PHỤ KHOA', enName: 'Obstetrics & Gynecology', totalBeds: 53, giuongTrong: 10, dangDieuTri: 35, choXuatVien: 3, daBook: 3, chuaSanSang: 2, choMuonGiuong: 0 },
      { tenPhongBan: 'F11-KHOA NHI\r\nPediatrics Department\r\n(Σ: 34)', viName: 'F11-KHOA NHI', enName: 'Pediatrics Department', totalBeds: 34, giuongTrong: 5, dangDieuTri: 25, choXuatVien: 2, daBook: 1, chuaSanSang: 1, choMuonGiuong: 0 }
    ];
  }
}