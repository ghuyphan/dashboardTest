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

import { ExaminationStat } from '../../shared/models/examination-stat.model';
import { ReportService } from '../../core/services/report.service';
import { ToastService } from '../../core/services/toast.service';
import { ThemeService, ThemePalette } from '../../core/services/theme.service';
import { DateUtils } from '../../shared/utils/date.utils';

import { WidgetCardComponent } from '../../components/widget-card/widget-card.component';
import { ChartCardComponent } from '../../components/chart-card/chart-card.component';
import { DateFilterComponent, DateRange } from '../../components/date-filter/date-filter.component';
import {
  ReusableTableComponent,
  GridColumn,
} from '../../components/reusable-table/reusable-table.component';

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
    ReusableTableComponent,
    DateFilterComponent
  ],
  providers: [DatePipe],
  templateUrl: './examination-overview.component.html',
  styleUrl: './examination-overview.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExaminationOverviewComponent implements OnInit {
  private reportService = inject(ReportService);
  private toastService = inject(ToastService);
  private cd = inject(ChangeDetectorRef);
  private datePipe = inject(DatePipe);
  public readonly themeService = inject(ThemeService);

  public isLoading = false;
  public isInitialLoad = true;
  public rawData: ExaminationStat[] = [];
  
  // Date state
  public fromDate: string = '';
  public toDate: string = '';

  public widgetData: WidgetData[] = [];

  public trendChartOptions: EChartsCoreOption | null = null;
  public typeChartOptions: EChartsCoreOption | null = null;
  public admissionChartOptions: EChartsCoreOption | null = null;

  public tableColumns: GridColumn[] = [
    { key: 'NGAY_TIEP_NHAN', label: 'Ngày', sortable: true, width: '120px' },
    { key: 'TONG_LUOT_TIEP_NHAN', label: 'Tổng Lượt', sortable: true },
    { key: 'BHYT', label: 'BHYT', sortable: true },
    { key: 'VIEN_PHI', label: 'Viện Phí', sortable: true },
    { key: 'LUOT_KHAM_CK', label: 'Khám Bệnh (CK)', sortable: true },
    { key: 'LUOT_CC', label: 'Cấp Cứu', sortable: true },
    { key: 'LUOT_NT', label: 'Nội Trú', sortable: true },
    { key: 'LUOT_DNT', label: 'ĐT Ngoại Trú', sortable: true },
  ];

  private palette!: ThemePalette;

  constructor() {
    // UNIFIED: React to currentPalette changes
    effect(() => {
      this.palette = this.themeService.currentPalette();

      // Update widget colors immediately
      this.updateWidgetColors();

      // Only rebuild charts/widgets if we actually have data
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
    
    // Calculate default "This Week" range for initial load
    this.setDefaultDateRange();
    
    // Load data
    this.loadData();
  }

  private setDefaultDateRange(): void {
    const now = new Date();
    const day = now.getDay(); 
    const diff = now.getDate() - day + (day == 0 ? -6 : 1); // Adjust for Monday start
    const start = new Date(now.setDate(diff));
    const end = new Date(now.setDate(start.getDate() + 6)); // Sunday

    this.fromDate = this.datePipe.transform(start, 'yyyy-MM-dd') || '';
    this.toDate = this.datePipe.transform(end, 'yyyy-MM-dd') || '';
  }

  // Handles output event from app-date-filter
  public onDateFilter(range: DateRange): void {
    this.fromDate = range.fromDate;
    this.toDate = range.toDate;
    this.loadData();
  }

  private initializeWidgetsStructure(): void {
    this.widgetData = [
      {
        id: 'total',
        icon: 'fas fa-users',
        title: 'Tổng Tiếp Nhận',
        value: '0',
        caption: 'Total',
        accentColor: this.palette.deepSapphire,
      },
      {
        id: 'ck',
        icon: 'fas fa-stethoscope',
        title: 'Khám Bệnh (CK)',
        value: '0',
        caption: 'Clinic',
        accentColor: this.palette.primary,
      },
      {
        id: 'emergency',
        icon: 'fas fa-ambulance',
        title: 'Cấp Cứu',
        value: '0',
        caption: 'Emergency',
        accentColor: this.palette.pastelCoral,
      },
      {
        id: 'inpatient',
        icon: 'fas fa-procedures',
        title: 'Nội Trú',
        value: '0',
        caption: 'Inpatient',
        accentColor: this.palette.warning,
      },
      {
        id: 'daycare',
        icon: 'fas fa-clinic-medical',
        title: 'ĐT Ngoại Trú',
        value: '0',
        caption: 'Daycares',
        accentColor: this.palette.tealMidtone,
      },
    ];
  }

  private updateWidgetColors(): void {
    if (this.widgetData.length > 0) {
      const w = this.widgetData;
      w.find((x) => x.id === 'total')!.accentColor = this.palette.deepSapphire;
      w.find((x) => x.id === 'ck')!.accentColor = this.palette.primary;
      w.find((x) => x.id === 'emergency')!.accentColor = this.palette.pastelCoral;
      w.find((x) => x.id === 'inpatient')!.accentColor = this.palette.warning;
      w.find((x) => x.id === 'daycare')!.accentColor = this.palette.tealMidtone;
    }
  }

  public loadData(): void {
    if (!this.fromDate || !this.toDate) return;
    this.isLoading = true;
    this.reportService
      .getExaminationOverview(this.fromDate, this.toDate)
      .pipe(
        finalize(() => {
          this.isLoading = false;
          this.isInitialLoad = false;
          this.cd.markForCheck();
        })
      )
      .subscribe({
        next: (data) => {
          this.rawData = data.map((i) => ({
            ...i,
            NGAY_TIEP_NHAN: DateUtils.formatToDisplay(i.NGAY_TIEP_NHAN),
          }));
          this.calculateWidgets(data);
          this.buildCharts(data);
        },
        error: () =>
          this.toastService.showError('Không thể tải dữ liệu báo cáo.'),
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

    const fmt = (n: number) => new Intl.NumberFormat('vi-VN').format(n);

    const updateWidget = (id: string, value: string) => {
      const widget = this.widgetData.find((w) => w.id === id);
      if (widget) widget.value = value;
    };

    updateWidget('total', fmt(t.total));
    updateWidget('ck', fmt(t.ck));
    updateWidget('emergency', fmt(t.cc));
    updateWidget('inpatient', fmt(t.nt));
    updateWidget('daycare', fmt(t.dnt));
  }

  private buildCharts(data: ExaminationStat[]): void {
    // Sort by date
    const sorted = [...data].sort((a, b) => {
      const dateA = DateUtils.parse(a.NGAY_TIEP_NHAN);
      const dateB = DateUtils.parse(b.NGAY_TIEP_NHAN);
      return (dateA?.getTime() || 0) - (dateB?.getTime() || 0);
    });

    const dates = sorted.map((d) => {
      const dateObj = DateUtils.parse(d.NGAY_TIEP_NHAN);
      return dateObj ? this.datePipe.transform(dateObj, 'dd/MM') : '';
    });

    const c = {
      total: this.palette.deepSapphire,
      ck: this.palette.primary,
      cc: this.palette.pastelCoral,
      nt: this.palette.warning,
      dnt: this.palette.tealMidtone,
      bhyt: this.palette.secondary,
      vp: this.palette.warning,
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
      },
      grid: {
        left: '2%',
        right: '3%',
        bottom: '10%',
        top: '10%',
        containLabel: true,
      },
    };

    this.trendChartOptions = {
      ...commonOps,
      legend: { bottom: 0, textStyle: { color: this.palette.textSecondary } },
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
          lineStyle: { type: 'dashed', color: this.palette.gray200 },
        },
      },
      series: [
        {
          name: 'Tổng Tiếp Nhận',
          type: 'line',
          smooth: true,
          showSymbol: false,
          data: sorted.map((d) => d.TONG_LUOT_TIEP_NHAN),
          itemStyle: { color: c.total },
        },
        {
          name: 'Khám Bệnh (CK)',
          type: 'line',
          smooth: true,
          showSymbol: false,
          data: sorted.map((d) => d.LUOT_KHAM_CK),
          itemStyle: { color: c.ck },
        },
        {
          name: 'Cấp Cứu',
          type: 'line',
          smooth: true,
          showSymbol: false,
          data: sorted.map((d) => d.LUOT_CC),
          itemStyle: { color: c.cc },
        },
        {
          name: 'Nội Trú',
          type: 'line',
          smooth: true,
          showSymbol: false,
          data: sorted.map((d) => d.LUOT_NT),
          itemStyle: { color: c.nt },
        },
        {
          name: 'ĐT Ngoại Trú',
          type: 'line',
          smooth: true,
          showSymbol: false,
          data: sorted.map((d) => d.LUOT_DNT),
          itemStyle: { color: c.dnt },
        },
      ],
    };

    const pieTotals = sorted.reduce(
      (a, b) => ({
        bhyt: a.bhyt + (b.BHYT || 0),
        vp: a.vp + (b.VIEN_PHI || 0),
      }),
      { bhyt: 0, vp: 0 }
    );
    this.typeChartOptions = {
      ...commonOps,
      tooltip: {
        trigger: 'item',
        formatter: '{b}: {c} ({d}%)',
        backgroundColor: this.palette.bgCard,
        borderColor: this.palette.gray200,
        textStyle: { color: this.palette.textPrimary },
      },
      legend: { bottom: 0, textStyle: { color: this.palette.textSecondary } },
      series: [
        {
          type: 'pie',
          radius: ['45%', '70%'],
          center: ['50%', '45%'],
          itemStyle: {
            borderRadius: 5,
            borderColor: this.palette.bgCard,
            borderWidth: 2,
          },
          label: { show: false, position: 'center' },
          emphasis: {
            label: {
              show: true,
              fontSize: 18,
              fontWeight: 'bold',
              color: this.palette.textPrimary,
            },
          },
          data: [
            {
              value: pieTotals.bhyt,
              name: 'BHYT',
              itemStyle: { color: c.bhyt },
            },
            {
              value: pieTotals.vp,
              name: 'Viện Phí',
              itemStyle: { color: c.vp },
            },
          ],
        },
      ],
    };

    const barTotals = {
      ck: sorted.reduce((s, i) => s + (i.LUOT_KHAM_CK || 0), 0),
      cc: sorted.reduce((s, i) => s + (i.LUOT_CC || 0), 0),
      nt: sorted.reduce((s, i) => s + (i.LUOT_NT || 0), 0),
      dnt: sorted.reduce((s, i) => s + (i.LUOT_DNT || 0), 0),
    };

    this.admissionChartOptions = {
      ...commonOps,
      xAxis: {
        type: 'category',
        data: ['Khám CK', 'Cấp Cứu', 'Nội Trú', 'ĐT Ngoại Trú'],
        axisLabel: { color: this.palette.textPrimary },
      },
      yAxis: {
        type: 'value',
        splitLine: {
          lineStyle: { type: 'dashed', color: this.palette.gray200 },
        },
      },
      series: [
        {
          type: 'bar',
          barWidth: '40%',
          itemStyle: { borderRadius: [4, 4, 0, 0] },
          data: [
            { value: barTotals.ck, itemStyle: { color: c.ck } },
            { value: barTotals.cc, itemStyle: { color: c.cc } },
            { value: barTotals.nt, itemStyle: { color: c.nt } },
            { value: barTotals.dnt, itemStyle: { color: c.dnt } },
          ],
        },
      ],
    };
  }

  public trackByWidget(index: number, item: WidgetData): string {
    return item.id;
  }
  
  public onExport(): void {
    this.toastService.showInfo('Tính năng đang phát triển');
  }
}