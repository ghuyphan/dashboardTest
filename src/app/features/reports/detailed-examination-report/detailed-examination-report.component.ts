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

import { ChartCardComponent } from '../../../shared/components/chart-card/chart-card.component';
import { DateFilterComponent, DateRange } from '../../../shared/components/date-filter/date-filter.component';
import { TableCardComponent } from '../../../shared/components/table-card/table-card.component';
import { GridColumn } from '../../../shared/components/reusable-table/reusable-table.component';
import { WidgetCardComponent } from '../../../shared/components/widget-card/widget-card.component';

const GLOBAL_FONT_FAMILY = 'Inter, sans-serif';
const STANDARD_DIVISOR = 6.5; // Department standard coefficient
const CORAL_COLOR = '#FF7F50';

interface WidgetData {
  id: string;
  icon: string;
  title: string;
  value: string;
  caption: string;
  accentColor: string;
}

interface SpecialtyDetail {
  TEN_CHUYEN_KHOA: string;
  BAC_SI: string;
  BENH_CU: number;
  BENH_MOI: number;
  SO_LUOT_KHAM: number;
}

interface DailyExaminationStat {
  NGAY_KHAM: string;
  SO_LUOT_KHAM_TONG: number;
  SO_NGUOI_KHAM_TONG: number;
  CHUYEN_KHOA_KHAM: SpecialtyDetail[];
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
  private dailyStats: DailyExaminationStat[] = [];

  public fromDate: string = '';
  public toDate: string = '';

  public widgetData: WidgetData[] = [];

  // --- Charts ---
  public trendChartOptions: EChartsCoreOption | null = null;
  public patientTypeChartOptions: EChartsCoreOption | null = null;
  public specialtyChartOptions: EChartsCoreOption | null = null;
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
      if (!this.isLoading && (this.rawData.length > 0 || this.dailyStats.length > 0)) {
        this.processData();
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
        accentColor: '#9bdad9', // Placeholder (Chart-3)
      },
      {
        id: 'total-patients',
        icon: 'fas fa-user-injured',
        title: 'Số Người Bệnh',
        value: '0',
        caption: 'Unique Patients',
        accentColor: '#006e96', // Placeholder (Chart-2)
      },
      {
        id: 'avg-metric',
        icon: 'fas fa-chart-line',
        title: 'TB Lượt (Hệ số 6.5)',
        value: '0',
        caption: 'Visits / 6.5',
        accentColor: CORAL_COLOR,
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

      // SYNC: Match Widget Colors to Chart Series Colors
      setC('total-visits', this.palette.chart3); // Visits Bar Color
      setC('total-patients', this.palette.chart2); // Patients Bar Color

      setC('avg-metric', CORAL_COLOR);
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
        next: (response: any) => {
          this.dailyStats = response as DailyExaminationStat[];
          this.rawData = this.dailyStats.flatMap(day => {
            const dateDisplay = DateUtils.formatToDisplay(day.NGAY_KHAM);
            return (day.CHUYEN_KHOA_KHAM || []).map(detail => ({
              NGAYKHAM: day.NGAY_KHAM,
              NGAY_KHAM_DISPLAY: dateDisplay,
              TEN_CHUYEN_KHOA: detail.TEN_CHUYEN_KHOA || 'Khác',
              BAC_SI: detail.BAC_SI || 'Chưa xác định',
              SO_LUOT_KHAM: detail.SO_LUOT_KHAM || 0,
              SO_NGUOI_KHAM: (detail.BENH_MOI || 0) + (detail.BENH_CU || 0),
              BENH_MOI: detail.BENH_MOI || 0,
              BENH_CU: detail.BENH_CU || 0,
            } as DetailedExaminationStat));
          });

          this.processData();
        },
        error: (err) => {
          console.error(err);
          this.toastService.showError('Không thể tải dữ liệu báo cáo chi tiết.');
          this.rawData = [];
          this.dailyStats = [];
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

  private processData(): void {
    if ((!this.dailyStats || this.dailyStats.length === 0) && this.rawData.length === 0) {
      this.initializeWidgets();
      return;
    }

    let totalVisits = 0;
    let totalPatientsCalculated = 0;

    const dateMap = new Map<string, { visits: number; patients: number }>();
    const specialtyMap = new Map<string, number>();
    const doctorMap = new Map<string, number>();

    let totalNew = 0;
    let totalOld = 0;

    this.dailyStats.forEach(day => {
      const v = day.SO_LUOT_KHAM_TONG || 0;
      totalVisits += v;

      // Safe calculation for daily patients
      let dailyP = 0;
      if (day.CHUYEN_KHOA_KHAM && day.CHUYEN_KHOA_KHAM.length > 0) {
        dailyP = day.CHUYEN_KHOA_KHAM.reduce((acc, curr) => acc + (curr.BENH_MOI || 0) + (curr.BENH_CU || 0), 0);
      } else {
        dailyP = day.SO_NGUOI_KHAM_TONG || 0;
      }

      const dateKey = day.NGAY_KHAM ? day.NGAY_KHAM.split('T')[0] : 'N/A';
      dateMap.set(dateKey, { visits: v, patients: dailyP });
    });

    this.rawData.forEach(item => {
      totalNew += item.BENH_MOI || 0;
      totalOld += item.BENH_CU || 0;
      const spec = item.TEN_CHUYEN_KHOA;
      specialtyMap.set(spec, (specialtyMap.get(spec) || 0) + (item.SO_LUOT_KHAM || 0));
      const doc = item.BAC_SI;
      doctorMap.set(doc, (doctorMap.get(doc) || 0) + (item.SO_LUOT_KHAM || 0));
    });

    totalPatientsCalculated = totalNew + totalOld;
    const avgMetricValue = (totalVisits / STANDARD_DIVISOR).toFixed(2);
    const reExamRate = totalVisits > 0 ? ((totalOld / totalVisits) * 100).toFixed(1) : '0';

    this.widgetData = [
      {
        id: 'total-visits',
        icon: 'fas fa-clipboard-check',
        title: 'Tổng Lượt Khám',
        value: this.formatNumber(totalVisits),
        caption: 'Total Visits',
        accentColor: this.palette.chart3, // Matched to Chart Bar
      },
      {
        id: 'total-patients',
        icon: 'fas fa-user-injured',
        title: 'Tổng Người Bệnh',
        value: this.formatNumber(totalPatientsCalculated),
        caption: 'Total Patients',
        accentColor: this.palette.chart2, // Matched to Chart Bar
      },
      {
        id: 'avg-metric',
        icon: 'fas fa-chart-line',
        title: 'TB Lượt (HS 6.5)',
        value: avgMetricValue,
        caption: 'Workload (Div 6.5)',
        accentColor: CORAL_COLOR,
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

    this.buildTrendChart(dateMap);
    this.buildPatientTypeChart(totalNew, totalOld);
    this.buildSpecialtyChart(specialtyMap);
    this.buildDoctorChart(doctorMap);
  }

  private buildTrendChart(dateMap: Map<string, { visits: number; patients: number }>): void {
    const sortedDates = Array.from(dateMap.keys()).sort();
    const dateLabels = sortedDates.map((d) => {
      const dateObj = new Date(d);
      return this.datePipe.transform(dateObj, 'dd/MM') || d;
    });

    const visitsData = sortedDates.map(d => dateMap.get(d)?.visits || 0);
    const patientsData = sortedDates.map(d => dateMap.get(d)?.patients || 0);

    const workloadData = sortedDates.map(d => {
      const v = dateMap.get(d)?.visits || 0;
      return parseFloat((v / STANDARD_DIVISOR).toFixed(2));
    });

    this.trendChartOptions = {
      ...this.getCommonChartOptions(),
      legend: {
        top: 0,
        textStyle: { color: this.palette.textSecondary }
      },
      tooltip: {
        trigger: 'axis',
        backgroundColor: this.palette.bgCard,
        borderColor: this.palette.gray200,
        textStyle: { color: this.palette.textPrimary },
        axisPointer: { type: 'shadow' }
      },
      xAxis: {
        type: 'category',
        data: dateLabels,
        axisLabel: { color: this.palette.textPrimary },
        axisLine: { lineStyle: { color: this.palette.gray200 } },
      },
      yAxis: {
        type: 'value',
        name: 'Số lượng',
        position: 'left',
        splitLine: { lineStyle: { type: 'dashed', color: this.palette.gray200 } },
        axisLabel: { color: this.palette.textSecondary },
      },
      series: [
        {
          name: 'Tổng lượt khám',
          type: 'bar',
          data: visitsData,
          itemStyle: { color: this.palette.chart3, borderRadius: [4, 4, 0, 0] },
          barGap: '10%',
          barWidth: '30%',
          label: { show: true, position: 'top', color: this.palette.textPrimary }
        },
        {
          name: 'Số người bệnh',
          type: 'bar',
          data: patientsData,
          itemStyle: { color: this.palette.chart2, borderRadius: [4, 4, 0, 0] },
          barWidth: '30%',
          // ENABLED LABEL FOR PATIENTS
          label: { show: true, position: 'top', color: this.palette.textPrimary }
        },
        {
          name: 'TB Lượt/6.5',
          type: 'line',
          data: workloadData,
          smooth: true,
          itemStyle: { color: CORAL_COLOR },
          lineStyle: { width: 3, type: 'dashed' },
          symbolSize: 8,
          symbol: 'circle'
        }
      ]
    };
  }

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
            { value: newCount, name: 'Khám Mới', itemStyle: { color: this.palette.chart6 } },
            { value: oldCount, name: 'Tái Khám', itemStyle: { color: this.palette.primary } },
          ],
        },
      ],
    };
  }

  private buildSpecialtyChart(map: Map<string, number>): void {
    const sorted = Array.from(map.entries()).sort((a, b) => b[1] - a[1]).slice(0, 10);
    const keys = sorted.map(s => s[0]).reverse();
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