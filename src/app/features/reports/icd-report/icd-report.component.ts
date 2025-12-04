import {
  Component,
  OnInit,
  inject,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  effect,
  DestroyRef,
} from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { finalize } from 'rxjs/operators';
import type { EChartsCoreOption } from 'echarts/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import { ReportService } from '../../../core/services/report.service';
import { ToastService } from '../../../core/services/toast.service';
import { ThemeService, ThemePalette } from '../../../core/services/theme.service';
import { ExcelExportService, ExportColumn } from '../../../core/services/excel-export.service';
import { IcdStat } from '../../../shared/models/icd-stat.model';
import { DateUtils } from '../../../shared/utils/date.utils';

import { ChartCardComponent } from '../../../shared/components/chart-card/chart-card.component';
import { DateFilterComponent, DateRange } from '../../../shared/components/date-filter/date-filter.component';
import { TableCardComponent } from '../../../shared/components/table-card/table-card.component';
import { GridColumn } from '../../../shared/components/reusable-table/reusable-table.component';

const GLOBAL_FONT_FAMILY = 'Inter, sans-serif';

@Component({
  selector: 'app-icd-report',
  standalone: true,
  imports: [
    CommonModule,
    ChartCardComponent,
    TableCardComponent,
    DateFilterComponent
  ],
  providers: [DecimalPipe],
  templateUrl: './icd-report.component.html',
  styleUrl: './icd-report.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class IcdReportComponent implements OnInit {
  private reportService = inject(ReportService);
  private toastService = inject(ToastService);
  private excelService = inject(ExcelExportService);
  private cd = inject(ChangeDetectorRef);
  private destroyRef = inject(DestroyRef);
  public readonly themeService = inject(ThemeService);

  public isLoading = false;
  public isExporting = false;
  public rawData: IcdStat[] = [];

  public fromDate: string = '';
  public toDate: string = '';

  // Chart Options
  public outpatientChartOptions: EChartsCoreOption | null = null;
  public inpatientChartOptions: EChartsCoreOption | null = null;

  public tableColumns: GridColumn[] = [
    { key: 'STT', label: '#', sortable: true, width: '50px' },
    // Group: Ngoại trú
    { key: 'MAICD', label: 'Mã ICD (NgT)', sortable: true, width: '80px' },
    { key: 'TENICD', label: 'Tên Bệnh (Ngoại Trú)', sortable: true, width: '250px' },
    { key: 'TONG_NGOAITRU', label: 'SL (NgT)', sortable: true, width: '100px' },
    // Group: Nội trú
    { key: 'NOITRU', label: 'Mã ICD (NT)', sortable: true, width: '80px' },
    { key: 'TENICD1', label: 'Tên Bệnh (Nội Trú)', sortable: true, width: '250px' },
    { key: 'TONG_NOITRU', label: 'SL (NT)', sortable: true, width: '100px' },
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
    const range = DateUtils.getReportingWeekRange();
    this.fromDate = range.fromDate;
    this.toDate = range.toDate;
    this.loadData();
  }

  public onDateFilter(range: DateRange): void {
    this.fromDate = range.fromDate;
    this.toDate = range.toDate;
    this.loadData();
  }

  public loadData(): void {
    if (!this.fromDate || !this.toDate) return;

    this.isLoading = true;
    this.outpatientChartOptions = null;
    this.inpatientChartOptions = null;
    this.cd.markForCheck();

    // Simulate API call or use real service
    // Replace with: this.reportService.getTopIcdReport(...)
    this.reportService.getTopIcdReport(this.fromDate, this.toDate)
      .pipe(
        finalize(() => {
          this.isLoading = false;
          this.cd.markForCheck();
        }),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe({
        next: (data) => {
          this.rawData = data || [];
          this.buildCharts(this.rawData);
        },
        error: (err) => {
          console.error(err);
          this.toastService.showError('Không thể tải dữ liệu thống kê bệnh.');
          this.rawData = [];
        }
      });
  }

  private buildCharts(data: IcdStat[]): void {
    if (!data || data.length === 0) return;

    // 1. Top 10 Outpatient (Ngoại trú)
    const topOutpatient = [...data]
      .filter(i => i.TONG_NGOAITRU > 0)
      .sort((a, b) => b.TONG_NGOAITRU - a.TONG_NGOAITRU)
      .slice(0, 10)
      .reverse(); // Reverse for bar chart display

    // 2. Top 10 Inpatient (Nội trú)
    const topInpatient = [...data]
      .filter(i => i.TONG_NOITRU > 0)
      .sort((a, b) => b.TONG_NOITRU - a.TONG_NOITRU)
      .slice(0, 10)
      .reverse();

    const commonOptions = {
      backgroundColor: 'transparent',
      textStyle: {
        fontFamily: GLOBAL_FONT_FAMILY,
        color: this.palette.textSecondary,
      },
      tooltip: {
        trigger: 'axis',
        backgroundColor: this.palette.bgCard,
        borderColor: this.palette.gray200,
        textStyle: { color: this.palette.textPrimary },
        confine: true,
        axisPointer: { type: 'shadow' }
      },
      grid: {
        left: '3%',
        right: '4%',
        bottom: '3%',
        top: '5%',
        containLabel: true
      }
    };

    // --- Outpatient Chart ---
    this.outpatientChartOptions = {
      ...commonOptions,
      xAxis: {
        type: 'value',
        splitLine: { lineStyle: { type: 'dashed', color: this.palette.gray200 } },
        axisLabel: { color: this.palette.textSecondary }
      },
      yAxis: {
        type: 'category',
        data: topOutpatient.map(i => i.MAICD),
        axisLabel: { color: this.palette.textPrimary, fontWeight: 'bold' },
        axisLine: { show: false },
        axisTick: { show: false }
      },
      series: [{
        name: 'Ngoại trú',
        type: 'bar',
        data: topOutpatient.map(i => ({
          value: i.TONG_NGOAITRU,
          name: i.TENICD // Tooltip will show full name
        })),
        itemStyle: { color: this.palette.primary, borderRadius: [0, 4, 4, 0] },
        label: { show: true, position: 'right', color: this.palette.textPrimary },
        barWidth: '60%'
      }]
    };

    // --- Inpatient Chart ---
    this.inpatientChartOptions = {
      ...commonOptions,
      xAxis: {
        type: 'value',
        splitLine: { lineStyle: { type: 'dashed', color: this.palette.gray200 } },
        axisLabel: { color: this.palette.textSecondary }
      },
      yAxis: {
        type: 'category',
        data: topInpatient.map(i => i.NOITRU),
        axisLabel: { color: this.palette.textPrimary, fontWeight: 'bold' },
        axisLine: { show: false },
        axisTick: { show: false }
      },
      series: [{
        name: 'Nội trú',
        type: 'bar',
        data: topInpatient.map(i => ({
          value: i.TONG_NOITRU,
          name: i.TENICD1 // Tooltip will show full name
        })),
        itemStyle: { color: this.palette.chart6, borderRadius: [0, 4, 4, 0] },
        label: { show: true, position: 'right', color: this.palette.textPrimary },
        barWidth: '60%'
      }]
    };
  }

  public onExport(): void {
    if (this.isExporting || !this.rawData.length) return;
    this.isExporting = true;
    this.cd.markForCheck();

    setTimeout(() => {
      const columns: ExportColumn[] = [
        { key: 'STT', header: 'STT' },
        { key: 'MAICD', header: 'Mã ICD (Ngoại trú)' },
        { key: 'TENICD', header: 'Tên Bệnh (Ngoại trú)' },
        { key: 'TONG_NGOAITRU', header: 'Số Lượng (Ngoại trú)' },
        { key: 'NOITRU', header: 'Mã ICD (Nội trú)' },
        { key: 'TENICD1', header: 'Tên Bệnh (Nội trú)' },
        { key: 'TONG_NOITRU', header: 'Số Lượng (Nội trú)' },
      ];

      this.excelService.exportToExcel(
        this.rawData,
        `BaoCao_TopICD_${this.fromDate}_${this.toDate}`,
        columns
      );

      this.isExporting = false;
      this.toastService.showSuccess('Xuất Excel thành công.');
      this.cd.markForCheck();
    }, 500);
  }
}