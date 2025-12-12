import {
  Component,
  OnInit,
  inject,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  effect,
  DestroyRef,
} from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { finalize } from 'rxjs/operators';
import type { EChartsCoreOption } from 'echarts/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import { ExaminationStat } from '@shared/models/examination-stat.model';
import { ReportService } from '@core/services/report.service';
import { ToastService } from '@core/services/toast.service';
import { ThemeService, ThemePalette } from '@core/services/theme.service';
import {
  ExcelExportService,
  ExportColumn,
} from '@core/services/excel-export.service';
import { DateUtils } from '@shared/utils/date.utils';
import { NumberUtils } from '@shared/utils/number.utils';

import { WidgetCardComponent } from '@shared/components/widget-card/widget-card.component';
import { ChartCardComponent } from '@shared/components/chart-card/chart-card.component';
import {
  DateFilterComponent,
  DateRange,
} from '@shared/components/date-filter/date-filter.component';
import { TableCardComponent } from '@shared/components/table-card/table-card.component';
import { GridColumn } from '@shared/components/reusable-table/reusable-table.component';

const GLOBAL_FONT_FAMILY =
  'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

interface WidgetData {
  id: string;
  icon: string;
  title: string;
  value: string;
  caption: string;
  accentColor: string;
}

@Component({
  selector: 'app-examination-overview',
  standalone: true,
  imports: [
    CommonModule,
    WidgetCardComponent,
    ChartCardComponent,
    TableCardComponent,
    DateFilterComponent,
  ],
  providers: [DatePipe],
  templateUrl: './examination-overview.component.html',
  styleUrl: './examination-overview.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExaminationOverviewComponent implements OnInit {
  private reportService = inject(ReportService);
  private toastService = inject(ToastService);
  private excelService = inject(ExcelExportService);
  private cd = inject(ChangeDetectorRef);
  private datePipe = inject(DatePipe);
  private destroyRef = inject(DestroyRef);
  public readonly themeService = inject(ThemeService);

  public isLoading = false;
  public isExporting = false;

  public rawData: ExaminationStat[] = [];

  public fromDate: string = '';
  public toDate: string = '';

  public widgetData: WidgetData[] = [];

  public trendChartOptions: EChartsCoreOption | null = null;
  public typeChartOptions: EChartsCoreOption | null = null;
  public patientStatusChartOptions: EChartsCoreOption | null = null;

  public tableColumns: GridColumn[] = [
    { key: 'NGAY_TIEP_NHAN', label: 'Ngày', sortable: true, width: '120px' },
    { key: 'TONG_LUOT_TIEP_NHAN', label: 'Tổng Lượt', sortable: true },
    { key: 'BENH_MOI', label: 'Bệnh Mới', sortable: true },
    { key: 'BENH_CU', label: 'Bệnh Cũ', sortable: true },
    { key: 'BHYT', label: 'BHYT', sortable: true },
    { key: 'VIEN_PHI', label: 'Viện Phí', sortable: true },
    { key: 'LUOT_KHAM_CK', label: 'Khám Bệnh (CK)', sortable: true },
    { key: 'LUOT_CC', label: 'Cấp Cứu', sortable: true },
    { key: 'LUOT_NT', label: 'Nội Trú', sortable: true },
    { key: 'LUOT_DNT', label: 'ĐT Ngoại Trú', sortable: true },
  ];

  private palette!: ThemePalette;

  constructor() {
    effect(() => {
      this.palette = this.themeService.currentPalette();
      this.updateWidgetColors();

      if (!this.isLoading && this.rawData.length > 0) {
        this.calculateWidgets(this.rawData);
        this.buildCharts(this.rawData);
      }

      this.cd.markForCheck();
    });
  }

  ngOnInit(): void {
    this.palette = this.themeService.currentPalette();
    this.initializeWidgetsStructure();
    this.setDefaultDateRange();
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
    this.initializeWidgetsStructure();
  }

  private initializeWidgetsStructure(): void {
    this.widgetData = [
      // { id: 'total', icon: 'fas fa-users', title: 'Tổng Tiếp Nhận', value: '0', caption: 'Total', accentColor: this.palette?.deepSapphire || '#082567' },
      {
        id: 'ck',
        icon: 'fas fa-stethoscope',
        title: 'Khám Bệnh (CK)',
        value: '0',
        caption: 'Clinic',
        accentColor: this.palette?.primary || '#00839b',
      },
      {
        id: 'emergency',
        icon: 'fas fa-ambulance',
        title: 'Cấp Cứu',
        value: '0',
        caption: 'Emergency',
        accentColor: this.palette?.pastelCoral || '#ffb3ba',
      },
      {
        id: 'inpatient',
        icon: 'fas fa-procedures',
        title: 'Nội Trú',
        value: '0',
        caption: 'Inpatient',
        accentColor: this.palette?.warning || '#f59e0b',
      },
      {
        id: 'daycare',
        icon: 'fas fa-clinic-medical',
        title: 'ĐT Ngoại Trú',
        value: '0',
        caption: 'Daycares',
        accentColor: this.palette?.tealMidtone || '#52c3d7',
      },
    ];
  }

  private updateWidgetColors(): void {
    if (this.widgetData.length > 0 && this.palette) {
      const w = this.widgetData;
      const setC = (id: string, color: string) => {
        const item = w.find(x => x.id === id);
        if (item) item.accentColor = color;
      };

      setC('total', this.palette.deepSapphire);
      setC('ck', this.palette.primary);
      setC('emergency', this.palette.pastelCoral);
      setC('inpatient', this.palette.warning);
      setC('daycare', this.palette.tealMidtone);
    }
  }

  public loadData(): void {
    if (!this.fromDate || !this.toDate) return;

    this.isLoading = true;
    this.trendChartOptions = null;
    this.typeChartOptions = null;
    this.patientStatusChartOptions = null;

    this.cd.markForCheck();

    this.reportService
      .getExaminationOverview(this.fromDate, this.toDate)
      .pipe(
        finalize(() => {
          this.isLoading = false;
          this.cd.markForCheck();
        }),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe({
        next: data => {
          this.rawData = data.map(i => ({
            ...i,
            NGAY_TIEP_NHAN: DateUtils.formatToDisplay(i.NGAY_TIEP_NHAN),
          }));
          this.calculateWidgets(data);
          this.buildCharts(data);
        },
        error: () => {
          this.toastService.showError('Không thể tải dữ liệu báo cáo.');
          this.initializeWidgetsStructure();
        },
      });
  }

  private calculateWidgets(data: ExaminationStat[]): void {
    const t = data.reduce(
      (a, c) => ({
        total: a.total + (c.TONG_LUOT_TIEP_NHAN || 0),
        ck: a.ck + (c.LUOT_KHAM_CK || 0),
        cc: a.cc + (c.LUOT_CC || 0),
        nt: a.nt + (c.LUOT_NT || 0),
        dnt: a.dnt + (c.LUOT_DNT || 0),
      }),
      { total: 0, ck: 0, cc: 0, nt: 0, dnt: 0 }
    );

    this.widgetData = this.widgetData.map(w => {
      let val = 0;
      switch (w.id) {
        case 'total':
          val = t.total;
          break;
        case 'ck':
          val = t.ck;
          break;
        case 'emergency':
          val = t.cc;
          break;
        case 'inpatient':
          val = t.nt;
          break;
        case 'daycare':
          val = t.dnt;
          break;
      }
      return { ...w, value: val.toString() };
    });
  }

  private buildCharts(data: ExaminationStat[]): void {
    const sorted = [...data].sort((a, b) => {
      const dateA = DateUtils.parse(a.NGAY_TIEP_NHAN);
      const dateB = DateUtils.parse(b.NGAY_TIEP_NHAN);
      return (dateA?.getTime() || 0) - (dateB?.getTime() || 0);
    });

    const dates = sorted.map(d => {
      const dateObj = DateUtils.parse(d.NGAY_TIEP_NHAN);
      return dateObj ? this.datePipe.transform(dateObj, 'dd/MM') : '';
    });

    const showPoints = sorted.length < 2;

    const c = {
      total: this.palette.deepSapphire,
      ck: this.palette.primary,
      cc: this.palette.pastelCoral,
      nt: this.palette.warning,
      dnt: this.palette.tealMidtone,
      bhyt: this.palette.secondary,
      vp: this.palette.warning,
      newp: this.palette.chart3,
      oldp: this.palette.chart2,
    };

    const commonOps = {
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
        confine: true, // Prevent tooltip cropping
      },
    };

    this.trendChartOptions = {
      ...commonOps,
      legend: {
        bottom: 0,
        textStyle: { color: this.palette.textSecondary },
        type: 'scroll', // Scrollable Legend
        itemWidth: 25,
      },
      xAxis: {
        type: 'category',
        boundaryGap: false,
        data: dates,
        axisLine: { show: false },
        axisLabel: { color: this.palette.textPrimary },
      },
      yAxis: {
        type: 'value',
        splitLine: {
          lineStyle: { type: 'solid', color: this.palette.gray200 },
        },
      },
      series: [
        // {
        //   name: 'Tổng Tiếp Nhận',
        //   type: 'line',
        //   smooth: true,
        //   showSymbol: showPoints,
        //   data: sorted.map((d) => d.TONG_LUOT_TIEP_NHAN),
        //   itemStyle: { color: c.total },
        //   z: 10
        // },
        {
          name: 'Khám Bệnh (CK)',
          type: 'line',
          smooth: true,
          showSymbol: showPoints,
          data: sorted.map(d => d.LUOT_KHAM_CK),
          itemStyle: { color: c.ck },
        },
        {
          name: 'Cấp Cứu',
          type: 'line',
          smooth: true,
          showSymbol: showPoints,
          data: sorted.map(d => d.LUOT_CC),
          itemStyle: { color: c.cc },
        },
        {
          name: 'Nội Trú',
          type: 'line',
          smooth: true,
          showSymbol: showPoints,
          data: sorted.map(d => d.LUOT_NT),
          itemStyle: { color: c.nt },
        },
        {
          name: 'ĐT Ngoại Trú',
          type: 'line',
          smooth: true,
          showSymbol: showPoints,
          data: sorted.map(d => d.LUOT_DNT),
          itemStyle: { color: c.dnt },
        },
      ],
    };

    const totals = sorted.reduce(
      (a, b) => ({
        bhyt: a.bhyt + (b.BHYT || 0),
        vp: a.vp + (b.VIEN_PHI || 0),
        newp: a.newp + (b.BENH_MOI || 0),
        oldp: a.oldp + (b.BENH_CU || 0),
      }),
      { bhyt: 0, vp: 0, newp: 0, oldp: 0 }
    );

    this.typeChartOptions = this.createPieChartOption(
      [
        { value: totals.bhyt, name: 'BHYT', itemStyle: { color: c.bhyt } },
        { value: totals.vp, name: 'Viện Phí', itemStyle: { color: c.vp } },
      ],
      commonOps
    );

    this.patientStatusChartOptions = this.createPieChartOption(
      [
        { value: totals.newp, name: 'Bệnh Mới', itemStyle: { color: c.newp } },
        { value: totals.oldp, name: 'Bệnh Cũ', itemStyle: { color: c.oldp } },
      ],
      commonOps
    );
  }

  private createPieChartOption(data: any[], commonOps: any): EChartsCoreOption {
    return {
      ...commonOps,
      tooltip: {
        trigger: 'item',
        backgroundColor: this.palette.bgCard,
        borderColor: this.palette.gray200,
        textStyle: { color: this.palette.textPrimary },
        confine: true, // Prevent tooltip cropping
        formatter: (params: any) =>
          `${params.marker} ${params.name}: <b>${NumberUtils.format(params.value)}</b> (${params.percent}%)`,
      },
      legend: {
        bottom: 0,
        textStyle: { color: this.palette.textSecondary },
        type: 'scroll', // Scrollable Legend
        itemWidth: 25,
      },
      series: [
        {
          type: 'pie',
          radius: ['45%', '70%'],
          center: ['50%', '45%'],
          avoidLabelOverlap: true, // Prevent overlap for pie labels
          itemStyle: {
            borderRadius: 5,
            borderColor: this.palette.bgCard,
            borderWidth: 2,
          },
          label: {
            show: true,
            position: 'outer',
            formatter: (params: any) => {
              return `${params.name}: ${NumberUtils.format(params.value)} (${params.percent}%)`;
            },
            color: this.palette.textPrimary,
          },
          emphasis: {
            label: {
              show: true,
            },
          },
          data: data,
        },
      ],
    };
  }

  public trackByWidget(index: number, item: WidgetData): string {
    return item.id;
  }

  public onExport(): void {
    if (this.isExporting) return;
    if (!this.rawData || this.rawData.length === 0) {
      this.toastService.showWarning('Không có dữ liệu để xuất.');
      return;
    }

    this.isExporting = true;

    setTimeout(() => {
      const columns: ExportColumn[] = [
        { key: 'NGAY_TIEP_NHAN', header: 'Ngày Tiếp Nhận' },
        { key: 'TONG_LUOT_TIEP_NHAN', header: 'Tổng Lượt' },
        { key: 'BENH_MOI', header: 'Bệnh Mới' },
        { key: 'BENH_CU', header: 'Bệnh Cũ' },
        { key: 'BHYT', header: 'BHYT' },
        { key: 'VIEN_PHI', header: 'Viện Phí' },
        { key: 'LUOT_KHAM_CK', header: 'Khám Bệnh (CK)' },
        { key: 'LUOT_CC', header: 'Cấp Cứu' },
        { key: 'LUOT_NT', header: 'Nội Trú' },
        { key: 'LUOT_DNT', header: 'ĐT Ngoại Trú' },
      ];

      this.excelService.exportToExcel(
        this.rawData,
        `TongQuanKhamBenh_${this.fromDate}_${this.toDate}`,
        columns
      );

      this.toastService.showSuccess('Xuất dữ liệu thành công.');
      this.isExporting = false;
      this.cd.markForCheck();
    }, 500);
  }
}
