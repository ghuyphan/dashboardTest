import {
  Component,
  OnInit,
  inject,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  effect,
} from '@angular/core';
import { CommonModule, DatePipe, DecimalPipe } from '@angular/common';
import { finalize } from 'rxjs/operators';
import type { EChartsCoreOption } from 'echarts/core';

import { ReportService } from '../../../core/services/report.service';
import { ToastService } from '../../../core/services/toast.service';
import { ThemeService, ThemePalette } from '../../../core/services/theme.service';
import { ClsLevel6Stat } from '../../../shared/models/cls-stat.model';
import { ExcelExportService, ExportColumn } from '../../../core/services/excel-export.service';
import { DateUtils } from '../../../shared/utils/date.utils';

// UI Components
import { ChartCardComponent } from '../../../components/chart-card/chart-card.component';
import { DateFilterComponent, DateRange } from '../../../components/date-filter/date-filter.component';
import { TableCardComponent } from '../../../components/table-card/table-card.component';
import { GridColumn } from '../../../components/reusable-table/reusable-table.component';
import { WidgetCardComponent } from '../../../components/widget-card/widget-card.component';

const GLOBAL_FONT_FAMILY = 'Inter, sans-serif';

interface WidgetData {
  id: string;
  icon: string;
  title: string;
  value: string;
  caption: string;
  accentColor: string;
}

@Component({
  selector: 'app-cls-level6-report',
  standalone: true,
  imports: [
    CommonModule,
    ChartCardComponent,
    TableCardComponent,
    DateFilterComponent,
    WidgetCardComponent,
  ],
  providers: [DatePipe, DecimalPipe],
  templateUrl: './cls-level6-report.component.html',
  styleUrl: './cls-level6-report.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ClsLevel6ReportComponent implements OnInit {
  private reportService = inject(ReportService);
  private toastService = inject(ToastService);
  private excelService = inject(ExcelExportService);
  private cd = inject(ChangeDetectorRef);
  private datePipe = inject(DatePipe);
  private numberPipe = inject(DecimalPipe);
  public readonly themeService = inject(ThemeService);

  public isLoading = false;
  public isExporting = false;
  
  public rawData: ClsLevel6Stat[] = [];
  public fromDate: string = '';
  public toDate: string = '';

  // Widgets
  public widgetData: WidgetData[] = [];

  // Charts (Separated)
  public clsTrendOptions: EChartsCoreOption | null = null;
  public admissionTrendOptions: EChartsCoreOption | null = null;
  
  public roomChartOptions: EChartsCoreOption | null = null;
  public groupChartOptions: EChartsCoreOption | null = null;

  // Table Config
  public tableColumns: GridColumn[] = [
    { key: 'NGAY_TH_DISPLAY', label: 'Ngày thực hiện', sortable: true, width: '120px' },
    { key: 'PHONG_BAN_TH', label: 'Phòng ban', sortable: true, width: '200px' },
    { key: 'NHOM_DICH_VU', label: 'Nhóm dịch vụ', sortable: true, width: '200px' },
    { key: 'SO_LUONG', label: 'SL Cận Lâm Sàng', sortable: true, width: '120px' },
    { key: 'SO_LUONG_NV', label: 'SL Nhập Viện', sortable: true, width: '120px' },
  ];

  private palette!: ThemePalette;

  constructor() {
    effect(() => {
      this.palette = this.themeService.currentPalette();
      // If we have data, rebuild charts to apply new theme colors
      if (!this.isLoading && this.rawData.length > 0) {
        this.processData(this.rawData);
      }
      // Ensure widgets have correct colors on theme switch
      this.updateWidgetColors();
      this.cd.markForCheck();
    });
  }

  ngOnInit(): void {
    this.setDefaultDateRange();
    // Initialize widgets with 0 so they render immediately (enabling animation later)
    this.initializeWidgets(); 
    this.loadData();
  }

  private setDefaultDateRange(): void {
    const now = new Date();
    const day = now.getDay();
    const diff = now.getDate() - day + (day == 0 ? -6 : 1);
    const start = new Date(now.setDate(diff));
    const end = new Date(now.setDate(start.getDate() + 6));

    this.fromDate = this.datePipe.transform(start, 'yyyy-MM-dd') || '';
    this.toDate = this.datePipe.transform(end, 'yyyy-MM-dd') || '';
  }

  private initializeWidgets(): void {
    // Initialize with default "0" values to ensure components are created
    // This allows the animation to trigger when values change from "0" -> "Actual"
    this.widgetData = [
      {
        id: 'total',
        icon: 'fas fa-microscope',
        title: 'Tổng Cận Lâm Sàng',
        value: '0',
        caption: 'Tổng lượt chỉ định',
        accentColor: this.palette?.primary || '#00839b'
      },
      {
        id: 'admission',
        icon: 'fas fa-procedures',
        title: 'Tổng Nhập Viện',
        value: '0',
        caption: 'Số ca nhập viện',
        accentColor: this.palette?.pastelCoral || '#ffb3ba'
      },
      {
        id: 'rate',
        icon: 'fas fa-chart-pie',
        title: 'Tỷ Lệ Nhập Viện',
        value: '0%',
        caption: 'Trên tổng chỉ định CLS',
        accentColor: this.palette?.warning || '#f59e0b'
      },
      {
        id: 'top-room',
        icon: 'fas fa-door-open',
        title: 'Phòng Đông Nhất',
        value: '0',
        caption: 'Đang tải...',
        accentColor: this.palette?.deepSapphire || '#082567'
      }
    ];
  }

  private updateWidgetColors(): void {
    if (this.widgetData.length > 0 && this.palette) {
      const setC = (id: string, color: string) => {
        const item = this.widgetData.find(x => x.id === id);
        if (item) item.accentColor = color;
      };
      setC('total', this.palette.primary);
      setC('admission', this.palette.pastelCoral);
      setC('rate', this.palette.warning);
      setC('top-room', this.palette.deepSapphire);
    }
  }

  public onDateFilter(range: DateRange): void {
    this.fromDate = range.fromDate;
    this.toDate = range.toDate;
    this.loadData();
  }

  public loadData(): void {
    if (!this.fromDate || !this.toDate) return;

    this.isLoading = true;
    // DO NOT clear widgetData here (this.widgetData = []). 
    // Keeping the old data allows the skeleton overlay to work properly 
    // and prevents the component from being destroyed, ensuring animation works.
    
    this.clsTrendOptions = null;
    this.admissionTrendOptions = null;
    this.roomChartOptions = null;
    this.groupChartOptions = null;
    this.cd.markForCheck();
    
    this.reportService.getClsLevel6Report(this.fromDate, this.toDate)
      .pipe(
        finalize(() => {
          this.isLoading = false;
          this.cd.markForCheck();
        })
      )
      .subscribe({
        next: (data) => {
          this.rawData = data.map(item => ({
            ...item,
            NGAY_TH_DISPLAY: DateUtils.formatToDisplay(item.NGAY_TH)
          }));
          
          this.processData(this.rawData);
        },
        error: (err) => {
          console.error(err);
          this.toastService.showError('Không thể tải dữ liệu báo cáo.');
          this.rawData = [];
          // Re-init to 0 if error occurs to show empty state properly
          this.initializeWidgets(); 
        }
      });
  }

  private processData(data: ClsLevel6Stat[]): void {
    // Even if empty, we want to keep the widget structure but with 0s
    if (!data || data.length === 0) {
        this.initializeWidgets();
        return;
    }

    const roomMap = new Map<string, number>();
    const groupMap = new Map<string, number>();
    const dateMap = new Map<string, { total: number, admission: number }>();

    let totalQuantity = 0;
    let totalAdmission = 0;

    data.forEach(i => {
      const qty = i.SO_LUONG || 0;
      const admissionQty = i.SO_LUONG_NV || 0;

      totalQuantity += qty;
      totalAdmission += admissionQty;

      // Room Stats
      const roomName = i.PHONG_BAN_TH || 'Khác';
      roomMap.set(roomName, (roomMap.get(roomName) || 0) + qty);

      // Group Stats
      const groupName = i.NHOM_DICH_VU || 'Chưa phân nhóm';
      groupMap.set(groupName, (groupMap.get(groupName) || 0) + qty);

      // Date Stats
      const dateKey = i.NGAY_TH ? i.NGAY_TH.split('T')[0] : 'N/A';
      const dayStats = dateMap.get(dateKey) || { total: 0, admission: 0 };
      dayStats.total += qty;
      dayStats.admission += admissionQty;
      dateMap.set(dateKey, dayStats);
    });

    // --- Widgets ---
    const admissionRate = totalQuantity > 0 ? (totalAdmission / totalQuantity) * 100 : 0;
    const sortedRooms = Array.from(roomMap.entries()).sort((a, b) => b[1] - a[1]);

    // Create new array to trigger change detection
    // Important: Keep IDs the same so Angular's trackBy preserves the DOM elements
    this.widgetData = [
      {
        id: 'total',
        icon: 'fas fa-microscope',
        title: 'Tổng Cận Lâm Sàng',
        value: this.formatNumber(totalQuantity),
        caption: 'Tổng lượt chỉ định',
        accentColor: this.palette.primary
      },
      {
        id: 'admission',
        icon: 'fas fa-procedures',
        title: 'Tổng Nhập Viện',
        value: this.formatNumber(totalAdmission),
        caption: 'Số ca nhập viện',
        accentColor: this.palette.pastelCoral 
      },
      {
        id: 'rate',
        icon: 'fas fa-chart-pie',
        title: 'Tỷ Lệ Nhập Viện',
        value: `${this.formatNumber(admissionRate)}%`,
        caption: 'Trên tổng chỉ định CLS',
        accentColor: this.palette.warning
      },
      {
        id: 'top-room',
        icon: 'fas fa-door-open',
        title: 'Phòng Đông Nhất',
        value: sortedRooms[0] ? this.formatNumber(sortedRooms[0][1]) : '0',
        caption: sortedRooms[0] ? sortedRooms[0][0] : 'N/A',
        accentColor: this.palette.deepSapphire
      }
    ];

    this.buildCharts(roomMap, groupMap, dateMap);
  }

  private buildCharts(
    roomMap: Map<string, number>, 
    groupMap: Map<string, number>, 
    dateMap: Map<string, { total: number, admission: number }>
  ): void {
    
    const commonOptions = {
      backgroundColor: 'transparent',
      textStyle: { fontFamily: GLOBAL_FONT_FAMILY, color: this.palette.textSecondary },
      tooltip: {
        trigger: 'axis',
        backgroundColor: this.palette.bgCard,
        borderColor: this.palette.gray200,
        textStyle: { color: this.palette.textPrimary }
      },
      grid: { left: '3%', right: '4%', bottom: '5%', top: '12%', containLabel: true },
    };

    const sortedDates = Array.from(dateMap.keys()).sort();
    const dateLabels = sortedDates.map(d => {
       const dateObj = new Date(d);
       return this.datePipe.transform(dateObj, 'dd/MM') || d;
    });

    const totalSeriesData = sortedDates.map(d => dateMap.get(d)?.total);
    const admissionSeriesData = sortedDates.map(d => dateMap.get(d)?.admission);

    // --- 1. CLS Trend Chart (Blue) ---
    this.clsTrendOptions = {
      ...commonOptions,
      legend: { show: false },
      xAxis: {
        type: 'category',
        boundaryGap: false,
        data: dateLabels,
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { color: this.palette.textPrimary }
      },
      yAxis: {
        type: 'value',
        splitLine: { lineStyle: { type: 'dashed', color: this.palette.gray200 } }
      },
      series: [{
        name: 'Chỉ Định CLS',
        type: 'line',
        smooth: true,
        // [UPDATED] Set symbol to circle to show dots for days
        symbol: 'circle',
        symbolSize: 6,
        data: totalSeriesData,
        itemStyle: { color: this.palette.primary },
        areaStyle: {
          color: {
            type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: this.palette.primary },
              { offset: 1, color: this.palette.bgCard }
            ]
          },
          opacity: 0.2
        }
      }]
    };

    // --- 2. Admission Trend Chart (Pastel Coral) ---
    this.admissionTrendOptions = {
      ...commonOptions,
      legend: { show: false },
      xAxis: {
        type: 'category',
        boundaryGap: false,
        data: dateLabels,
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { color: this.palette.textPrimary }
      },
      yAxis: {
        type: 'value',
        splitLine: { lineStyle: { type: 'dashed', color: this.palette.gray200 } }
      },
      series: [{
        name: 'Nhập Viện',
        type: 'line',
        smooth: true,
        symbol: 'circle',
        symbolSize: 6,
        data: admissionSeriesData,
        itemStyle: { color: this.palette.pastelCoral }, 
        lineStyle: { width: 3 },
        areaStyle: {
          color: {
            type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: this.palette.pastelCoral }, 
              { offset: 1, color: this.palette.bgCard }       
            ]
          },
          opacity: 0.2
        }
      }]
    };

    // --- 3. Room Chart ---
    const roomData = Array.from(roomMap.entries()).sort((a, b) => a[1] - b[1]);

    this.roomChartOptions = {
      ...commonOptions,
      grid: { left: '3%', right: '8%', bottom: '3%', top: '5%', containLabel: true },
      xAxis: {
        type: 'value',
        splitLine: { lineStyle: { type: 'dashed', color: this.palette.gray200 } }
      },
      yAxis: {
        type: 'category',
        data: roomData.map(d => d[0]),
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { width: 140, overflow: 'truncate', color: this.palette.textPrimary }
      },
      series: [{
        name: 'Số Lượng',
        type: 'bar',
        barWidth: '60%',
        data: roomData.map(d => d[1]),
        itemStyle: { 
            color: this.palette.secondary, 
            borderRadius: [0, 4, 4, 0] 
        },
        label: {
            show: true,
            position: 'right',
            color: this.palette.textSecondary,
            formatter: '{c}'
        }
      }]
    };

    // --- 4. Group Chart ---
    const groupData = Array.from(groupMap, ([name, value]) => ({ name, value }))
        .sort((a, b) => b.value - a.value);

    this.groupChartOptions = {
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'item',
        backgroundColor: this.palette.bgCard,
        borderColor: this.palette.gray200,
        textStyle: { color: this.palette.textPrimary },
        formatter: '{b}: <b>{c}</b> ({d}%)'
      },
      legend: { 
        type: 'scroll',
        orient: 'vertical',
        right: 0,
        top: 'center',
        textStyle: { color: this.palette.textSecondary } 
      },
      series: [{
        name: 'Nhóm Dịch Vụ',
        type: 'pie',
        radius: ['45%', '75%'],
        center: ['40%', '50%'],
        avoidLabelOverlap: false,
        itemStyle: {
          borderRadius: 5,
          borderColor: this.palette.bgCard,
          borderWidth: 2
        },
        label: { show: false },
        data: groupData
      }]
    };
  }

  private formatNumber(num: number): string {
    return this.numberPipe.transform(num, '1.0-0') || '0';
  }

  public onExport(): void {
    if (this.isExporting || !this.rawData.length) return;

    this.isExporting = true;
    setTimeout(() => {
        const columns: ExportColumn[] = [
            { key: 'NGAY_TH', header: 'Ngày Thực Hiện', type: 'date' },
            { key: 'PHONG_BAN_TH', header: 'Phòng Ban' },
            { key: 'NHOM_DICH_VU', header: 'Nhóm Dịch Vụ' },
            { key: 'SO_LUONG', header: 'SL Cận Lâm Sàng' },
            { key: 'SO_LUONG_NV', header: 'SL Nhập Viện' },
        ];

        this.excelService.exportToExcel(
            this.rawData,
            `BaoCao_CLS_Tang6_${this.fromDate}_${this.toDate}`,
            columns
        );

        this.isExporting = false;
        this.toastService.showSuccess('Xuất Excel thành công.');
        this.cd.markForCheck();
    }, 500);
  }
}