import {
  Component,
  OnInit,
  inject,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  effect,
} from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { finalize } from 'rxjs/operators';
import type { EChartsCoreOption } from 'echarts/core';

import { ExaminationStat } from '../../shared/models/examination-stat.model';
import { ReportService } from '../../core/services/report.service';
import { ToastService } from '../../core/services/toast.service';
import { ThemeService, ThemePalette } from '../../core/services/theme.service';
import { DateUtils } from '../../shared/utils/date.utils';

import { WidgetCardComponent } from '../../components/widget-card/widget-card.component';
import { ChartCardComponent } from '../../components/chart-card/chart-card.component';
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
    FormsModule,
    WidgetCardComponent,
    ChartCardComponent,
    ReusableTableComponent,
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
  public fromDate: string = '';
  public toDate: string = '';
  public activeRange: string = 'thisWeek';
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

      // Only rebuild charts if we already have data (to reflect new colors)
      if (!this.isLoading && this.rawData.length > 0) {
        this.calculateWidgets(this.rawData);
        this.buildCharts(this.rawData);
        
        // FIX: Use detectChanges() instead of markForCheck() to ensure the view updates
        // immediately after the effect runs in the microtask queue.
        this.cd.detectChanges();
      }
    });
  }

  ngOnInit(): void {
    // Initialize palette synchronously first
    this.palette = this.themeService.currentPalette();
    this.setRange('thisWeek');
  }

  public setRange(
    range: 'today' | 'thisWeek' | 'thisMonth' | 'thisQuarter' | 'thisYear'
  ): void {
    this.activeRange = range;
    const now = new Date();
    let start = new Date(),
      end = new Date();

    if (range === 'today') {
      /* defaults to now */
    } else if (range === 'thisWeek') {
      const day = now.getDay(),
        diff = now.getDate() - day + (day == 0 ? -6 : 1);
      start = new Date(now.setDate(diff));
    } else if (range === 'thisMonth') {
      start = new Date(now.getFullYear(), now.getMonth(), 1);
      end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    } else if (range === 'thisQuarter') {
      const qMonth = Math.floor(now.getMonth() / 3) * 3;
      start = new Date(now.getFullYear(), qMonth, 1);
      end = new Date(now.getFullYear(), qMonth + 3, 0);
    } else if (range === 'thisYear') {
      start = new Date(now.getFullYear(), 0, 1);
      end = new Date(now.getFullYear(), 11, 31);
    }

    const fmt = (d: Date) =>
      `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}-${d
        .getDate()
        .toString()
        .padStart(2, '0')}`;
    this.fromDate = fmt(start);
    this.toDate = fmt(end);
    this.loadData();
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

    // Colors aligned with ThemeService
    this.widgetData = [
      {
        id: 'total',
        icon: 'fas fa-users',
        title: 'Tổng Tiếp Nhận',
        value: fmt(t.total),
        caption: 'Total',
        accentColor: this.palette.deepSapphire,
      },
      {
        id: 'ck',
        icon: 'fas fa-stethoscope',
        title: 'Khám Bệnh (CK)',
        value: fmt(t.ck),
        caption: 'Clinic',
        accentColor: this.palette.primary,
      },
      {
        id: 'emergency',
        icon: 'fas fa-ambulance',
        title: 'Cấp Cứu',
        value: fmt(t.cc),
        caption: 'Emergency',
        accentColor: this.palette.pastelCoral,
      },
      {
        id: 'inpatient',
        icon: 'fas fa-procedures',
        title: 'Nội Trú',
        value: fmt(t.nt),
        caption: 'Inpatient',
        accentColor: this.palette.warning,
      },
      {
        id: 'daycare',
        icon: 'fas fa-clinic-medical',
        title: 'ĐT Ngoại Trú',
        value: fmt(t.dnt),
        caption: 'Daycares',
        accentColor: this.palette.tealMidtone,
      },
    ];
  }

  private buildCharts(data: ExaminationStat[]): void {
    const sorted = [...data].sort(
      (a, b) =>
        new Date(a.NGAY_TIEP_NHAN).getTime() -
        new Date(b.NGAY_TIEP_NHAN).getTime()
    );
    const dates = sorted.map((d) =>
      this.datePipe.transform(d.NGAY_TIEP_NHAN, 'dd/MM')
    );

    // Local color mapping for cleaner chart config
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