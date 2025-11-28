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
import {
  ThemeService,
  ThemePalette,
} from '../../../core/services/theme.service';
import { ClsLevel6Stat } from '../../../shared/models/cls-stat.model';
import {
  ExcelExportService,
  ExportColumn,
} from '../../../core/services/excel-export.service';
import { DateUtils } from '../../../shared/utils/date.utils';
// [CLEANUP] Removed LlmService import

import { ChartCardComponent } from '../../../components/chart-card/chart-card.component';
import {
  DateFilterComponent,
  DateRange,
} from '../../../components/date-filter/date-filter.component';
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
  selector: 'app-cls-level6-report',
  standalone: true,
  imports: [
    CommonModule,
    ChartCardComponent,
    TableCardComponent,
    DateFilterComponent,
    WidgetCardComponent,
  ],
  providers: [DatePipe, DecimalPipe],
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
  private numberPipe = inject(DecimalPipe);
  private destroyRef = inject(DestroyRef);
  public readonly themeService = inject(ThemeService);
  // [CLEANUP] Removed LlmService inject

  public isLoading = false;
  public isExporting = false;
  public rawData: ClsLevel6Stat[] = [];
  public fromDate: string = '';
  public toDate: string = '';
  public widgetData: WidgetData[] = [];
  public examTrendOptions: EChartsCoreOption | null = null;
  public clsTrendOptions: EChartsCoreOption | null = null;
  public roomChartOptions: EChartsCoreOption | null = null;
  public groupChartOptions: EChartsCoreOption | null = null;
  public tableColumns: GridColumn[] = [
    {
      key: 'NGAY_TH_DISPLAY',
      label: 'Ngày thực hiện',
      sortable: true,
      width: '120px',
    },
    { key: 'PHONG_BAN_TH', label: 'Phòng ban', sortable: true, width: '200px' },
    {
      key: 'NHOM_DICH_VU',
      label: 'Nhóm dịch vụ',
      sortable: true,
      width: '200px',
    },
    { key: 'SO_LUONG', label: 'Số lượng', sortable: true, width: '100px' },
    { key: 'TYPE_LABEL', label: 'Loại', sortable: true, width: '120px' },
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
    const now = new Date();
    const day = now.getDay();
    const diff = now.getDate() - day + (day == 0 ? -6 : 1);
    const start = new Date(now.setDate(diff));
    const end = new Date(now.setDate(start.getDate() + 6));
    this.fromDate = this.datePipe.transform(start, 'yyyy-MM-dd') || '';
    this.toDate = this.datePipe.transform(end, 'yyyy-MM-dd') || '';
  }
  private initializeWidgets(): void {
    this.widgetData = [
      {
        id: 'total-exam',
        icon: 'fas fa-stethoscope',
        title: 'Tổng Lượt Khám',
        value: '0',
        caption: 'Thực hiện khám',
        accentColor: '#00839b',
      },
      {
        id: 'total-cls',
        icon: 'fas fa-microscope',
        title: 'Tổng Cận Lâm Sàng',
        value: '0',
        caption: 'Thực hiện CLS',
        accentColor: '#f89c5b',
      },
      {
        id: 'admission',
        icon: 'fas fa-procedures',
        title: 'Tổng Nhập Viện',
        value: '0',
        caption: 'Số ca nhập viện',
        accentColor: '#ffb3ba',
      },
      {
        id: 'top-room',
        icon: 'fas fa-door-open',
        title: 'Phòng Đông Nhất',
        value: '0',
        caption: 'Đang tải...',
        accentColor: '#082567',
      },
    ];
  }
  private updateWidgetColors(): void {
    if (this.widgetData.length > 0 && this.palette) {
      const setC = (id: string, color: string) => {
        const item = this.widgetData.find((x) => x.id === id);
        if (item) item.accentColor = color;
      };
      setC('total-exam', this.palette.primary);
      setC('total-cls', this.palette.chart6);
      setC('admission', this.palette.pastelCoral);
      setC('top-room', this.palette.deepSapphire);
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
    this.examTrendOptions = null;
    this.clsTrendOptions = null;
    this.roomChartOptions = null;
    this.groupChartOptions = null;
    this.cd.markForCheck();
    this.reportService
      .getClsLevel6Report(this.fromDate, this.toDate)
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
            NGAY_TH_DISPLAY: DateUtils.formatToDisplay(item.NGAY_TH),
            TYPE_LABEL:
              item.KHAM_CLS === 1
                ? 'Khám'
                : item.KHAM_CLS === 2
                ? 'CLS'
                : 'Khác',
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

  private processData(data: ClsLevel6Stat[]): void {
    if (!data || data.length === 0) {
      this.initializeWidgets();
      return;
    }

    const roomMap = new Map<string, number>();
    const groupMap = new Map<string, number>();
    const dateMap = new Map<string, { exam: number; cls: number }>();
    let totalExam = 0;
    let totalCls = 0;
    let totalAdmission = 0;

    data.forEach((i) => {
      const qty = i.SO_LUONG || 0;
      const admissionQty = i.SO_LUONG_NV || 0;
      if (i.KHAM_CLS === 1) totalExam += qty;
      else if (i.KHAM_CLS === 2) totalCls += qty;
      totalAdmission += admissionQty;

      const roomName = i.PHONG_BAN_TH || 'Khác';
      roomMap.set(roomName, (roomMap.get(roomName) || 0) + qty);
      const groupName = i.NHOM_DICH_VU || 'Chưa phân nhóm';
      groupMap.set(groupName, (groupMap.get(groupName) || 0) + qty);

      const dateKey = i.NGAY_TH ? i.NGAY_TH.split('T')[0] : 'N/A';
      const dayStats = dateMap.get(dateKey) || { exam: 0, cls: 0 };
      if (i.KHAM_CLS === 1) dayStats.exam += qty;
      else if (i.KHAM_CLS === 2) dayStats.cls += qty;
      dateMap.set(dateKey, dayStats);
    });

    const sortedRooms = Array.from(roomMap.entries()).sort(
      (a, b) => b[1] - a[1]
    );
    const topRoomName = sortedRooms[0] ? sortedRooms[0][0] : 'N/A';
    const topRoomValue = sortedRooms[0] ? sortedRooms[0][1] : 0;

    this.widgetData = [
      {
        id: 'total-exam',
        icon: 'fas fa-stethoscope',
        title: 'Tổng Lượt Khám',
        value: this.formatNumber(totalExam),
        caption: 'Thực hiện khám',
        accentColor: this.palette.primary,
      },
      {
        id: 'total-cls',
        icon: 'fas fa-microscope',
        title: 'Tổng Cận Lâm Sàng',
        value: this.formatNumber(totalCls),
        caption: 'Thực hiện CLS',
        accentColor: this.palette.chart6,
      },
      {
        id: 'admission',
        icon: 'fas fa-procedures',
        title: 'Tổng Nhập Viện',
        value: this.formatNumber(totalAdmission),
        caption: 'Số ca nhập viện',
        accentColor: this.palette.pastelCoral,
      },
      {
        id: 'top-room',
        icon: 'fas fa-door-open',
        title: topRoomName,
        value: this.formatNumber(topRoomValue),
        caption: 'Phòng Đông Nhất',
        accentColor: this.palette.deepSapphire,
      },
    ];

    // [CLEANUP] Removed updateAiContext call

    this.buildCharts(roomMap, groupMap, dateMap);
  }

  // [CLEANUP] Removed updateAiContext method

  private buildCharts(
    roomMap: Map<string, number>,
    groupMap: Map<string, number>,
    dateMap: Map<string, { exam: number; cls: number }>
  ): void {
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
      },
      grid: {
        left: '3%',
        right: '4%',
        bottom: '5%',
        top: '12%',
        containLabel: true,
      },
    };
    const sortedDates = Array.from(dateMap.keys()).sort();
    const dateLabels = sortedDates.map((d) => {
      const dateObj = new Date(d);
      return this.datePipe.transform(dateObj, 'dd/MM') || d;
    });
    const examSeriesData = sortedDates.map((d) => dateMap.get(d)?.exam || 0);
    const clsSeriesData = sortedDates.map((d) => dateMap.get(d)?.cls || 0);

    this.examTrendOptions = {
      ...commonOptions,
      legend: { show: false },
      xAxis: {
        type: 'category',
        boundaryGap: false,
        data: dateLabels,
        axisLine: { show: false },
        axisTick: { show: false },
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
          name: 'Thực hiện Khám',
          type: 'line',
          smooth: true,
          symbol: 'circle',
          symbolSize: 6,
          data: examSeriesData,
          itemStyle: { color: this.palette.primary },
          areaStyle: {
            color: {
              type: 'linear',
              x: 0,
              y: 0,
              x2: 0,
              y2: 1,
              colorStops: [
                { offset: 0, color: this.palette.primary },
                { offset: 1, color: this.palette.bgCard },
              ],
            },
            opacity: 0.2,
          },
        },
      ],
    };
    this.clsTrendOptions = {
      ...commonOptions,
      legend: { show: false },
      xAxis: {
        type: 'category',
        boundaryGap: false,
        data: dateLabels,
        axisLine: { show: false },
        axisTick: { show: false },
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
          name: 'Thực hiện CLS',
          type: 'line',
          smooth: true,
          symbol: 'circle',
          symbolSize: 6,
          data: clsSeriesData,
          itemStyle: { color: this.palette.chart6 },
          lineStyle: { width: 3 },
          areaStyle: {
            color: {
              type: 'linear',
              x: 0,
              y: 0,
              x2: 0,
              y2: 1,
              colorStops: [
                { offset: 0, color: this.palette.chart6 },
                { offset: 1, color: this.palette.bgCard },
              ],
            },
            opacity: 0.2,
          },
        },
      ],
    };

    const roomData = Array.from(roomMap.entries()).sort((a, b) => a[1] - b[1]);
    const BARS_TO_SHOW = 8;
    const totalBars = roomData.length;
    const enableZoom = totalBars > BARS_TO_SHOW;
    const startValue = enableZoom ? totalBars - BARS_TO_SHOW : 0;
    const endValue = totalBars - 1;

    this.roomChartOptions = {
      ...commonOptions,
      grid: {
        left: '3%',
        right: enableZoom ? '12%' : '8%',
        bottom: '3%',
        top: '5%',
        containLabel: true,
      },
      xAxis: {
        type: 'value',
        splitLine: {
          lineStyle: { type: 'dashed', color: this.palette.gray200 },
        },
      },
      yAxis: {
        type: 'category',
        data: roomData.map((d) => d[0]),
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: {
          width: 140,
          overflow: 'truncate',
          color: this.palette.textPrimary,
        },
      },
      dataZoom: enableZoom
        ? [
            {
              type: 'slider',
              yAxisIndex: 0,
              width: 12,
              right: '2%',
              top: '5%',
              bottom: '5%',
              startValue: startValue,
              endValue: endValue,
              fillerColor: this.palette.secondary + '40',
              borderColor: 'transparent',
              handleSize: '0%',
              showDetail: false,
              brushSelect: false,
            },
            {
              type: 'inside',
              yAxisIndex: 0,
              startValue: startValue,
              endValue: endValue,
              zoomOnMouseWheel: false,
              moveOnMouseWheel: true,
            },
          ]
        : undefined,
      series: [
        {
          name: 'Số Lượng',
          type: 'bar',
          barWidth: '60%',
          data: roomData.map((d) => d[1]),
          itemStyle: {
            color: this.palette.secondary,
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

    const groupData = Array.from(groupMap, ([name, value]) => ({
      name,
      value,
    })).sort((a, b) => b.value - a.value);
    const donutColors = [
      this.palette.chart1,
      this.palette.chart6,
      this.palette.chart8,
      this.palette.chart9,
      this.palette.chart2,
      this.palette.pastelCoral,
      this.palette.deepSapphire,
    ];
    this.groupChartOptions = {
      backgroundColor: 'transparent',
      color: donutColors,
      tooltip: {
        trigger: 'item',
        backgroundColor: this.palette.bgCard,
        borderColor: this.palette.gray200,
        textStyle: { color: this.palette.textPrimary },
      },
      legend: {
        type: 'scroll',
        orient: 'horizontal',
        bottom: 0,
        left: 'center',
        textStyle: { color: this.palette.textSecondary },
      },
      series: [
        {
          name: 'Nhóm Dịch Vụ',
          type: 'pie',
          radius: ['45%', '75%'],
          center: ['50%', '45%'],
          avoidLabelOverlap: true,
          itemStyle: {
            borderRadius: 5,
            borderColor: this.palette.bgCard,
            borderWidth: 2,
          },
          label: {
            show: true,
            position: 'outer',
            color: this.palette.textPrimary,
            formatter: (params: any) =>
              `${params.name}: ${this.vnNumberFormatter.format(
                params.value
              )} (${params.percent}%)`,
          },
          emphasis: { label: { show: true, fontWeight: 'bold' } },
          data: groupData,
        },
      ],
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
        { key: 'NGAY_TH', header: 'Ngày Thực Hiện', type: 'date' },
        { key: 'PHONG_BAN_TH', header: 'Phòng Ban' },
        { key: 'NHOM_DICH_VU', header: 'Nhóm Dịch Vụ' },
        { key: 'SO_LUONG', header: 'SL Cận Lâm Sàng' },
        { key: 'TYPE_LABEL', header: 'Loại' },
        { key: 'SO_LUONG_NV', header: 'SL Nhập Viện' },
      ];
      this.excelService.exportToExcel(
        this.rawData,
        `BaoCao_CLS_Tang6_${this.fromDate}_${this.toDate}`,
        columns
      );
      this.isExporting = false;
      this.toastService.showSuccess('Xuất Excel thành công.');
      this.cd.markForCheck();
    }, 500);
  }
}