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
import { ExcelExportService, ExportColumn } from '../../../core/services/excel-export.service';
import { DetailedExaminationStat } from '../../../shared/models/detailed-examination-stat.model';
import { DateUtils } from '../../../shared/utils/date.utils';

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
  selector: 'app-detailed-examination-report',
  standalone: true,
  imports: [
    CommonModule,
    ChartCardComponent,
    TableCardComponent,
    DateFilterComponent,
    WidgetCardComponent,
  ],
  providers: [DatePipe, DecimalPipe],
  templateUrl: './detailed-examination-report.component.html',
  styleUrl: './detailed-examination-report.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DetailedExaminationReportComponent implements OnInit {
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
  public rawData: DetailedExaminationStat[] = [];
  
  public fromDate: string = '';
  public toDate: string = '';

  public widgetData: WidgetData[] = [];

  // --- Charts based on image requirements ---
  // (1) General Trend (Visits vs Patients)
  public trendChartOptions: EChartsCoreOption | null = null;
  // (2) Patient Classification (New vs Old)
  public patientTypeChartOptions: EChartsCoreOption | null = null;
  // (3) Specialty Statistics
  public specialtyChartOptions: EChartsCoreOption | null = null;
  // (4) Doctor Statistics
  public doctorChartOptions: EChartsCoreOption | null = null;

  public tableColumns: GridColumn[] = [
    { key: 'NGAY_KHAM_DISPLAY', label: 'Ngày Khám', sortable: true, width: '120px' },
    { key: 'TEN_CHUYEN_KHOA', label: 'Chuyên Khoa', sortable: true, width: '200px' },
    { key: 'BAC_SI', label: 'Bác Sĩ', sortable: true, width: '180px' },
    { key: 'SO_LUOT_KHAM', label: 'Tổng Lượt', sortable: true, width: '100px' },
    { key: 'SO_NGUOI_KHAM', label: 'Số Người', sortable: true, width: '100px' },
    { key: 'BENH_MOI', label: 'Bệnh Mới', sortable: true, width: '100px' },
    { key: 'BENH_CU', label: 'Tái Khám', sortable: true, width: '100px' },
  ];

  private palette!: ThemePalette;
  private readonly vnNumberFormatter = new Intl.NumberFormat('vi-VN');

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

  public onDateFilter(range: DateRange): void {
    this.fromDate = range.fromDate;
    this.toDate = range.toDate;
    this.loadData();
  }

  private initializeWidgets(): void {
    this.widgetData = [
      {
        id: 'total-visits',
        icon: 'fas fa-clipboard-check',
        title: 'Tổng Lượt Khám',
        value: '0',
        caption: 'Total Visits',
        accentColor: '#00839b',
      },
      {
        id: 'total-patients',
        icon: 'fas fa-user-injured',
        title: 'Số Người Bệnh',
        value: '0',
        caption: 'Unique Patients',
        accentColor: '#f89c5b',
      },
      {
        id: 'avg-visit',
        icon: 'fas fa-chart-line',
        title: 'TB Lượt/Người',
        value: '0',
        caption: 'Visits per Patient',
        accentColor: '#082567',
      },
      {
        id: 're-exam-rate',
        icon: 'fas fa-sync-alt',
        title: 'Tỷ Lệ Tái Khám',
        value: '0%',
        caption: 'Re-examination Rate',
        accentColor: '#16a34a',
      },
    ];
  }

  private updateWidgetColors(): void {
    if (this.widgetData.length > 0 && this.palette) {
      const setC = (id: string, color: string) => {
        const item = this.widgetData.find((x) => x.id === id);
        if (item) item.accentColor = color;
      };
      setC('total-visits', this.palette.primary);
      setC('total-patients', this.palette.chart6);
      setC('avg-visit', this.palette.deepSapphire);
      setC('re-exam-rate', this.palette.success);
    }
  }

  public loadData(): void {
    if (!this.fromDate || !this.toDate) return;

    this.isLoading = true;
    this.resetCharts();
    this.cd.markForCheck();

    this.reportService
      .getDetailedExaminationReport(this.fromDate, this.toDate)
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
            NGAY_KHAM_DISPLAY: DateUtils.formatToDisplay(item.NGAYKHAM),
            BAC_SI: item.BAC_SI || 'Chưa xác định',
            TEN_CHUYEN_KHOA: item.TEN_CHUYEN_KHOA || 'Khác'
          }));
          this.processData(this.rawData);
        },
        error: (err) => {
          console.error(err);
          this.toastService.showError('Không thể tải dữ liệu báo cáo chi tiết.');
          this.rawData = [];
          this.initializeWidgets();
        },
      });
  }

  private resetCharts(): void {
    this.trendChartOptions = null;
    this.patientTypeChartOptions = null;
    this.specialtyChartOptions = null;
    this.doctorChartOptions = null;
  }

  private processData(data: DetailedExaminationStat[]): void {
    if (!data || data.length === 0) {
      this.initializeWidgets();
      return;
    }

    let totalVisits = 0;
    let totalPatients = 0;
    let totalNew = 0;
    let totalOld = 0;

    const dateMap = new Map<string, { visits: number; patients: number }>();
    const specialtyMap = new Map<string, number>();
    const doctorMap = new Map<string, number>();

    data.forEach((item) => {
      const visits = item.SO_LUOT_KHAM || 0;
      const patients = item.SO_NGUOI_KHAM || 0;
      
      totalVisits += visits;
      totalPatients += patients;
      totalNew += item.BENH_MOI || 0;
      totalOld += item.BENH_CU || 0;

      // 1. Date Aggregation
      const dateKey = item.NGAYKHAM ? item.NGAYKHAM.split('T')[0] : 'N/A';
      const currentDay = dateMap.get(dateKey) || { visits: 0, patients: 0 };
      currentDay.visits += visits;
      currentDay.patients += patients;
      dateMap.set(dateKey, currentDay);

      // 3. Specialty Aggregation
      const spec = item.TEN_CHUYEN_KHOA;
      specialtyMap.set(spec, (specialtyMap.get(spec) || 0) + visits);

      // 4. Doctor Aggregation
      const doc = item.BAC_SI;
      doctorMap.set(doc, (doctorMap.get(doc) || 0) + visits);
    });

    // Calculate Widgets
    const avgVisitPerPatient = totalPatients > 0 ? (totalVisits / totalPatients).toFixed(2) : '0';
    const reExamRate = totalVisits > 0 ? ((totalOld / totalVisits) * 100).toFixed(1) : '0';

    this.widgetData = [
      {
        id: 'total-visits',
        icon: 'fas fa-clipboard-check',
        title: 'Tổng Lượt Khám',
        value: this.formatNumber(totalVisits),
        caption: 'Total Visits',
        accentColor: this.palette.primary,
      },
      {
        id: 'total-patients',
        icon: 'fas fa-user-injured',
        title: 'Tổng Người Bệnh',
        value: this.formatNumber(totalPatients),
        caption: 'Total Patients',
        accentColor: this.palette.chart6,
      },
      {
        id: 'avg-visit',
        icon: 'fas fa-chart-line',
        title: 'TB Lượt/Người',
        value: avgVisitPerPatient,
        caption: 'Avg Visits/Patient',
        accentColor: this.palette.deepSapphire,
      },
      {
        id: 're-exam-rate',
        icon: 'fas fa-sync-alt',
        title: 'Tỷ Lệ Tái Khám',
        value: `${reExamRate}%`,
        caption: `(${this.formatNumber(totalOld)} lượt)`,
        accentColor: this.palette.success,
      },
    ];

    // Build Charts
    this.buildTrendChart(dateMap);
    this.buildPatientTypeChart(totalNew, totalOld);
    this.buildSpecialtyChart(specialtyMap);
    this.buildDoctorChart(doctorMap);
  }

  // (1) Chart: Visits vs Patients over time
  private buildTrendChart(dateMap: Map<string, { visits: number; patients: number }>): void {
    const sortedDates = Array.from(dateMap.keys()).sort();
    const dateLabels = sortedDates.map((d) => {
      const dateObj = new Date(d);
      return this.datePipe.transform(dateObj, 'dd/MM') || d;
    });
    
    const visitsData = sortedDates.map(d => dateMap.get(d)?.visits || 0);
    const patientsData = sortedDates.map(d => dateMap.get(d)?.patients || 0);

    this.trendChartOptions = {
      ...this.getCommonChartOptions(),
      legend: { 
        top: 0, 
        textStyle: { color: this.palette.textSecondary } 
      },
      xAxis: {
        type: 'category',
        data: dateLabels,
        axisLabel: { color: this.palette.textPrimary },
        axisLine: { lineStyle: { color: this.palette.gray200 } },
      },
      yAxis: [
        {
          type: 'value',
          name: 'Lượt',
          splitLine: { lineStyle: { type: 'dashed', color: this.palette.gray200 } },
          axisLabel: { color: this.palette.textSecondary },
        }
      ],
      series: [
        {
          name: 'Tổng lượt khám',
          type: 'bar',
          data: visitsData,
          itemStyle: { color: this.palette.primary, borderRadius: [4, 4, 0, 0] },
          barWidth: '40%'
        },
        {
          name: 'Số người bệnh',
          type: 'line',
          data: patientsData,
          smooth: true,
          itemStyle: { color: this.palette.chart6 },
          lineStyle: { width: 3 },
          symbolSize: 8
        }
      ]
    };
  }

  // (2) Chart: New vs Old Patients
  private buildPatientTypeChart(newCount: number, oldCount: number): void {
    this.patientTypeChartOptions = {
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'item',
        backgroundColor: this.palette.bgCard,
        borderColor: this.palette.gray200,
        textStyle: { color: this.palette.textPrimary },
        formatter: '{b}: {c} ({d}%)'
      },
      legend: {
        bottom: 0,
        left: 'center',
        textStyle: { color: this.palette.textSecondary },
      },
      series: [
        {
          name: 'Loại khám',
          type: 'pie',
          radius: ['40%', '70%'],
          center: ['50%', '45%'],
          itemStyle: {
            borderRadius: 5,
            borderColor: this.palette.bgCard,
            borderWidth: 2,
          },
          label: {
            show: true,
            formatter: '{b}: {d}%',
            color: this.palette.textPrimary
          },
          data: [
            { value: newCount, name: 'Khám Mới (Bệnh mới)', itemStyle: { color: this.palette.chart3 } },
            { value: oldCount, name: 'Tái Khám (Bệnh cũ)', itemStyle: { color: this.palette.chart2 } },
          ],
        },
      ],
    };
  }

  // (3) Chart: Statistics by Specialty (Top 10)
  private buildSpecialtyChart(map: Map<string, number>): void {
    const sorted = Array.from(map.entries()).sort((a, b) => b[1] - a[1]).slice(0, 10);
    const keys = sorted.map(s => s[0]).reverse(); // Reverse for horizontal bar
    const values = sorted.map(s => s[1]).reverse();

    this.specialtyChartOptions = {
      ...this.getCommonChartOptions(),
      grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
      tooltip: { ...this.getCommonChartOptions().tooltip, axisPointer: { type: 'shadow' } },
      xAxis: {
        type: 'value',
        splitLine: { lineStyle: { type: 'dashed', color: this.palette.gray200 } },
        axisLabel: { color: this.palette.textSecondary },
      },
      yAxis: {
        type: 'category',
        data: keys,
        axisLabel: { 
          color: this.palette.textPrimary,
          width: 130,
          overflow: 'truncate'
        },
        axisLine: { show: false },
        axisTick: { show: false }
      },
      series: [{
        name: 'Lượt khám',
        type: 'bar',
        data: values,
        barWidth: '60%',
        itemStyle: { color: this.palette.chart8, borderRadius: [0, 4, 4, 0] },
        label: { show: true, position: 'right', color: this.palette.textPrimary }
      }]
    };
  }

  // (4) Chart: Statistics by Doctor (Top 10)
  private buildDoctorChart(map: Map<string, number>): void {
    const sorted = Array.from(map.entries()).sort((a, b) => b[1] - a[1]).slice(0, 10);
    const keys = sorted.map(s => s[0]).reverse();
    const values = sorted.map(s => s[1]).reverse();

    this.doctorChartOptions = {
      ...this.getCommonChartOptions(),
      grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
      tooltip: { ...this.getCommonChartOptions().tooltip, axisPointer: { type: 'shadow' } },
      xAxis: {
        type: 'value',
        splitLine: { lineStyle: { type: 'dashed', color: this.palette.gray200 } },
        axisLabel: { color: this.palette.textSecondary },
      },
      yAxis: {
        type: 'category',
        data: keys,
        axisLabel: { 
          color: this.palette.textPrimary,
          width: 130,
          overflow: 'truncate'
        },
        axisLine: { show: false },
        axisTick: { show: false }
      },
      series: [{
        name: 'Lượt khám',
        type: 'bar',
        data: values,
        barWidth: '60%',
        itemStyle: { color: this.palette.tealMidtone, borderRadius: [0, 4, 4, 0] },
        label: { show: true, position: 'right', color: this.palette.textPrimary }
      }]
    };
  }

  private getCommonChartOptions() {
    return {
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
      },
      grid: {
        left: '3%',
        right: '4%',
        bottom: '5%',
        top: '15%',
        containLabel: true,
      },
    };
  }

  private formatNumber(num: number): string {
    return this.vnNumberFormatter.format(num);
  }

  public onExport(): void {
    if (this.isExporting || !this.rawData.length) return;
    this.isExporting = true;
    this.cd.markForCheck();

    setTimeout(() => {
      const columns: ExportColumn[] = [
        { key: 'NGAY_KHAM_DISPLAY', header: 'Ngày Khám' },
        { key: 'TEN_CHUYEN_KHOA', header: 'Chuyên Khoa' },
        { key: 'BAC_SI', header: 'Bác Sĩ' },
        { key: 'SO_LUOT_KHAM', header: 'Tổng Lượt Khám' },
        { key: 'SO_NGUOI_KHAM', header: 'Số Người Bệnh' },
        { key: 'BENH_MOI', header: 'Bệnh Mới' },
        { key: 'BENH_CU', header: 'Tái Khám' },
      ];

      this.excelService.exportToExcel(
        this.rawData,
        `BaoCao_KhamBenhChiTiet_${this.fromDate}_${this.toDate}`,
        columns
      );

      this.isExporting = false;
      this.toastService.showSuccess('Xuất Excel thành công.');
      this.cd.markForCheck();
    }, 500);
  }
}