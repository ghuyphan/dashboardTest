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
import { finalize, forkJoin } from 'rxjs';
import type { EChartsCoreOption } from 'echarts/core';

import { ReportService } from '../../../core/services/report.service';
import { ToastService } from '../../../core/services/toast.service';
import { ThemeService, ThemePalette } from '../../../core/services/theme.service';
import { DateUtils } from '../../../shared/utils/date.utils';
import { MedicalRecordSummary, MedicalRecordDetail } from '../../../shared/models/medical-record-stat.model';

import { WidgetCardComponent } from '../../../components/widget-card/widget-card.component';
import { ChartCardComponent } from '../../../components/chart-card/chart-card.component';
import {
  ReusableTableComponent,
  GridColumn,
} from '../../../components/reusable-table/reusable-table.component';

const GLOBAL_FONT_FAMILY = 'Inter, sans-serif';

@Component({
  selector: 'app-medical-records-status',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    WidgetCardComponent,
    ChartCardComponent,
    ReusableTableComponent,
  ],
  providers: [DatePipe],
  templateUrl: './medical-records-status.component.html',
  styleUrl: './medical-records-status.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MedicalRecordsStatusComponent implements OnInit {
  private reportService = inject(ReportService);
  private toastService = inject(ToastService);
  private cd = inject(ChangeDetectorRef);
  private datePipe = inject(DatePipe);
  public readonly themeService = inject(ThemeService);

  public isLoading = false;
  public isInitialLoad = true;
  
  // Data State
  public summaryData: MedicalRecordSummary[] = [];
  public detailData: MedicalRecordDetail[] = [];
  
  // Filters
  public fromDate: string = '';
  public toDate: string = '';

  // Chart Config
  public doctorChartOptions: EChartsCoreOption | null = null;

  // Table Config
  public detailColumns: GridColumn[] = [
    { key: 'MAYTE', label: 'Mã Y Tế', sortable: true, width: '100px' },
    { key: 'TEN_BENH_NHAN', label: 'Tên Bệnh Nhân', sortable: true, width: '180px' },
    { key: 'NGAY_KHAM', label: 'Ngày Khám', sortable: true, width: '120px' },
    { key: 'THOI_GIAN_KHAM', label: 'Thời Gian', sortable: true, width: '120px' },
    { key: 'TEN_PHONG_KHAM', label: 'Phòng Khám', sortable: true, width: '150px' },
    { key: 'TEN_BS', label: 'Bác Sĩ', sortable: true, width: '150px' },
    { key: 'DICH_VU', label: 'Dịch Vụ', sortable: true, width: '200px' },
  ];

  private palette!: ThemePalette;

  constructor() {
    effect(() => {
      this.palette = this.themeService.currentPalette();
      if (!this.isLoading && this.summaryData.length > 0) {
        this.buildCharts(this.summaryData);
      }
      this.cd.markForCheck();
    });
  }

  ngOnInit(): void {
    this.setupInitialDate();
    this.loadData();
  }

  private setupInitialDate(): void {
    const now = new Date();
    // Default to today
    this.fromDate = this.formatDateInput(now);
    this.toDate = this.formatDateInput(now);
  }

  private formatDateInput(date: Date): string {
    return this.datePipe.transform(date, 'yyyy-MM-dd') || '';
  }

  public loadData(): void {
    if (!this.fromDate || !this.toDate) {
      this.toastService.showWarning('Vui lòng chọn đầy đủ từ ngày và đến ngày.');
      return;
    }

    this.isLoading = true;
    this.cd.markForCheck();

    forkJoin({
      summary: this.reportService.getMedicalRecordStatusSummary(this.fromDate, this.toDate),
      details: this.reportService.getMedicalRecordStatusDetail(this.fromDate, this.toDate)
    })
    .pipe(
      finalize(() => {
        this.isLoading = false;
        this.isInitialLoad = false;
        this.cd.markForCheck();
      })
    )
    .subscribe({
      next: (res) => {
        this.summaryData = res.summary || [];
        
        // Format dates in raw data for display
        this.detailData = (res.details || []).map(item => ({
          ...item,
          NGAY_KHAM: DateUtils.formatToDisplay(item.NGAY_KHAM),
          THOI_GIAN_KHAM: this.formatDateTime(item.THOI_GIAN_KHAM)
        }));

        this.buildCharts(this.summaryData);
      },
      error: (err) => {
        console.error(err);
        this.toastService.showError('Không thể tải dữ liệu thống kê.');
      }
    });
  }

  private formatDateTime(isoStr: string): string {
    const d = DateUtils.parse(isoStr);
    return d ? this.datePipe.transform(d, 'HH:mm:ss dd/MM/yyyy') || '' : '';
  }

  private buildCharts(data: MedicalRecordSummary[]): void {
    // Sort by count descending
    const sorted = [...data].sort((a, b) => b.SO_LUONG - a.SO_LUONG);
    const top10 = sorted.slice(0, 10);

    const names = top10.map(i => i.TEN_BS || 'N/A');
    const values = top10.map(i => i.SO_LUONG);

    this.doctorChartOptions = {
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
        axisPointer: { type: 'shadow' }
      },
      grid: {
        left: '3%',
        right: '4%',
        bottom: '3%',
        containLabel: true,
      },
      xAxis: {
        type: 'value',
        boundaryGap: [0, 0.01],
        splitLine: {
          lineStyle: { type: 'dashed', color: this.palette.gray200 },
        },
      },
      yAxis: {
        type: 'category',
        data: names,
        axisLabel: {
          width: 120,
          overflow: 'truncate',
          color: this.palette.textPrimary
        }
      },
      series: [
        {
          name: 'Số lượng chưa tạo',
          type: 'bar',
          data: values,
          itemStyle: {
            color: this.palette.danger, // Red for "alert" / missing records
            borderRadius: [0, 4, 4, 0]
          },
          label: {
            show: true,
            position: 'right',
            color: this.palette.textPrimary
          }
        }
      ]
    };
  }

  public onExport(): void {
    this.toastService.showInfo('Tính năng xuất Excel đang phát triển');
  }
}