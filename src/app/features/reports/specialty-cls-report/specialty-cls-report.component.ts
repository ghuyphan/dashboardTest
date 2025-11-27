import {
  Component,
  OnInit,
  inject,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  effect,
} from '@angular/core';
import { CommonModule, DecimalPipe, DatePipe } from '@angular/common';
import { finalize } from 'rxjs/operators';
import type { EChartsCoreOption } from 'echarts/core';

import { ReportService } from '../../../core/services/report.service';
import { ToastService } from '../../../core/services/toast.service';
import { ThemeService, ThemePalette } from '../../../core/services/theme.service';
import { ExcelExportService, ExportColumn } from '../../../core/services/excel-export.service';
import { SpecialtyClsStat } from '../../../shared/models/specialty-cls-stat.model';
import { DateUtils } from '../../../shared/utils/date.utils';

import { ChartCardComponent } from '../../../components/chart-card/chart-card.component';
import { DateFilterComponent, DateRange } from '../../../components/date-filter/date-filter.component';
import { TableCardComponent } from '../../../components/table-card/table-card.component';
import { GridColumn } from '../../../components/reusable-table/reusable-table.component';
import { WidgetCardComponent } from '../../../components/widget-card/widget-card.component';

const GLOBAL_FONT_FAMILY = 'Inter, sans-serif';
const MAX_RANGE_DAYS = 92; // Approx 1 Quarter (3 months)

interface WidgetData {
  id: string;
  icon: string;
  title: string;
  value: string;
  caption: string;
  accentColor: string;
}

@Component({
  selector: 'app-specialty-cls-report',
  standalone: true,
  imports: [
    CommonModule,
    ChartCardComponent,
    TableCardComponent,
    DateFilterComponent,
    WidgetCardComponent,
  ],
  providers: [DatePipe, DecimalPipe],
  templateUrl: './specialty-cls-report.component.html',
  styleUrl: './specialty-cls-report.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SpecialtyClsReportComponent implements OnInit {
  private reportService = inject(ReportService);
  private toastService = inject(ToastService);
  private excelService = inject(ExcelExportService);
  private cd = inject(ChangeDetectorRef);
  private datePipe = inject(DatePipe);
  private numberPipe = inject(DecimalPipe);
  public readonly themeService = inject(ThemeService);

  public isLoading = false;
  public isExporting = false;
  
  public rawData: SpecialtyClsStat[] = [];
  public fromDate: string = '';
  public toDate: string = '';

  public widgetData: WidgetData[] = [];
  
  // Charts
  public specialtyChartOptions: EChartsCoreOption | null = null;
  public groupPieChartOptions: EChartsCoreOption | null = null;
  public topSpecialtyChartOptions: EChartsCoreOption | null = null;

  public tableColumns: GridColumn[] = [
    { key: 'TEN_CHUYEN_KHOA', label: 'Chuyên Khoa', sortable: true, width: '40%' },
    { key: 'NHOM_CLS', label: 'Nhóm Dịch Vụ', sortable: true, width: '40%' },
    { key: 'SO_LUONG', label: 'Số Lượng', sortable: true, width: '20%' },
  ];

  private palette!: ThemePalette;
  private readonly vnNumberFormatter = new Intl.NumberFormat('vi-VN');

  constructor() {
    effect(() => {
      this.palette = this.themeService.currentPalette();
      if (!this.isLoading && this.rawData.length > 0) {
        this.processData(this.rawData);
      }
      // Update widgets whenever palette changes
      this.updateWidgetColors();
      this.cd.markForCheck();
    });
  }

  ngOnInit(): void {
    this.setDefaultDateRange();
    this.initializeWidgets();
    this.loadData();
  }

  private setDefaultDateRange(): void {
    // [UPDATED] Default to "This Week" (Monday to Sunday)
    const now = new Date();
    const day = now.getDay();
    // Calculate diff to get to Monday (Day 1). If Sunday (0), substract 6.
    const diff = now.getDate() - day + (day === 0 ? -6 : 1);
    
    const start = new Date(now.setDate(diff));
    const end = new Date(now.setDate(start.getDate() + 6));

    this.fromDate = this.datePipe.transform(start, 'yyyy-MM-dd') || '';
    this.toDate = this.datePipe.transform(end, 'yyyy-MM-dd') || '';
  }

  private initializeWidgets(): void {
    this.widgetData = [
      { id: 'total-kham', icon: 'fas fa-user-md', title: 'Tổng Lượt Khám', value: '0', caption: 'Khám bệnh', accentColor: '' },
      { id: 'total-cls', icon: 'fas fa-flask', title: 'Tổng Chỉ Định CLS', value: '0', caption: 'Cận lâm sàng', accentColor: '' },
      { id: 'top-specialty', icon: 'fas fa-star', title: 'CK Đông Nhất', value: '...', caption: 'Hoạt động cao nhất', accentColor: '' }
    ];
  }

  private updateWidgetColors(): void {
    if (this.widgetData.length > 0 && this.palette) {
      const setC = (id: string, color: string) => {
        const item = this.widgetData.find(x => x.id === id);
        if (item) item.accentColor = color;
      };
      // Use colors directly from ThemeService
      setC('total-kham', this.palette.primary);      // Main Brand Color
      setC('total-cls', this.palette.chart6);        // Secondary/Orange
      setC('top-specialty', this.palette.deepSapphire); // Navy Blue
    }
  }

  public onDateFilter(range: DateRange): void {
    // [UPDATED] Validate Range Limit (Max 1 Quarter / ~92 Days)
    const start = DateUtils.parse(range.fromDate);
    const end = DateUtils.parse(range.toDate);

    if (start && end) {
      const diffTime = Math.abs(end.getTime() - start.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      if (diffDays > MAX_RANGE_DAYS) {
        this.toastService.showWarning('Vui lòng chọn khoảng thời gian tối đa 1 quý (3 tháng) để đảm bảo hiệu năng.');
        
        // Optionally reset the inputs to previous valid state or just stop
        // For now, we just stop the loading process.
        return;
      }
    }

    this.fromDate = range.fromDate;
    this.toDate = range.toDate;
    this.loadData();
  }

  public loadData(): void {
    if (!this.fromDate || !this.toDate) return;

    this.isLoading = true;
    this.specialtyChartOptions = null;
    this.groupPieChartOptions = null;
    this.topSpecialtyChartOptions = null;
    this.cd.markForCheck();
    
    this.reportService.getSpecialtyClsReport(this.fromDate, this.toDate)
      .pipe(
        finalize(() => {
          this.isLoading = false;
          this.cd.markForCheck();
        })
      )
      .subscribe({
        next: (data) => {
          this.rawData = data || [];
          this.processData(this.rawData);
        },
        error: (err) => {
          console.error(err);
          this.toastService.showError('Không thể tải dữ liệu báo cáo.');
          this.rawData = [];
          this.initializeWidgets(); 
        }
      });
  }

  private processData(data: SpecialtyClsStat[]): void {
    if (!data || data.length === 0) {
        this.initializeWidgets();
        return;
    }

    let totalKham = 0;
    let totalCls = 0;
    
    const specialtyTotals = new Map<string, number>();
    const groupTotals = new Map<string, number>();
    const uniqueSpecialties = new Set<string>();
    const uniqueGroups = new Set<string>();

    data.forEach(item => {
      const qty = item.SO_LUONG || 0;
      const group = item.NHOM_CLS || 'Khác';
      const specialty = item.TEN_CHUYEN_KHOA || 'Chưa xác định';

      const lowerGroup = group.toLowerCase();
      if (lowerGroup.includes('khám') || lowerGroup.includes('kham')) {
        totalKham += qty;
      } else {
        totalCls += qty;
      }

      specialtyTotals.set(specialty, (specialtyTotals.get(specialty) || 0) + qty);
      groupTotals.set(group, (groupTotals.get(group) || 0) + qty);
      uniqueSpecialties.add(specialty);
      uniqueGroups.add(group);
    });

    const sortedSpecialties = Array.from(specialtyTotals.entries())
        .sort((a, b) => b[1] - a[1]);
        
    const topSpecialtyName = sortedSpecialties.length ? sortedSpecialties[0][0] : 'N/A';
    const topSpecialtyValue = sortedSpecialties.length ? sortedSpecialties[0][1] : 0;

    // Update Widgets (Values)
    this.widgetData = [
      { id: 'total-kham', icon: 'fas fa-user-md', title: 'Tổng Lượt Khám', value: this.formatNumber(totalKham), caption: 'Khám bệnh', accentColor: this.palette.primary },
      { id: 'total-cls', icon: 'fas fa-flask', title: 'Tổng Chỉ Định CLS', value: this.formatNumber(totalCls), caption: 'Cận lâm sàng', accentColor: this.palette.chart6 },
      { id: 'top-specialty', icon: 'fas fa-star', title: topSpecialtyName, value: this.formatNumber(topSpecialtyValue), caption: 'Hoạt động cao nhất', accentColor: this.palette.deepSapphire }
    ];

    const sortedSpecialtyNames = sortedSpecialties.map(s => s[0]); // Sort charts by highest volume
    const sortedGroups = Array.from(uniqueGroups).sort();

    this.buildCharts(data, sortedSpecialtyNames, sortedGroups, groupTotals, sortedSpecialties);
  }

  private buildCharts(
    data: SpecialtyClsStat[], 
    specialties: string[], 
    groups: string[],
    groupTotals: Map<string, number>,
    sortedSpecialties: [string, number][]
  ): void {
    
    const themePalette = [
      this.palette.primary,       // Teal Blue
      this.palette.chart6,        // Orange
      this.palette.deepSapphire,  // Navy
      this.palette.pastelCoral,   // Coral/Pink
      this.palette.chart3,        // Aqua
      this.palette.chart8,        // Teal Midtone
      this.palette.warning,       // Yellow
      this.palette.chart2,        // Peacock Blue
      this.palette.success        // Green
    ];

    const commonOptions = {
      backgroundColor: 'transparent',
      color: themePalette,
      textStyle: { fontFamily: GLOBAL_FONT_FAMILY, color: this.palette.textSecondary },
    };

    // === 1. Main Stacked Bar Chart (with DataZoom) ===
    const series = groups.map(group => ({
      name: group,
      type: 'bar',
      stack: 'total',
      barWidth: '60%', // Relative width better for zoom
      emphasis: { focus: 'series' },
      data: specialties.map(spec => {
        const record = data.find(d => d.TEN_CHUYEN_KHOA === spec && d.NHOM_CLS === group);
        return record ? record.SO_LUONG : 0;
      })
    }));

    // Calculate initial zoom window (show approx 15 items max)
    const dataLength = specialties.length;
    const endPercent = dataLength > 15 ? (15 / dataLength) * 100 : 100;

    this.specialtyChartOptions = {
      ...commonOptions,
      tooltip: {
        trigger: 'axis',
        backgroundColor: this.palette.bgCard,
        borderColor: this.palette.gray200,
        textStyle: { color: this.palette.textPrimary },
        axisPointer: { type: 'shadow' }
      },
      grid: { 
        left: '2%', 
        right: '2%', 
        bottom: '15%', // Increased bottom padding for slider and labels
        top: '12%', 
        containLabel: true 
      },
      legend: {
        type: 'scroll',
        top: 0,
        textStyle: { color: this.palette.textSecondary }
      },
      dataZoom: [
        {
          type: 'slider',
          show: true,
          xAxisIndex: [0],
          start: 0,
          end: endPercent,
          bottom: 10,
          height: 20,
          borderColor: 'transparent',
          backgroundColor: this.palette.gray100,
          fillerColor: 'rgba(0, 131, 155, 0.2)', // Using a transparent teal
          handleStyle: {
              color: this.palette.primary
          }
        },
        {
          type: 'inside',
          xAxisIndex: [0],
          start: 0,
          end: endPercent,
          zoomOnMouseWheel: false, // Prevent accidental zoom when scrolling page
          moveOnMouseWheel: true,
        }
      ],
      xAxis: {
        type: 'category',
        data: specialties,
        axisLabel: { 
          interval: 0, // Force show all labels
          rotate: 45,  // Angle for long text
          fontSize: 10,
          width: 140, 
          overflow: 'truncate',
          color: this.palette.textPrimary 
        },
        axisLine: { lineStyle: { color: this.palette.gray200 } }
      },
      yAxis: {
        type: 'value',
        splitLine: { lineStyle: { type: 'dashed', color: this.palette.gray200 } },
        axisLabel: { color: this.palette.textSecondary }
      },
      series: series as any
    };

    // === 2. Group Pie Chart (Side-by-Side) ===
    const pieData = Array.from(groupTotals.entries())
        .map(([name, value]) => ({ name, value }))
        .sort((a, b) => b.value - a.value);
    
    this.groupPieChartOptions = {
      ...commonOptions,
      tooltip: {
        trigger: 'item',
        backgroundColor: this.palette.bgCard,
        borderColor: this.palette.gray200,
        textStyle: { color: this.palette.textPrimary },
        formatter: (params: any) => {
          return `${params.name}: <b>${this.vnNumberFormatter.format(params.value)}</b> (${params.percent}%)`;
        }
      },
      legend: {
        type: 'scroll',
        orient: 'horizontal',
        bottom: 0,
        left: 'center',
        textStyle: { color: this.palette.textSecondary }
      },
      series: [
        {
          name: 'Nhóm Dịch Vụ',
          type: 'pie',
          radius: ['35%', '60%'],
          center: ['50%', '50%'],
          avoidLabelOverlap: true,
          itemStyle: {
            borderRadius: 4,
            borderColor: this.palette.bgCard,
            borderWidth: 2
          },
          label: {
            show: true,
            position: 'outside',
            formatter: (params: any) => `${params.name}\n${params.percent}%`,
            color: this.palette.textPrimary,
          },
          labelLine: {
            show: true,
            length: 10,
            length2: 10,
            smooth: 0.2
          },
          data: pieData
        }
      ]
    };

    const top10Data = sortedSpecialties.slice(0, 10).reverse();
    
    this.topSpecialtyChartOptions = {
      ...commonOptions,
      tooltip: {
        trigger: 'axis',
        backgroundColor: this.palette.bgCard,
        borderColor: this.palette.gray200,
        textStyle: { color: this.palette.textPrimary },
      },
      grid: {
        left: '3%',
        right: '8%',
        bottom: '3%',
        top: '5%',
        containLabel: true
      },
      xAxis: {
        type: 'value',
        splitLine: { lineStyle: { type: 'dashed', color: this.palette.gray200 } }
      },
      yAxis: {
        type: 'category',
        data: top10Data.map(d => d[0]),
        axisLabel: { 
          width: 130, 
          overflow: 'truncate',
          color: this.palette.textPrimary 
        },
        axisLine: { show: false },
        axisTick: { show: false }
      },
      series: [
        {
          name: 'Tổng Lượt',
          type: 'bar',
          barWidth: '60%',
          data: top10Data.map(d => d[1]),
          itemStyle: { 
            color: (params: any) => {
              return themePalette[(top10Data.length - 1 - params.dataIndex) % themePalette.length];
            },
            borderRadius: [0, 4, 4, 0] 
          },
          label: {
            show: true,
            position: 'right',
            color: this.palette.textSecondary,
          }
        }
      ]
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
            { key: 'TEN_CHUYEN_KHOA', header: 'Chuyên Khoa' },
            { key: 'NHOM_CLS', header: 'Nhóm Dịch Vụ' },
            { key: 'SO_LUONG', header: 'Số Lượng' },
        ];

        this.excelService.exportToExcel(
            this.rawData,
            `BaoCao_KhamCLS_ChuyenKhoa_${this.fromDate}_${this.toDate}`,
            columns
        );

        this.isExporting = false;
        this.toastService.showSuccess('Xuất Excel thành công.');
        this.cd.markForCheck();
    }, 500);
  }
}