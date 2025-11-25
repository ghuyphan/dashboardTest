import {
  Component,
  OnInit,
  inject,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  effect,
} from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
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

const GLOBAL_FONT_FAMILY = 'Inter, sans-serif';

@Component({
  selector: 'app-cls-level6-report',
  standalone: true,
  imports: [
    CommonModule,
    ChartCardComponent,
    TableCardComponent,
    DateFilterComponent
  ],
  providers: [DatePipe],
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
  public readonly themeService = inject(ThemeService);

  public isLoading = false;
  public isExporting = false;
  
  public rawData: ClsLevel6Stat[] = [];
  public fromDate: string = '';
  public toDate: string = '';

  // Charts
  public roomChartOptions: EChartsCoreOption | null = null;
  public groupChartOptions: EChartsCoreOption | null = null;

  // Table Config
  public tableColumns: GridColumn[] = [
    { key: 'NGAY_TH_DISPLAY', label: 'Ngày thực hiện', sortable: true, width: '120px' },
    { key: 'PHONG_BAN_TH', label: 'Phòng ban', sortable: true, width: '200px' },
    { key: 'NHOM_DICH_VU', label: 'Nhóm dịch vụ', sortable: true, width: '200px' },
    { key: 'SO_LUONG', label: 'Số lượng', sortable: true, width: '100px' },
    { key: 'SO_LUONG_NV', label: 'SL Nhân viên', sortable: true, width: '120px' },
  ];

  private palette!: ThemePalette;

  constructor() {
    effect(() => {
      this.palette = this.themeService.currentPalette();
      if (!this.isLoading && this.rawData.length > 0) {
        this.buildCharts(this.rawData);
      }
      this.cd.markForCheck();
    });
  }

  ngOnInit(): void {
    this.setDefaultDateRange();
    this.loadData();
  }

  private setDefaultDateRange(): void {
    const now = new Date();
    // Default to current week
    const day = now.getDay();
    const diff = now.getDate() - day + (day == 0 ? -6 : 1);
    const start = new Date(now.setDate(diff));
    const end = new Date(now.setDate(start.getDate() + 6));

    this.fromDate = this.datePipe.transform(start, 'yyyy-MM-dd') || '';
    this.toDate = this.datePipe.transform(end, 'yyyy-MM-dd') || '';
  }

  public onDateFilter(range: DateRange): void {
    this.fromDate = range.fromDate;
    this.toDate = range.toDate;
    this.loadData();
  }

  public loadData(): void {
    if (!this.fromDate || !this.toDate) return;

    this.isLoading = true;
    this.roomChartOptions = null;
    this.groupChartOptions = null;
    
    this.reportService.getClsLevel6Report(this.fromDate, this.toDate)
      .pipe(
        finalize(() => {
          this.isLoading = false;
          this.cd.markForCheck();
        })
      )
      .subscribe({
        next: (data) => {
          // Format data for display
          this.rawData = data.map(item => ({
            ...item,
            NGAY_TH_DISPLAY: DateUtils.formatToDisplay(item.NGAY_TH) // Create a display field for the table
          }));
          
          this.buildCharts(this.rawData);
        },
        error: (err) => {
          console.error(err);
          this.toastService.showError('Không thể tải dữ liệu báo cáo.');
          this.rawData = [];
        }
      });
  }

  private buildCharts(data: ClsLevel6Stat[]): void {
    if (!data || data.length === 0) return;

    // 1. Aggregate by Room (Phòng Ban)
    const roomMap = new Map<string, number>();
    data.forEach(i => {
      const key = i.PHONG_BAN_TH || 'Khác';
      roomMap.set(key, (roomMap.get(key) || 0) + i.SO_LUONG);
    });

    const roomData = Array.from(roomMap, ([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value); // Top values first

    // 2. Aggregate by Group (Nhóm Dịch Vụ)
    const groupMap = new Map<string, number>();
    data.forEach(i => {
      const key = i.NHOM_DICH_VU || 'Chưa phân nhóm';
      groupMap.set(key, (groupMap.get(key) || 0) + i.SO_LUONG);
    });

    const groupData = Array.from(groupMap, ([name, value]) => ({ name, value }));

    // 3. Build Chart Options
    const commonOptions = {
      backgroundColor: 'transparent',
      textStyle: { fontFamily: GLOBAL_FONT_FAMILY, color: this.palette.textSecondary },
      tooltip: {
        trigger: 'item',
        backgroundColor: this.palette.bgCard,
        borderColor: this.palette.gray200,
        textStyle: { color: this.palette.textPrimary }
      }
    };

    // Chart 1: Bar chart by Room
    this.roomChartOptions = {
      ...commonOptions,
      tooltip: { ...commonOptions.tooltip, trigger: 'axis', axisPointer: { type: 'shadow' } },
      grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
      xAxis: {
        type: 'category',
        data: roomData.map(d => d.name),
        axisLabel: { 
            width: 100, 
            overflow: 'truncate', 
            interval: 0, 
            rotate: 30,
            color: this.palette.textPrimary
        },
        axisLine: { lineStyle: { color: this.palette.gray200 } }
      },
      yAxis: {
        type: 'value',
        splitLine: { lineStyle: { type: 'dashed', color: this.palette.gray200 } }
      },
      series: [{
        name: 'Số Lượng',
        type: 'bar',
        barWidth: '40%',
        data: roomData.map(d => d.value),
        itemStyle: { color: this.palette.primary, borderRadius: [4, 4, 0, 0] }
      }]
    };

    // Chart 2: Pie chart by Group
    this.groupChartOptions = {
      ...commonOptions,
      legend: { top: '5%', left: 'center', textStyle: { color: this.palette.textSecondary } },
      series: [{
        name: 'Nhóm Dịch Vụ',
        type: 'pie',
        radius: ['40%', '70%'],
        center: ['50%', '60%'],
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

  public onExport(): void {
    if (this.isExporting || !this.rawData.length) return;

    this.isExporting = true;
    // Simulate a small delay for UX or fetching full data if needed
    setTimeout(() => {
        const columns: ExportColumn[] = [
            { key: 'NGAY_TH', header: 'Ngày Thực Hiện', type: 'date' },
            { key: 'PHONG_BAN_TH', header: 'Phòng Ban' },
            { key: 'NHOM_DICH_VU', header: 'Nhóm Dịch Vụ' },
            { key: 'SO_LUONG', header: 'Số Lượng' },
            { key: 'SO_LUONG_NV', header: 'Số Lượng NV' },
        ];

        this.excelService.exportToExcel(
            this.rawData,
            `BaoCao_CLS_Tang6_${this.fromDate}_${this.toDate}`,
            columns
        );

        this.isExporting = false;
        this.toastService.showSuccess('Xuất Excel thành công.');
        this.cd.markForCheck();
    }, 300);
  }
}