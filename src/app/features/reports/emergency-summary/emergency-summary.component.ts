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
import { ExcelExportService, ExportColumn } from '../../../core/services/excel-export.service';
import { DateUtils } from '../../../shared/utils/date.utils';

import { ChartCardComponent } from '../../../components/chart-card/chart-card.component';
import { DateFilterComponent, DateRange } from '../../../components/date-filter/date-filter.component';
import { TableCardComponent } from '../../../components/table-card/table-card.component';
import { GridColumn } from '../../../components/reusable-table/reusable-table.component';
import { WidgetCardComponent } from '../../../components/widget-card/widget-card.component';

interface WidgetData {
  id: string;
  icon: string;
  title: string;
  value: string;
  caption: string;
  accentColor: string;
}

@Component({
  selector: 'app-emergency-summary',
  standalone: true,
  imports: [
    CommonModule,
    ChartCardComponent,
    TableCardComponent,
    DateFilterComponent,
    WidgetCardComponent,
  ],
  providers: [DatePipe, DecimalPipe],
  templateUrl: './emergency-summary.component.html',
  styleUrl: './emergency-summary.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EmergencySummaryComponent implements OnInit {
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
  
  // Charts
  public trendChartOptions: EChartsCoreOption | null = null;
  public admissionChartOptions: EChartsCoreOption | null = null;
  public transferChartOptions: EChartsCoreOption | null = null;
  public insuranceChartOptions: EChartsCoreOption | null = null;

  public tableColumns: GridColumn[] = [
    { key: 'NGAY_TIEP_NHAN_DISPLAY', label: 'Ngày', sortable: true, width: '120px' },
    { key: 'LUOT_CC', label: 'Tổng Lượt', sortable: true, width: '100px' },
    { key: 'NHAP_VIEN', label: 'Nhập Viện', sortable: true, width: '100px' },
    { key: 'CHUYEN_VIEN', label: 'Chuyển Viện', sortable: true, width: '100px' },
    { key: 'BHYT', label: 'BHYT', sortable: true, width: '100px' },
    { key: 'VIEN_PHI', label: 'Viện Phí', sortable: true, width: '100px' },
  ];

  private palette!: ThemePalette;

  constructor() {
    effect(() => {
      this.palette = this.themeService.currentPalette();
      if (!this.isLoading && this.rawData.length > 0) {
        this.processData(this.rawData);
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
    const range = DateUtils.getReportingWeekRange();
    this.fromDate = range.fromDate;
    this.toDate = range.toDate;
  }

  private initializeWidgets(): void {
    this.widgetData = [
      { id: 'total', icon: 'fas fa-ambulance', title: 'Tổng Lượt CC', value: '0', caption: 'Cấp cứu', accentColor: '#00839b' },
      { id: 'admission', icon: 'fas fa-procedures', title: 'Nhập Viện', value: '0', caption: 'Từ Cấp cứu', accentColor: '#f89c5b' },
      { id: 'transfer', icon: 'fas fa-exchange-alt', title: 'Chuyển Viện', value: '0', caption: 'Chuyển tuyến', accentColor: '#ffb3ba' },
      { id: 'insurance', icon: 'fas fa-id-card', title: 'Tỷ lệ BHYT', value: '0%', caption: 'Có BHYT', accentColor: '#082567' },
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
      setC('transfer', this.palette.pastelCoral);
      setC('insurance', this.palette.deepSapphire);
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
    this.trendChartOptions = null;
    this.admissionChartOptions = null;
    this.transferChartOptions = null;
    this.insuranceChartOptions = null;
    this.cd.markForCheck();

    this.reportService.getEmergencySummary(this.fromDate, this.toDate)
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
          this.processData(this.rawData);
        },
        error: (err) => {
          console.error(err);
          this.toastService.showError('Không thể tải dữ liệu báo cáo.');
          this.rawData = [];
          this.initializeWidgets();
        },
      });
  }

  private processData(data: EmergencyStat[]): void {
    if (!data || data.length === 0) {
      this.initializeWidgets();
      return;
    }

    // 1. Calculate Totals
    let totalCC = 0;
    let totalNhapVien = 0;
    let totalChuyenVien = 0;
    let totalBHYT = 0;
    let totalVienPhi = 0;

    data.forEach(item => {
      totalCC += (item.LUOT_CC || 0);
      totalNhapVien += (item.NHAP_VIEN || 0);
      totalChuyenVien += (item.CHUYEN_VIEN || 0);
      totalBHYT += (item.BHYT || 0);
      totalVienPhi += (item.VIEN_PHI || 0);
    });

    // 2. Update Widgets
    const insuranceRate = totalCC > 0 ? (totalBHYT / totalCC) * 100 : 0;

    this.widgetData = [
      { id: 'total', icon: 'fas fa-ambulance', title: 'Tổng Lượt CC', value: this.formatNumber(totalCC), caption: 'Cấp cứu', accentColor: this.palette.primary },
      { id: 'admission', icon: 'fas fa-procedures', title: 'Nhập Viện', value: this.formatNumber(totalNhapVien), caption: `Chiếm ${totalCC > 0 ? ((totalNhapVien/totalCC)*100).toFixed(1) : 0}%`, accentColor: this.palette.chart6 },
      { id: 'transfer', icon: 'fas fa-exchange-alt', title: 'Chuyển Viện', value: this.formatNumber(totalChuyenVien), caption: 'Chuyển tuyến', accentColor: this.palette.pastelCoral },
      { id: 'insurance', icon: 'fas fa-id-card', title: 'Tỷ lệ BHYT', value: `${insuranceRate.toFixed(1)}%`, caption: `Có BHYT (${this.formatNumber(totalBHYT)})`, accentColor: this.palette.deepSapphire },
    ];

    // 3. Prepare Chart Data (Sort by Date)
    const sortedData = [...data].sort((a, b) => new Date(a.NGAY_TIEP_NHAN).getTime() - new Date(b.NGAY_TIEP_NHAN).getTime());
    
    const dates = sortedData.map(d => {
      const dateObj = new Date(d.NGAY_TIEP_NHAN);
      return this.datePipe.transform(dateObj, 'dd/MM') || '';
    });
    
    const ccData = sortedData.map(d => d.LUOT_CC);
    const nhapVienData = sortedData.map(d => d.NHAP_VIEN);
    const chuyenVienData = sortedData.map(d => d.CHUYEN_VIEN);

    this.buildCharts(dates, ccData, nhapVienData, chuyenVienData, totalBHYT, totalVienPhi);
  }

  private buildCharts(dates: string[], ccData: number[], nhapVienData: number[], chuyenVienData: number[], totalBHYT: number, totalVienPhi: number): void {
    const commonGrid = { left: '3%', right: '4%', bottom: '10%', top: '15%', containLabel: true };
    const commonTooltip = { trigger: 'axis', backgroundColor: this.palette.bgCard, borderColor: this.palette.gray200, textStyle: { color: this.palette.textPrimary }, confine: true };

    // Chart 1: Trend Line (Total Emergency)
    this.trendChartOptions = {
      backgroundColor: 'transparent',
      tooltip: commonTooltip,
      grid: commonGrid,
      legend: { show: true, bottom: 0, textStyle: { color: this.palette.textSecondary } },
      xAxis: { type: 'category', data: dates, axisLabel: { color: this.palette.textPrimary }, axisLine: { lineStyle: { color: this.palette.gray200 } } },
      yAxis: { type: 'value', splitLine: { lineStyle: { type: 'dashed', color: this.palette.gray200 } } },
      series: [{
        name: 'Tổng lượt cấp cứu', type: 'line', smooth: true, symbol: 'circle', symbolSize: 6,
        data: ccData, itemStyle: { color: this.palette.chart3 }, lineStyle: { width: 3 },
        areaStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: this.palette.chart3 }, { offset: 1, color: this.palette.bgCard }] }, opacity: 0.2 }
      }]
    };

    // Chart 2: Transfer (Bar) - Following "Image 2" concept
    this.transferChartOptions = {
      backgroundColor: 'transparent',
      tooltip: commonTooltip,
      grid: commonGrid,
      xAxis: { type: 'category', data: dates, axisLabel: { color: this.palette.textPrimary }, axisLine: { lineStyle: { color: this.palette.gray200 } } },
      yAxis: { type: 'value', splitLine: { lineStyle: { type: 'dashed', color: this.palette.gray200 } } },
      series: [{
        name: 'Số ca chuyển tuyến', type: 'bar', barWidth: '50%', data: chuyenVienData,
        itemStyle: { color: this.palette.pastelCoral, borderRadius: [4, 4, 0, 0] },
        label: { show: true, position: 'top', color: this.palette.textPrimary }
      }]
    };

    // Chart 3: Admission vs Total (Combo) - Following "Image 3" concept
    this.admissionChartOptions = {
      backgroundColor: 'transparent',
      tooltip: { ...commonTooltip, formatter: (params: any) => {
        let result = `${params[0].name}<br/>`;
        const total = params.find((p: any) => p.seriesName === 'Tổng lượt CC')?.value || 0;
        const admitted = params.find((p: any) => p.seriesName === 'Nhập viện')?.value || 0;
        params.forEach((p: any) => {
          result += `${p.marker} ${p.seriesName}: <b>${p.value}</b>`;
          if (p.seriesName === 'Nhập viện' && total > 0) result += ` (${((admitted/total)*100).toFixed(1)}%)`;
          result += '<br/>';
        });
        return result;
      }},
      grid: commonGrid,
      legend: { show: true, bottom: 0, textStyle: { color: this.palette.textSecondary } },
      xAxis: { type: 'category', data: dates, axisLabel: { color: this.palette.textPrimary }, axisLine: { lineStyle: { color: this.palette.gray200 } } },
      yAxis: [{ type: 'value', name: 'Số lượng', splitLine: { lineStyle: { type: 'dashed', color: this.palette.gray200 } } }],
      series: [
        { name: 'Tổng lượt CC', type: 'bar', barWidth: '40%', barGap: '-100%', data: ccData, itemStyle: { color: this.palette.chart3, opacity: 0.3 }, z: 1 },
        { name: 'Nhập viện', type: 'bar', barWidth: '40%', data: nhapVienData, itemStyle: { color: this.palette.deepSapphire }, label: { show: true, position: 'top', color: this.palette.textPrimary, fontSize: 10 }, z: 2 }
      ]
    };

    // Chart 4: Insurance (Pie)
    this.insuranceChartOptions = {
      backgroundColor: 'transparent',
      tooltip: { trigger: 'item', backgroundColor: this.palette.bgCard, borderColor: this.palette.gray200, textStyle: { color: this.palette.textPrimary }, formatter: '{b}: {c} ({d}%)' },
      legend: { bottom: 0, left: 'center', textStyle: { color: this.palette.textSecondary } },
      series: [{
        name: 'Đối tượng', type: 'pie', radius: ['40%', '70%'], center: ['50%', '45%'],
        itemStyle: { borderRadius: 5, borderColor: this.palette.bgCard, borderWidth: 2 },
        label: { show: true, formatter: '{b}: {d}%', color: this.palette.textPrimary },
        data: [
          { value: totalBHYT, name: 'BHYT', itemStyle: { color: this.palette.primary } },
          { value: totalVienPhi, name: 'Viện phí', itemStyle: { color: this.palette.chart9 } }
        ]
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
        { key: 'NGAY_TIEP_NHAN_DISPLAY', header: 'Ngày', type: 'date' },
        { key: 'LUOT_CC', header: 'Tổng Lượt Cấp Cứu' },
        { key: 'NHAP_VIEN', header: 'Số Ca Nhập Viện' },
        { key: 'CHUYEN_VIEN', header: 'Số Ca Chuyển Viện' },
        { key: 'BHYT', header: 'Lượt BHYT' },
        { key: 'VIEN_PHI', header: 'Lượt Viện Phí' },
      ];
      this.excelService.exportToExcel(this.rawData, `BaoCao_CapCuu_${this.fromDate}_${this.toDate}`, columns);
      this.isExporting = false;
      this.toastService.showSuccess('Xuất Excel thành công.');
      this.cd.markForCheck();
    }, 500);
  }
}