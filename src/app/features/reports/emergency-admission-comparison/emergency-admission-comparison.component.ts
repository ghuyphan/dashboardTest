import {
  Component,
  OnInit,
  inject,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  effect,
  DestroyRef,
} from '@angular/core';
import { CommonModule, DatePipe, DecimalPipe } from '@angular/common';
import { finalize } from 'rxjs/operators';
import type { EChartsCoreOption } from 'echarts/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import { ReportService } from '../../../core/services/report.service';
import { ToastService } from '../../../core/services/toast.service';
import { ThemeService, ThemePalette } from '../../../core/services/theme.service';
import { EmergencyStat } from '../../../shared/models/emergency-stat';
import { DateUtils } from '../../../shared/utils/date.utils';

import { ChartCardComponent } from '../../../components/chart-card/chart-card.component';
import { DateFilterComponent, DateRange } from '../../../components/date-filter/date-filter.component';
import { WidgetCardComponent } from '../../../components/widget-card/widget-card.component';
import { ExcelExportService, ExportColumn } from '../../../core/services/excel-export.service';
import { TableCardComponent } from '../../../components/table-card/table-card.component';
import { GridColumn } from '../../../components/reusable-table/reusable-table.component';

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
  selector: 'app-emergency-admission-comparison',
  standalone: true,
  imports: [
    CommonModule,
    ChartCardComponent,
    DateFilterComponent,
    WidgetCardComponent,
    TableCardComponent
  ],
  providers: [DatePipe, DecimalPipe],
  templateUrl: './emergency-admission-comparison.component.html',
  styleUrls: ['./emergency-admission-comparison.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EmergencyAdmissionComparisonComponent implements OnInit {
  private reportService = inject(ReportService);
  private toastService = inject(ToastService);
  private excelService = inject(ExcelExportService);
  private cd = inject(ChangeDetectorRef);
  private datePipe = inject(DatePipe);
  private numberPipe = inject(DecimalPipe);
  private destroyRef = inject(DestroyRef);
  public readonly themeService = inject(ThemeService);

  public isLoading = false;
  public isExporting = false;
  public rawData: EmergencyStat[] = [];
  public fromDate: string = '';
  public toDate: string = '';
  
  public widgetData: WidgetData[] = [];
  // Biểu đồ chính chứa Bar + 2 Line
  public comparisonChartOptions: EChartsCoreOption | null = null; 
  
  public tableColumns: GridColumn[] = [
    { key: 'NGAY_TIEP_NHAN_DISPLAY', label: 'Ngày', sortable: true, width: '120px' },
    { key: 'LUOT_CC', label: 'Tổng Lượt CC', sortable: true, width: '100px' },
    { key: 'NHAP_VIEN', label: 'Nhập Viện', sortable: true, width: '100px' },
    { key: 'BHYT', label: 'Lượt BHYT', sortable: true, width: '100px' },
    { key: 'VIEN_PHI', label: 'Viện Phí', sortable: true, width: '100px' },
    { key: 'CHUYEN_VIEN', label: 'Chuyển Viện', sortable: true, width: '100px' },
  ];

  private palette!: ThemePalette;
  private readonly vnNumberFormatter = new Intl.NumberFormat('vi-VN');

  constructor() {
    effect(() => {
      this.palette = this.themeService.currentPalette();
      if (!this.isLoading && this.rawData.length > 0) {
        this.updateWidgets(this.rawData);
        this.buildChart(this.rawData);
      }
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
    // Mặc định là Tuần này
    const range = DateUtils.getReportingWeekRange();
    this.fromDate = range.fromDate;
    this.toDate = range.toDate;
  }

  private initializeWidgets(): void {
    this.widgetData = [
      { id: 'total', icon: 'fas fa-ambulance', title: 'Tổng Lượt CC', value: '0', caption: 'Cấp cứu', accentColor: '#00839b' },
      { id: 'admission', icon: 'fas fa-procedures', title: 'Tổng Nhập Viện', value: '0', caption: 'Từ Cấp cứu', accentColor: '#f89c5b' },
      { id: 'insurance', icon: 'fas fa-id-card', title: 'Tổng BHYT', value: '0', caption: 'Lượt có BHYT', accentColor: '#082567' },
      { id: 'ratio', icon: 'fas fa-percent', title: 'Tỷ lệ Nhập viện', value: '0%', caption: 'CC -> Nội trú', accentColor: '#ffb3ba' },
    ];
  }

  private updateWidgetColors(): void {
    if (this.widgetData.length > 0 && this.palette) {
      const setC = (id: string, color: string) => {
        const item = this.widgetData.find((x) => x.id === id);
        if (item) item.accentColor = color;
      };
      setC('total', this.palette.primary);
      setC('admission', this.palette.chart6);
      setC('insurance', this.palette.deepSapphire);
      setC('ratio', this.palette.pastelCoral);
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
    this.comparisonChartOptions = null;
    this.cd.markForCheck();

    this.reportService
      .getEmergencySummary(this.fromDate, this.toDate)
      .pipe(
        finalize(() => {
          this.isLoading = false;
          this.cd.markForCheck();
        }),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe({
        next: (data) => {
          this.rawData = data.map((item) => ({
            ...item,
            NGAY_TIEP_NHAN_DISPLAY: DateUtils.formatToDisplay(item.NGAY_TIEP_NHAN)
          }));
          
          this.updateWidgets(this.rawData);
          this.buildChart(this.rawData);
        },
        error: (err) => {
          console.error(err);
          this.toastService.showError('Không thể tải dữ liệu báo cáo cấp cứu.');
          this.rawData = [];
          this.initializeWidgets();
        },
      });
  }

  private updateWidgets(data: EmergencyStat[]): void {
    const totals = data.reduce(
      (a, c) => ({
        cc: a.cc + (c.LUOT_CC || 0),
        nv: a.nv + (c.NHAP_VIEN || 0),
        bhyt: a.bhyt + (c.BHYT || 0),
        cv: a.cv + (c.CHUYEN_VIEN || 0),
      }),
      { cc: 0, nv: 0, bhyt: 0, cv: 0 }
    );
    
    const ratio = totals.cc > 0 ? (totals.nv / totals.cc) * 100 : 0;

    const update = (id: string, val: string, cap: string = '') => {
      const w = this.widgetData.find((x) => x.id === id);
      if (w) {
        w.value = val;
        if (cap) w.caption = cap;
      }
    };
    
    update('total', this.formatNumber(totals.cc), 'Tổng số lượt');
    update('admission', this.formatNumber(totals.nv), `Chiếm ${ratio.toFixed(1)}%`);
    update('insurance', this.formatNumber(totals.bhyt), `Lượt có BHYT`);
    update('ratio', `${ratio.toFixed(1)}%`, 'Tỷ lệ Nhập viện');
  }

  private buildChart(data: EmergencyStat[]): void {
    if (!data || data.length === 0) {
      this.comparisonChartOptions = null;
      return;
    }

    const sorted = [...data].sort((a, b) => new Date(a.NGAY_TIEP_NHAN).getTime() - new Date(b.NGAY_TIEP_NHAN).getTime());

    // Prepare labels: Use 'Tuần XX' if data is grouped by week, otherwise use date
    const dates = sorted.map(d => {
      const dateObj = DateUtils.parse(d.NGAY_TIEP_NHAN);
      return d.TUAN_NAM ? `Tuần ${d.TUAN_NAM}` : (dateObj ? this.datePipe.transform(dateObj, 'dd/MM') : 'N/A');
    });

    // Extract series data
    const admissions = sorted.map(d => d.NHAP_VIEN || 0); // Số ca nhập viện từ cấp cứu (BAR)
    const totalCC = sorted.map(d => d.LUOT_CC || 0);      // Tổng số lượt cấp cứu (LINE 1)
    const bhytCC = sorted.map(d => d.BHYT || 0);          // Tổng số lượt cấp cứu có BHYT (LINE 2)

    // ECharts Colors (Matching the image style as closely as possible)
    const colors = {
      admissions: this.palette.chart2,     // Bar color (Blue/Teal)
      totalCC: this.palette.chart6,        // Line 1 color (Orange/Yellowish)
      bhytCC: this.palette.pastelCoral     // Line 2 color (Red/Coral)
    };

    const commonGrid = { left: '3%', right: '4%', bottom: '15%', top: '15%', containLabel: true };
    const commonTooltip = { 
      trigger: 'axis', 
      backgroundColor: this.palette.bgCard, 
      borderColor: this.palette.gray200, 
      textStyle: { color: this.palette.textPrimary }, 
      confine: true,
      axisPointer: { type: 'shadow' }
    };
    
    this.comparisonChartOptions = {
      backgroundColor: 'transparent',
      tooltip: { 
        ...commonTooltip,
        formatter: (params: any) => {
          let result = `<div style="font-weight:bold">${params[0].name}</div>`;
          params.forEach((p: any) => {
            const value = this.vnNumberFormatter.format(p.value);
            result += `
            <div style="display:flex; justify-content:space-between; gap:15px;">
              <span>${p.marker} ${p.seriesName}</span>
              <span style="font-weight:bold;">${value}</span>
            </div>`;
          });
          return result;
        }
      },
      grid: commonGrid,
      legend: { 
        data: ['Số ca nhập viện từ cấp cứu', 'Tổng số lượt cấp cứu', 'Tổng số lượt cấp cứu có BHYT'], 
        bottom: 0, 
        textStyle: { color: this.palette.textSecondary } 
      },
      xAxis: { 
        type: 'category', 
        data: dates, 
        axisLabel: { 
          color: this.palette.textPrimary,
          interval: 0,
          rotate: 45,
          margin: 10
        }, 
        axisLine: { lineStyle: { color: this.palette.gray200 } } 
      },
      yAxis: [
        { 
          type: 'value', 
          name: 'Số Lượng',
          nameTextStyle: { color: this.palette.textSecondary },
          splitLine: { lineStyle: { type: 'dashed', color: this.palette.gray200 } },
          axisLabel: { color: this.palette.textSecondary }
        }
      ],
      series: [
        // Bar Chart (Admissions) - Primary visual
        { 
          name: 'Số ca nhập viện từ cấp cứu', 
          type: 'bar', 
          yAxisIndex: 0, 
          barWidth: '50%', 
          data: admissions, 
          itemStyle: { color: colors.admissions, borderRadius: [4, 4, 0, 0] },
          label: { show: true, position: 'top', color: this.palette.textPrimary, fontSize: 10, distance: 5 },
          z: 1
        },
        // Line Chart 1 (Total CC) - Comparison line
        { 
          name: 'Tổng số lượt cấp cứu', 
          type: 'line', 
          yAxisIndex: 0, 
          data: totalCC,
          smooth: true,
          symbol: 'circle',
          symbolSize: 8,
          itemStyle: { color: colors.totalCC },
          lineStyle: { width: 3 },
          z: 2,
          // Optional: Display value on line
          label: { show: true, position: 'top', color: colors.totalCC, formatter: (p: any) => this.vnNumberFormatter.format(p.value) }
        },
        // Line Chart 2 (BHYT CC) - Second comparison line
        { 
          name: 'Tổng số lượt cấp cứu có BHYT', 
          type: 'line', 
          yAxisIndex: 0, 
          data: bhytCC,
          smooth: true,
          symbol: 'circle',
          symbolSize: 8,
          itemStyle: { color: colors.bhytCC },
          lineStyle: { width: 3 },
          z: 2,
          // Optional: Display value on line
          label: { show: true, position: 'top', color: colors.bhytCC, formatter: (p: any) => this.vnNumberFormatter.format(p.value) }
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
    this.cd.markForCheck();
    setTimeout(() => {
      const columns: ExportColumn[] = [
        { key: 'NGAY_TIEP_NHAN_DISPLAY', header: 'Ngày', type: 'date' },
        { key: 'LUOT_CC', header: 'Tổng Lượt Cấp Cứu' },
        { key: 'NHAP_VIEN', header: 'Số Ca Nhập Viện' },
        { key: 'BHYT', header: 'Lượt Cấp Cứu BHYT' },
        { key: 'VIEN_PHI', header: 'Lượt Viện Phí' },
        { key: 'CHUYEN_VIEN', header: 'Số Ca Chuyển Viện' },
      ];
      this.excelService.exportToExcel(
        this.rawData, 
        `BaoCao_CapCuu_LuuTru_${this.fromDate}_${this.toDate}`, 
        columns
      );
      this.isExporting = false;
      this.toastService.showSuccess('Xuất Excel thành công.');
      this.cd.markForCheck();
    }, 500);
  }
}