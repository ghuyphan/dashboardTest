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

import { ReportService } from '@core/services/report.service';
import { ToastService } from '@core/services/toast.service';
import { ThemeService, ThemePalette } from '@core/services/theme.service';
import {
  ExcelExportService,
  ExportColumn,
} from '@core/services/excel-export.service';
import { SpecialtyClsStat } from '@shared/models/specialty-cls-stat.model';
import { DateUtils } from '@shared/utils/date.utils';
import { NumberUtils } from '@shared/utils/number.utils';

import { ChartCardComponent } from '@shared/components/chart-card/chart-card.component';
import {
  DateFilterComponent,
  DateRange,
} from '@shared/components/date-filter/date-filter.component';
import { TableCardComponent } from '@shared/components/table-card/table-card.component';
import { GridColumn } from '@shared/components/reusable-table/reusable-table.component';
import { WidgetCardComponent } from '@shared/components/widget-card/widget-card.component';

const GLOBAL_FONT_FAMILY = 'Inter, sans-serif';
const MAX_RANGE_DAYS = 92;

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
  public specialtyChartOptions: EChartsCoreOption | null = null;
  public groupPieChartOptions: EChartsCoreOption | null = null;
  public topSpecialtyChartOptions: EChartsCoreOption | null = null;

  public tableColumns: GridColumn[] = [
    {
      key: 'NGAY_KHAM_DISPLAY',
      label: 'Ngày Khám',
      sortable: true,
      width: '120px',
    },
    {
      key: 'TEN_CHUYEN_KHOA',
      label: 'Chuyên Khoa',
      sortable: true,
      width: '35%',
    },
    { key: 'NHOM_CLS', label: 'Nhóm Dịch Vụ', sortable: true, width: '35%' },
    { key: 'SO_LUONG', label: 'Số Lượng', sortable: true, width: '15%' },
  ];
  private palette!: ThemePalette;
  // REMOVED: private readonly vnNumberFormatter = new Intl.NumberFormat('vi-VN');

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
      {
        id: 'total-kham',
        icon: 'fas fa-user-md',
        title: 'Tổng Lượt Khám',
        value: '0',
        caption: 'Khám bệnh',
        accentColor: this.palette?.primary || '#00839b',
      },
      {
        id: 'total-cls',
        icon: 'fas fa-flask',
        title: 'Tổng Chỉ Định CLS',
        value: '0',
        caption: 'Cận lâm sàng',
        accentColor: this.palette?.chart6 || '#f89c5b',
      },
      {
        id: 'top-specialty',
        icon: 'fas fa-star',
        title: 'CK Đông Nhất',
        value: '...',
        caption: 'Hoạt động cao nhất',
        accentColor: this.palette?.deepSapphire || '#082567',
      },
    ];
  }

  private updateWidgetColors(): void {
    if (this.widgetData.length > 0 && this.palette) {
      const setC = (id: string, color: string) => {
        const item = this.widgetData.find(x => x.id === id);
        if (item) item.accentColor = color;
      };
      setC('total-kham', this.palette.widgetAccent);
      setC('total-cls', this.palette.widgetAccent);
      setC('top-specialty', this.palette.widgetAccent);
    }
  }

  public onDateFilter(range: DateRange): void {
    const start = DateUtils.parse(range.fromDate);
    const end = DateUtils.parse(range.toDate);
    if (start && end) {
      const diffTime = Math.abs(end.getTime() - start.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      if (diffDays > MAX_RANGE_DAYS) {
        this.toastService.showWarning(
          'Vui lòng chọn khoảng thời gian tối đa 1 quý (3 tháng).'
        );
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

    // [OPTIMIZATION] Ensure UI renders loading state before fetching
    setTimeout(() => {
      this.reportService
        .getSpecialtyClsReport(this.fromDate, this.toDate)
        .pipe(
          finalize(() => {
            this.isLoading = false;
            this.cd.markForCheck();
          })
        )
        .subscribe({
          next: data => {
            this.rawData = (data || []).map(item => ({
              ...item,
              NGAY_KHAM_DISPLAY: DateUtils.formatToDisplay(item.NGAY_KHAM),
            }));
            this.processData(this.rawData);
          },
          error: err => {
            console.error(err);
            this.toastService.showError('Không thể tải dữ liệu báo cáo.');
            this.rawData = [];
            this.initializeWidgets();
          },
        });
    }, 0);
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
    const uniqueGroups = new Set<string>();
    const groupOrderMap = new Map<string, number>();

    data.forEach(item => {
      const qty = item.SO_LUONG || 0;
      const group = item.NHOM_CLS || 'Khác';
      const specialty = item.TEN_CHUYEN_KHOA || 'Chưa xác định';
      const lowerGroup = group.toLowerCase();
      const sortOrder = item.NHOM ?? 999;

      if (lowerGroup.includes('khám') || lowerGroup.includes('kham'))
        totalKham += qty;
      else totalCls += qty;

      specialtyTotals.set(
        specialty,
        (specialtyTotals.get(specialty) || 0) + qty
      );
      groupTotals.set(group, (groupTotals.get(group) || 0) + qty);

      uniqueGroups.add(group);

      if (!groupOrderMap.has(group)) {
        groupOrderMap.set(group, sortOrder);
      }
    });

    const sortedSpecialties = Array.from(specialtyTotals.entries()).sort(
      (a, b) => b[1] - a[1]
    );
    const topSpecialtyName = sortedSpecialties.length
      ? sortedSpecialties[0][0]
      : 'N/A';
    const topSpecialtyValue = sortedSpecialties.length
      ? sortedSpecialties[0][1]
      : 0;

    this.widgetData = [
      {
        id: 'total-kham',
        icon: 'fas fa-user-md',
        title: 'Tổng Lượt Khám',
        value: NumberUtils.format(totalKham),
        caption: 'Khám bệnh',
        accentColor: this.palette.primary,
      },
      {
        id: 'total-cls',
        icon: 'fas fa-flask',
        title: 'Tổng Chỉ Định CLS',
        value: NumberUtils.format(totalCls),
        caption: 'Cận lâm sàng',
        accentColor: this.palette.chart6,
      },
      {
        id: 'top-specialty',
        icon: 'fas fa-star',
        title: topSpecialtyName,
        value: NumberUtils.format(topSpecialtyValue),
        caption: 'Hoạt động cao nhất',
        accentColor: this.palette.deepSapphire,
      },
    ];

    const sortedSpecialtyNames = sortedSpecialties.map(s => s[0]);

    const sortedGroups = Array.from(uniqueGroups).sort((a, b) => {
      const orderA = groupOrderMap.get(a) ?? 999;
      const orderB = groupOrderMap.get(b) ?? 999;
      return orderA - orderB;
    });

    this.buildCharts(
      data,
      sortedSpecialtyNames,
      sortedGroups,
      groupTotals,
      sortedSpecialties,
      groupOrderMap
    );
  }

  private buildCharts(
    data: SpecialtyClsStat[],
    specialties: string[],
    groups: string[],
    groupTotals: Map<string, number>,
    sortedSpecialties: [string, number][],
    groupOrderMap: Map<string, number>
  ): void {
    // Distinct colors from ThemeService, removing danger (red)
    const themePalette = [
      this.palette.primary,
      this.palette.chart6,
      this.palette.deepSapphire,
      this.palette.success,
      this.palette.pastelCoral,
      this.palette.secondary,
      this.palette.chart7,
      this.palette.tealMidtone,
      this.palette.warning,
      // this.palette.danger, // Removed red
      this.palette.info,
      this.palette.peacockLight,
      this.palette.chart3,
      this.palette.chart9,
    ];

    // Ensure uniqueness if any palette variable maps to the same color
    const uniquePalette = [...new Set(themePalette)];

    const commonOptions = {
      backgroundColor: 'transparent',
      color: uniquePalette,
      textStyle: {
        fontFamily: GLOBAL_FONT_FAMILY,
        color: this.palette.textSecondary,
      },
    };

    const series = groups.map(group => ({
      name: group,
      type: 'bar',
      stack: 'total',
      barWidth: '60%',
      emphasis: { focus: 'series' },
      data: specialties.map(spec => {
        const record = data.find(
          d => d.TEN_CHUYEN_KHOA === spec && d.NHOM_CLS === group
        );
        return record ? record.SO_LUONG : 0;
      }),
    }));

    this.specialtyChartOptions = {
      ...commonOptions,
      tooltip: {
        trigger: 'axis',
        backgroundColor: this.palette.bgCard,
        borderColor: this.palette.gray200,
        textStyle: { color: this.palette.textPrimary },
        axisPointer: { type: 'shadow' },
        confine: true, // Added to prevent cropping
      },

      legend: {
        type: 'scroll',
        top: 0,
        textStyle: { color: this.palette.textSecondary },
        itemWidth: 25, // Ensure dashes are visible
      },
      xAxis: {
        type: 'category',
        data: specialties,
        axisLabel: {
          interval: 0,
          rotate: 45,
          fontSize: 10,
          width: 140,
          overflow: 'truncate',
          color: this.palette.textPrimary,
        },
        axisLine: { lineStyle: { color: this.palette.gray200 } },
      },
      yAxis: {
        type: 'value',
        splitLine: {
          lineStyle: { type: 'solid', color: this.palette.gray200 },
        },
        axisLabel: { color: this.palette.textSecondary },
      },
      series: series as any,
    };

    const pieData = Array.from(groupTotals.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => {
        const orderA = groupOrderMap.get(a.name) ?? 999;
        const orderB = groupOrderMap.get(b.name) ?? 999;
        if (orderA !== orderB) return orderA - orderB;
        return b.value - a.value;
      });

    this.groupPieChartOptions = {
      ...commonOptions,
      tooltip: {
        trigger: 'item',
        backgroundColor: this.palette.bgCard,
        borderColor: this.palette.gray200,
        textStyle: { color: this.palette.textPrimary },
        confine: true, // Added to prevent cropping
        formatter: (params: any) =>
          `${params.marker} ${params.name}: <b>${NumberUtils.format(
            params.value
          )}</b> (${params.percent}%)`,
      },
      legend: {
        type: 'scroll', // Added to prevent overlap
        orient: 'horizontal',
        bottom: 0,
        left: 'center',
        textStyle: { color: this.palette.textSecondary },
        itemWidth: 25,
      },
      series: [
        {
          name: 'Nhóm Dịch Vụ',
          type: 'pie',
          radius: ['35%', '60%'],
          center: ['50%', '50%'],
          avoidLabelOverlap: true, // Added to prevent overlap
          itemStyle: {
            borderRadius: 4,
            borderColor: this.palette.bgCard,
            borderWidth: 2,
          },
          label: {
            show: true,
            position: 'outside',
            formatter: (params: any) => `${params.name}\n${params.percent}%`,
            color: this.palette.textPrimary,
          },
          labelLine: { show: true, length: 10, length2: 10, smooth: 0.2 },
          data: pieData,
        },
      ],
    };

    const top10Data = sortedSpecialties.slice(0, 10).reverse();
    this.topSpecialtyChartOptions = {
      ...commonOptions,
      tooltip: {
        trigger: 'axis',
        backgroundColor: this.palette.bgCard,
        borderColor: this.palette.gray200,
        textStyle: { color: this.palette.textPrimary },
        confine: true, // Added to prevent cropping
      },

      xAxis: {
        type: 'value',
        splitLine: {
          lineStyle: { type: 'solid', color: this.palette.gray200 },
        },
      },
      yAxis: {
        type: 'category',
        data: top10Data.map(d => d[0]),
        axisLabel: {
          width: 130,
          overflow: 'truncate',
          color: this.palette.textPrimary,
        },
        axisLine: { show: false },
        axisTick: { show: false },
      },
      series: [
        {
          name: 'Tổng Lượt',
          type: 'bar',
          barWidth: '60%',
          data: top10Data.map(d => d[1]),
          itemStyle: {
            color: (params: any) =>
              uniquePalette[
                (top10Data.length - 1 - params.dataIndex) % uniquePalette.length
              ],
            borderRadius: [0, 4, 4, 0],
          },
          label: {
            show: true,
            position: 'right',
            color: this.palette.textSecondary,
          },
        },
      ],
    };
  }

  private formatNumber(num: number): string {
    return NumberUtils.format(num);
  }

  public onExport(): void {
    if (this.isExporting || !this.rawData.length) return;
    this.isExporting = true;
    setTimeout(() => {
      const columns: ExportColumn[] = [
        { key: 'NGAY_KHAM_DISPLAY', header: 'Ngày Khám' },
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
