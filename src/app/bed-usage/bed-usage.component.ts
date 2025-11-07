import { Component, OnInit, OnDestroy, ElementRef, ViewChild, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';

// --- START: ECHARTS IMPORTS (FIX) ---

import * as echarts from 'echarts/core';
import type { EChartsType, EChartsCoreOption } from 'echarts/core';

// 1. Import the renderer you want to use
import { CanvasRenderer } from 'echarts/renderers';

// 2. Import the chart type you are using (BarChart)
import { BarChart } from 'echarts/charts';

// 3. Import the components you are using (Title, Tooltip, Grid, Legend)
import {
  TitleComponent,
  TooltipComponent,
  GridComponent,
  LegendComponent
} from 'echarts/components';

// 4. Register all the imported components with ECharts
echarts.use([
  CanvasRenderer,
  BarChart,
  TitleComponent,
  TooltipComponent,
  GridComponent,
  LegendComponent
]);

type EChartsOption = EChartsCoreOption;

// --- END: ECHARTS IMPORTS (FIX) ---


const BASE_URL = 'https://10.20.26.21:6868/';
const API_CONGSUATGIUONG = 'api/CongSuatGiuongBenh';

// API Response Interface (matches actual API structure)
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

// Processed Department Data for Chart
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

// Bed Status Totals for Widget Cards (formatted as strings for display)
interface BedStatusTotals {
  giuongTrong: string;
  dangDieuTri: string;
  choXuatVien: string;
  daBook: string;
  chuaSanSang: string;
  choMuonGiuong: string;
}

interface BedStatusSeries {
  name: string;
  dataKey: keyof Omit<DepartmentChartData, 'viName' | 'enName' | 'totalBeds'>;
  color: string;
}

@Component({
  selector: 'app-bed-usage',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './bed-usage.component.html',
  styleUrl: './bed-usage.component.scss'
})
export class BedUsageComponent implements OnInit, OnDestroy {
  @ViewChild('chartContainer', { static: true }) chartContainer!: ElementRef<HTMLDivElement>;

  private http = inject(HttpClient); // Sử dụng inject để láy HttpClient, không cần khai báo trong constructor
  private chartInstance?: EChartsType;
  private resizeListener?: () => void;
  private clockInterval?: ReturnType<typeof setInterval>;
  private refreshCounter = 0;

  // Current date and time for display
  currentDateTime: string = '';

  // Bed status totals for widget cards 
  bedStatusTotals: BedStatusTotals = {
    giuongTrong: '0',
    dangDieuTri: '0',
    choXuatVien: '0',
    daBook: '0',
    chuaSanSang: '0',
    choMuonGiuong: '0'
  };

  // Additional metrics for widget cards
  totalBeds: string = '0';
  occupancyRate: string = '0,00%';

  // Bed status series configuration
  private bedStatusSeries: BedStatusSeries[] = [
    { name: 'Giường trống', dataKey: 'giuongTrong', color: '#66B9C9' },
    { name: 'Đang điều trị', dataKey: 'dangDieuTri', color: '#005E70' },
    { name: 'Chờ xuất viện', dataKey: 'choXuatVien', color: '#66A9C5' },
    { name: 'Đã book', dataKey: 'daBook', color: '#f1c40f' },
    { name: 'Chưa sẵn sàng', dataKey: 'chuaSanSang', color: '#95a5a6' },
    { name: 'Cho mượn giường', dataKey: 'choMuonGiuong', color: '#75b190ff' }
  ];

  ngOnInit(): void {
    this.initChart();
    this.loadData();
    this.setupResizeListener();
    this.startClock();
  }

  // Start the clock that updates every second
  private startClock(): void {
    this.updateClock(); // Initial update
    this.clockInterval = setInterval(() => {
      this.updateClock();
    }, 1000);
  }

  // NEW FORMAT: Update current date and time with format: dd/MM/yyyy HH:mm ( 24h type)
  private updateClock(): void {
    const now = new Date();

    const day = String(now.getDate()).padStart(2, '0');
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const year = now.getFullYear();

    let hours = now.getHours();
    const minutesStr = String(now.getMinutes()).padStart(2, '0');
    
    this.currentDateTime = `${day}/${month}/${year} ${hours}:${minutesStr}`;

    // Tự động refresh data mỗi 60 giây. Gọi hàm loadData() => chạy lại quy trình load data từ API
    this.refreshCounter++;
    if (this.refreshCounter >= 60) {
      this.refreshCounter = 0;
      this.loadData();
    }
  }

  // Format integer with Vietnamese thousands separator (no decimals)
  private formatNumber(value: number): string {
    return new Intl.NumberFormat('vi-VN', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(value);
  }

  // Format percentage with 2 decimals and comma separator (e.g., 88,00%)
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

  // Initialize chart instance
  private initChart(): void {
    const container = this.chartContainer.nativeElement;
    this.chartInstance = echarts.init(container); // This line caused the error, now it's fixed
  }

  // Setup window resize listener for responsive chart
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
        // Transform API data to chart format
        const chartData = this.transformApiData(rawData);

        // Calculate totals for widget cards
        this.calculateBedStatusTotals(rawData);

        // Build and set chart option
        const option = this.buildOption(chartData);
        if (this.chartInstance) {
          this.chartInstance.setOption(option);
        }
      },
      error: (error) => {
        console.error('Error loading bed utilization data:', error);
        // If load fail => get sample data as backup 
        const sampleData = this.getSampleData();

        // tính tổng số giường theo từng trang thái + khoa để hiển thị lên widget card
        const giuongTrongTotal = sampleData.reduce((sum: number, d: DepartmentChartData) => sum + d.giuongTrong, 0);
        const dangDieuTriTotal = sampleData.reduce((sum: number, d: DepartmentChartData) => sum + d.dangDieuTri, 0);
        const choXuatVienTotal = sampleData.reduce((sum: number, d: DepartmentChartData) => sum + d.choXuatVien, 0);
        const daBookTotal = sampleData.reduce((sum: number, d: DepartmentChartData) => sum + d.daBook, 0);
        const chuaSanSangTotal = sampleData.reduce((sum: number, d: DepartmentChartData) => sum + d.chuaSanSang, 0);
        const choMuonGiuongTotal = sampleData.reduce((sum: number, d: DepartmentChartData) => sum + d.choMuonGiuong, 0);
        const totalBedsNumeric = sampleData.reduce((sum: number, d: DepartmentChartData) => sum + d.totalBeds, 0);

        // Format and store for display
        this.bedStatusTotals = {
          giuongTrong: this.formatNumber(giuongTrongTotal),
          dangDieuTri: this.formatNumber(dangDieuTriTotal),
          choXuatVien: this.formatNumber(choXuatVienTotal),
          daBook: this.formatNumber(daBookTotal),
          chuaSanSang: this.formatNumber(chuaSanSangTotal),
          choMuonGiuong: this.formatNumber(choMuonGiuongTotal)
        };

        this.totalBeds = this.formatNumber(totalBedsNumeric);

        // Calculate occupancy rate with all states included
        const occupiedBeds = dangDieuTriTotal + choXuatVienTotal + daBookTotal + chuaSanSangTotal + choMuonGiuongTotal;
        if (totalBedsNumeric > 0) {
          const rate = (occupiedBeds / totalBedsNumeric) * 100;
          this.occupancyRate = this.formatPercentage(rate);
        } else {
          this.occupancyRate = '0,00%';
        }

        const option = this.buildOption(sampleData);
        if (this.chartInstance) {
          this.chartInstance.setOption(option);
        }
      }
    });
  }

  // Transform API response to chart data format
  private transformApiData(apiData: ApiResponseData[]): DepartmentChartData[] {
    return apiData.map(item => {
      //  TenPhongBan: "F5-KHOA HỒI SỨC Intensive Care Unit (ICU) (Σ: 24)"
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

  // Tách department name ra từng khúc
  private parseDepartmentName(fullName: string): { viName: string; enName: string } {
    // Tác theo format: "F5-KHOA HỒI SỨC - Intensive Care Unit (ICU) - (Σ: 24)"
    // Remove khúc thứ 3 (total count)
    const withoutTotal = fullName.replace(/\s*-?\s*\(Σ:\s*\d+\)\s*$/, '').trim();

    // Try to split by " - " separator first (most reliable)
    const parts = withoutTotal.split(/\s+-\s+/);

    if (parts.length >= 2) {
      // First part is Vietnamese, remaining parts are English
      return {
        viName: parts[0].trim(),
        enName: parts.slice(1).join(' - ').trim()
      };
    }

    // Fallback: try to find where English starts (consecutive capital letters)
    const match = withoutTotal.match(/^(.+?)\s+([A-Z][a-zA-Z\s&()]+)$/);
    if (match) {
      return {
        viName: match[1].trim(),
        enName: match[2].trim()
      };
    }

    // If parsing fails, return the whole string as Vietnamese name
    return {
      viName: withoutTotal,
      enName: ''
    };
  }

  // Calculate bed status totals for widget cards
  private calculateBedStatusTotals(apiData: ApiResponseData[]): void {
    // Calculate numeric totals first
    const giuongTrongTotal = apiData.reduce((sum, item) => sum + item.GiuongTrong, 0);
    const dangDieuTriTotal = apiData.reduce((sum, item) => sum + item.DangSuDung, 0);
    const choXuatVienTotal = apiData.reduce((sum, item) => sum + item.ChoXuatVien, 0);
    const daBookTotal = apiData.reduce((sum, item) => sum + item.DaBook, 0);
    const chuaSanSangTotal = apiData.reduce((sum, item) => sum + item.ChuaSanSang, 0);
    const choMuonGiuongTotal = apiData.reduce((sum, item) => sum + item.ChoMuonGiuong, 0);
    const totalBedsNumeric = apiData.reduce((sum, item) => sum + item.Tong, 0);

    // Format and store for display
    this.bedStatusTotals = {
      giuongTrong: this.formatNumber(giuongTrongTotal),
      dangDieuTri: this.formatNumber(dangDieuTriTotal),
      choXuatVien: this.formatNumber(choXuatVienTotal),
      daBook: this.formatNumber(daBookTotal),
      chuaSanSang: this.formatNumber(chuaSanSangTotal),
      choMuonGiuong: this.formatNumber(choMuonGiuongTotal)
    };

    this.totalBeds = this.formatNumber(totalBedsNumeric);

    // Calculate occupancy rate: (dangsudung + choxuatvien + dabook + chuasansang + chomuongiuong) / tong * 100
    const occupiedBeds = dangDieuTriTotal + choXuatVienTotal + daBookTotal + chuaSanSangTotal + choMuonGiuongTotal;

    if (totalBedsNumeric > 0) {
      const rate = (occupiedBeds / totalBedsNumeric) * 100;
      this.occupancyRate = this.formatPercentage(rate);
    } else {
      this.occupancyRate = '0,00%';
    }
  }

  // Build ECharts option 
  private buildOption(data: DepartmentChartData[]): EChartsOption {
    // Use original API value with \r\n line breaks (e.g., "F5-KHOA HỒI SỨC\r\nIntensive Care Unit (ICU)\r\n(Σ: 24)")
    const xAxisData = data.map(item => item.tenPhongBan);

    
    // chỉnh style cho label trục x dựa trên kích thước viewport
    const viewportWidth = window.innerWidth;
    let labelRotation = 22;
    let labelFontSize = 11;
    let labelMargin = 60;
    let gridBottom = '5%';

    if (viewportWidth < 768) {
      // Mobile/tablet: increase rotation, reduce font size
      labelRotation = 25;
      labelFontSize = 10;
      labelMargin = 35;
      gridBottom = '10%';
    } else if (viewportWidth < 1024) {
      // Small desktop: slight adjustments
      labelRotation = 22;
      labelFontSize = 11;
      labelMargin = 40;
      gridBottom = '20%';
    }

    // Create series array (STACKED bars)
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
          // Always show values >= 1, even if space is tight
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
          fontSize: 30,
          fontWeight: 'bold',
          fontFamily: 'Arial, sans-serif'
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

          let result = `<div style="font-weight: bold; margin-bottom: 10px; font-size: 14px;font-family: Arial, sans-serif;">${item.viName}</div>`;
          result += `<div style="margin-bottom: 8px; color: #666;font-family: Arial, sans-serif;">${item.enName}</div>`;

          let total = 0;
          params.forEach((param: any) => {
            if (param.value > 0) {
              total += param.value;
              result += `<div style="margin: 4px 0;font-family: Arial, sans-serif;">`;
              result += `${param.marker} ${param.seriesName}: <strong>${param.value}</strong>`;
              result += `</div>`;
            }
          });

          // Add total beds info
          
          result += `<div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid #ccc; font-weight: bold; font-family: Arial, sans-serif;">`;
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
          fontFamily: 'Arial, sans-serif'
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
          fontFamily: 'Arial, sans-serif',
          align: 'center',
          overflow: 'break',
          hideOverlap: false,
          inside: false,
          fontWeight: 'bold',
          formatter: (value: string) => {
            // API returns value with \r\n, split and apply left alignment styling
            const lines = value.split('\r\n');
            return lines.map(line => `{left|${line}}`).join('\n');
          },
          rich: {
            left: {
              align: 'left',
              fontSize: labelFontSize,
              lineHeight: 18,
              fontFamily: 'Arial, sans-serif',
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
          fontFamily: 'Arial, sans-serif'
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
          fontFamily: 'Arial, sans-serif'
        }
      },
      series: series,
      barCategoryGap: '35%'
    };
  }

  // Sample data for fallback
  private getSampleData(): DepartmentChartData[] {
    return [
      {
        tenPhongBan: 'F5-KHOA HỒI SỨC\r\nIntensive Care Unit\r\n(Σ: 24)',
        viName: 'F5-KHOA HỒI SỨC',
        enName: 'Intensive Care Unit',
        totalBeds: 24,
        giuongTrong: 2,
        dangDieuTri: 20,
        choXuatVien: 1,
        daBook: 0,
        chuaSanSang: 1,
        choMuonGiuong: 0
      },
      {
        tenPhongBan: 'F7-KHOA TIM MẠCH\r\nCardiology Department\r\n(Σ: 47)',
        viName: 'F7-KHOA TIM MẠCH',
        enName: 'Cardiology Department',
        totalBeds: 47,
        giuongTrong: 6,
        dangDieuTri: 40,
        choXuatVien: 0,
        daBook: 1,
        chuaSanSang: 0,
        choMuonGiuong: 0
      },
      {
        tenPhongBan: 'F8-KHOA NỘI TỔNG HỢP\r\General Internal Medicine\r\n(Σ: 40)',
        viName: 'F8-KHOA NỘI TỔNG HỢP',
        enName: 'General Internal Medicine',
        totalBeds: 40,
        giuongTrong: 4,
        dangDieuTri: 32,
        choXuatVien: 2,
        daBook: 1,
        chuaSanSang: 1,
        choMuonGiuong: 0
      },
      {
        tenPhongBan: 'F9-KHOA NGOẠI TỔNG HỢP\r\nGeneral Surgery\r\n(Σ: 40)',
        viName: 'F9-KHOA NGOẠI TỔNG HỢP',
        enName: 'General Surgery',
        totalBeds: 40,
        giuongTrong: 8,
        dangDieuTri: 28,
        choXuatVien: 1,
        daBook: 2,
        chuaSanSang: 0,
        choMuonGiuong: 1

      },
      {
        tenPhongBan: 'F10-KHOA NỘI TỔNG HỢP\r\nOrthopedics\r\n(Σ: 40)',
        viName: 'F10-KHOA NỘI TỔNG HỢP',
        enName: 'Orthopedics',
        totalBeds: 40,
        giuongTrong: 7,
        dangDieuTri: 30,
        choXuatVien: 1,
        daBook: 2,
        chuaSanSang: 0,
        choMuonGiuong: 0
      },
      {
        tenPhongBan: 'F11-KHOA SẢN PHỤ KHOA\r\nObstetrics & Gynecology\r\n(Σ: 53)',
        viName: 'F11-KHOA SẢN PHỤ KHOA',
        enName: 'Obstetrics & Gynecology',
        totalBeds: 53,
        giuongTrong: 10,
        dangDieuTri: 35,
        choXuatVien: 3,
        daBook: 3,
        chuaSanSang: 2,
        choMuonGiuong: 0
      },
      {
        tenPhongBan: 'F11-KHOA NHI\r\nPediatrics Department\r\n(Σ: 34)',
        viName: 'F11-KHOA NHI',
        enName: 'Pediatrics Department',
        totalBeds: 34,
        giuongTrong: 5,
        dangDieuTri: 25,
        choXuatVien: 2,
        daBook: 1,
        chuaSanSang: 1,
        choMuonGiuong: 0
      }

    ];
  } 
}