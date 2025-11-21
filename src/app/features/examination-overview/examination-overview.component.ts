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

// Models & Services
import { ExaminationStat } from '../../shared/models/examination-stat.model';
import { ReportService } from '../../core/services/report.service';
import { ToastService } from '../../core/services/toast.service';
import { ThemeService } from '../../core/services/theme.service';
import { DateUtils } from '../../shared/utils/date.utils';

// Components
import { WidgetCardComponent } from '../../components/widget-card/widget-card.component';
import { ChartCardComponent } from '../../components/chart-card/chart-card.component';
import {
  ReusableTableComponent,
  GridColumn,
} from '../../components/reusable-table/reusable-table.component';

// --- HELPER: Global Font Family (Consistent with Dashboard) ---
const GLOBAL_FONT_FAMILY =
  'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

// --- HELPER: CSS Variable Reader ---
function getCssVar(name: string): string {
  if (typeof document === 'undefined') return '';
  return getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
}

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

  // Filter State
  public fromDate: string = '';
  public toDate: string = '';
  public activeRange: string = 'thisWeek';

  // UI Data
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

  // --- CHANGED: Centralized CSS Variables Object ---
  private cssVars = {
    textColor: '#0F172A',
    gridColor: '#E2E8F0',
    white: '#FFFFFF', // Maps to --surface-card or --white
    tooltipBorder: '#E2E8F0',
    tooltipText: '#1E293B',
    
    // Chart Colors
    total: '#082567', 
    ck: '#00839B', 
    emergency: '#FFB3BA', 
    inpatient: '#F59E0B', 
    daycare: '#52C3D7',
    pieBhyt: '#006E96',
    pieService: '#F59E0B'
  };

  constructor() {
    // 1. React to theme changes
    effect(() => {
      const isDark = this.themeService.isDarkTheme(); // Dependency tracking

      // Re-fetch styles into cssVars
      this.initColors();

      // Rebuild charts if data exists
      if (!this.isLoading && this.rawData.length > 0) {
        this.buildCharts(this.rawData); 
        this.cd.markForCheck();
      }
    });
  }

  // --- NEW METHOD: Consistent Color Initialization ---
  private initColors(): void {
    const c = getCssVar;
    // Helper to fallback if var not found
    const check = (name: string, fallback: string) => c(name) || fallback;

    this.cssVars.textColor = check('--text-primary', '#0F172A');
    this.cssVars.gridColor = check('--gray-200', '#E2E8F0');
    this.cssVars.white = check('--white', '#FFFFFF'); // Matches DeviceDashboard logic
    this.cssVars.tooltipBorder = check('--border-color', '#E2E8F0');
    this.cssVars.tooltipText = check('--text-primary', '#1E293B');
    
    // You can also map chart colors to CSS variables here if you defined them in styles.scss
    // For now, keeping the specific ones defined in the class.
  }

  ngOnInit(): void {
    // Initialize colors on start (in case effect hasn't run yet)
    if (typeof window !== 'undefined') {
       this.initColors();
    }
    this.setRange('thisWeek');
  }

  public setRange(
    range: 'today' | 'thisWeek' | 'thisMonth' | 'thisQuarter' | 'thisYear'
  ): void {
    this.activeRange = range;
    const now = new Date();
    let start = new Date();
    let end = new Date();

    switch (range) {
      case 'today':
        break;
      case 'thisWeek':
        const day = now.getDay(),
          diff = now.getDate() - day + (day == 0 ? -6 : 1);
        start = new Date(now.setDate(diff));
        end = new Date();
        break;
      case 'thisMonth':
        start = new Date(now.getFullYear(), now.getMonth(), 1);
        end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        break;
      case 'thisQuarter':
        const currMonth = now.getMonth();
        const startMonth = Math.floor(currMonth / 3) * 3;
        start = new Date(now.getFullYear(), startMonth, 1);
        end = new Date(now.getFullYear(), startMonth + 3, 0);
        break;
      case 'thisYear':
        start = new Date(now.getFullYear(), 0, 1);
        end = new Date(now.getFullYear(), 11, 31);
        break;
    }

    this.fromDate = this.formatDateInput(start);
    this.toDate = this.formatDateInput(end);
    this.loadData();
  }

  public loadData(): void {
    if (!this.fromDate || !this.toDate) {
      this.toastService.showWarning('Vui lòng chọn đầy đủ từ ngày và đến ngày');
      return;
    }

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
          this.rawData = data.map((item) => ({
            ...item,
            NGAY_TIEP_NHAN: DateUtils.formatToDisplay(item.NGAY_TIEP_NHAN),
          }));

          this.calculateWidgets(data);
          this.buildCharts(data);
        },
        error: (err) => {
          console.error(err);
          this.toastService.showError('Không thể tải dữ liệu báo cáo.');
          this.isInitialLoad = false;
        },
      });
  }

  private calculateWidgets(data: ExaminationStat[]): void {
    const totals = data.reduce(
      (acc, cur) => ({
        total: acc.total + (cur.TONG_LUOT_TIEP_NHAN || 0),
        ck: acc.ck + (cur.LUOT_KHAM_CK || 0),
        emergency: acc.emergency + (cur.LUOT_CC || 0),
        inpatient: acc.inpatient + (cur.LUOT_NT || 0),
        daycare: acc.daycare + (cur.LUOT_DNT || 0),
      }),
      { total: 0, ck: 0, emergency: 0, inpatient: 0, daycare: 0 }
    );

    this.widgetData = [
      {
        id: 'total',
        icon: 'fas fa-users',
        title: 'Tổng Tiếp Nhận',
        value: this.formatNumber(totals.total),
        caption: 'Total',
        accentColor: this.cssVars.total,
      },
      {
        id: 'ck',
        icon: 'fas fa-stethoscope',
        title: 'Khám Bệnh (CK)',
        value: this.formatNumber(totals.ck),
        caption: 'Clinic',
        accentColor: this.cssVars.ck,
      },
      {
        id: 'emergency',
        icon: 'fas fa-ambulance',
        title: 'Cấp Cứu',
        value: this.formatNumber(totals.emergency),
        caption: 'Emergency',
        accentColor: this.cssVars.emergency,
      },
      {
        id: 'inpatient',
        icon: 'fas fa-procedures',
        title: 'Nội Trú',
        value: this.formatNumber(totals.inpatient),
        caption: 'Inpatient',
        accentColor: this.cssVars.inpatient,
      },
      {
        id: 'daycare',
        icon: 'fas fa-clinic-medical',
        title: 'ĐT Ngoại Trú',
        value: this.formatNumber(totals.daycare),
        caption: 'Daycares',
        accentColor: this.cssVars.daycare,
      },
    ];
  }

  private buildCharts(data: ExaminationStat[]): void {
    const sortedData = [...data].sort(
      (a, b) =>
        new Date(a.NGAY_TIEP_NHAN).getTime() -
        new Date(b.NGAY_TIEP_NHAN).getTime()
    );

    const dates = sortedData.map((d) =>
      this.datePipe.transform(d.NGAY_TIEP_NHAN, 'dd/MM')
    );

    const totalSeries = sortedData.map((d) => d.TONG_LUOT_TIEP_NHAN || 0);
    const clinicSeries = sortedData.map((d) => d.LUOT_KHAM_CK || 0);
    const emergencySeries = sortedData.map((d) => d.LUOT_CC || 0);
    const inpatientSeries = sortedData.map((d) => d.LUOT_NT || 0);
    const daycareSeries = sortedData.map((d) => d.LUOT_DNT || 0);

    // Use this.cssVars
    const cv = this.cssVars;

    this.trendChartOptions = {
      backgroundColor: cv.white, // <--- FIXED: Uses theme card background
      textStyle: {
        fontFamily: GLOBAL_FONT_FAMILY,
      },
      tooltip: {
        trigger: 'axis',
        backgroundColor: cv.white, 
        borderColor: cv.tooltipBorder, 
        textStyle: { color: cv.tooltipText, fontFamily: GLOBAL_FONT_FAMILY },
      },
      legend: {
        data: [
          'Tổng Tiếp Nhận',
          'Khám Bệnh (CK)',
          'Cấp Cứu',
          'Nội Trú',
          'ĐT Ngoại Trú',
        ],
        bottom: 0,
        icon: 'circle',
        textStyle: { color: cv.textColor },
      },
      grid: {
        left: '2%',
        right: '3%',
        bottom: '10%',
        top: '5%',
        containLabel: true,
      },
      xAxis: {
        type: 'category',
        boundaryGap: false,
        data: dates,
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { color: cv.textColor },
      },
      yAxis: {
        type: 'value',
        axisLabel: { color: cv.textColor },
        splitLine: { lineStyle: { type: 'dashed', color: cv.gridColor } },
      },
      series: [
        {
          name: 'Tổng Tiếp Nhận',
          type: 'line',
          smooth: true,
          showSymbol: false,
          data: totalSeries,
          itemStyle: { color: cv.total },
        },
        {
          name: 'Khám Bệnh (CK)',
          type: 'line',
          smooth: true,
          showSymbol: false,
          data: clinicSeries,
          itemStyle: { color: cv.ck },
        },
        {
          name: 'Cấp Cứu',
          type: 'line',
          smooth: true,
          showSymbol: false,
          data: emergencySeries,
          itemStyle: { color: cv.emergency },
        },
        {
          name: 'Nội Trú',
          type: 'line',
          smooth: true,
          showSymbol: false,
          data: inpatientSeries,
          itemStyle: { color: cv.inpatient },
        },
        {
          name: 'ĐT Ngoại Trú',
          type: 'line',
          smooth: true,
          showSymbol: false,
          data: daycareSeries,
          itemStyle: { color: cv.daycare },
        },
      ],
    };

    const totals = sortedData.reduce(
      (acc, cur) => ({
        bhyt: acc.bhyt + (cur.BHYT || 0),
        service: acc.service + (cur.VIEN_PHI || 0),
        clinic: acc.clinic + (cur.LUOT_KHAM_CK || 0),
        emergency: acc.emergency + (cur.LUOT_CC || 0),
        inpatient: acc.inpatient + (cur.LUOT_NT || 0),
        daycare: acc.daycare + (cur.LUOT_DNT || 0),
      }),
      { bhyt: 0, service: 0, clinic: 0, emergency: 0, inpatient: 0, daycare: 0 }
    );

    this.typeChartOptions = {
      backgroundColor: cv.white, // <--- FIXED
      textStyle: {
        fontFamily: GLOBAL_FONT_FAMILY,
      },
      tooltip: {
        trigger: 'item',
        formatter: '{b}: {c} ({d}%)',
        backgroundColor: cv.white, 
        borderColor: cv.tooltipBorder, 
        textStyle: { color: cv.tooltipText, fontFamily: GLOBAL_FONT_FAMILY },
      },
      legend: {
        orient: 'horizontal',
        bottom: 0,
        icon: 'circle',
        textStyle: { color: cv.textColor },
      },
      series: [
        {
          name: 'Đối tượng',
          type: 'pie',
          radius: ['45%', '70%'],
          center: ['50%', '45%'],
          avoidLabelOverlap: false,
          // Use background color for border to create "gap" effect cleanly
          itemStyle: { borderRadius: 5, borderColor: cv.white, borderWidth: 2 },
          label: { show: false, position: 'center' },
          emphasis: { 
             label: { 
                show: true, 
                fontSize: 18, 
                fontWeight: 'bold',
                color: cv.textColor // Ensure text is visible
             } 
          },
          data: [
            {
              value: totals.bhyt,
              name: 'BHYT',
              itemStyle: { color: cv.pieBhyt },
            },
            {
              value: totals.service,
              name: 'Viện Phí',
              itemStyle: { color: cv.pieService },
            },
          ],
        },
      ],
    };

    this.admissionChartOptions = {
      backgroundColor: cv.white, // <--- FIXED
      textStyle: {
        fontFamily: GLOBAL_FONT_FAMILY,
      },
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        backgroundColor: cv.white, 
        borderColor: cv.tooltipBorder, 
        textStyle: { color: cv.tooltipText, fontFamily: GLOBAL_FONT_FAMILY },
      },
      grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
      xAxis: {
        type: 'category',
        data: ['Khám Bệnh (CK)', 'Cấp Cứu', 'Nội Trú', 'ĐT Ngoại Trú'],
        axisLabel: { color: cv.textColor },
      },
      yAxis: {
        type: 'value',
        axisLabel: { color: cv.textColor },
        splitLine: { lineStyle: { type: 'dashed', color: cv.gridColor } },
      },
      series: [
        {
          name: 'Lượt',
          type: 'bar',
          barWidth: '40%',
          itemStyle: { borderRadius: [4, 4, 0, 0] },
          data: [
            { value: totals.clinic, itemStyle: { color: cv.ck } },
            { value: totals.emergency, itemStyle: { color: cv.emergency } },
            { value: totals.inpatient, itemStyle: { color: cv.inpatient } },
            { value: totals.daycare, itemStyle: { color: cv.daycare } },
          ],
        },
      ],
    };
  }

  private formatDateInput(date: Date): string {
    const y = date.getFullYear();
    const m = (date.getMonth() + 1).toString().padStart(2, '0');
    const d = date.getDate().toString().padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  private formatNumber(val: number): string {
    return new Intl.NumberFormat('vi-VN').format(val);
  }

  public trackByWidget(index: number, item: WidgetData): string {
    return item.id;
  }

  public onExport(): void {
    this.toastService.showInfo('Tính năng xuất Excel đang được phát triển.');
  }
}