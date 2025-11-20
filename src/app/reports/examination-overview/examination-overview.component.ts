import { Component, OnInit, inject, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { finalize } from 'rxjs/operators';
import type { EChartsCoreOption } from 'echarts/core';

// Models & Services
import { ExaminationStat } from '../../models/examination-stat.model';
import { ReportService } from '../../services/report.service';
import { ToastService } from '../../services/toast.service';
import { DateUtils } from '../../utils/date.utils';

// Components
import { WidgetCardComponent } from '../../components/widget-card/widget-card.component';
import { ChartCardComponent } from '../../components/chart-card/chart-card.component';
import { ReusableTableComponent, GridColumn } from '../../components/reusable-table/reusable-table.component';

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
    ReusableTableComponent
  ],
  providers: [DatePipe],
  templateUrl: './examination-overview.component.html',
  styleUrl: './examination-overview.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ExaminationOverviewComponent implements OnInit {
  private reportService = inject(ReportService);
  private toastService = inject(ToastService);
  private cd = inject(ChangeDetectorRef);
  private datePipe = inject(DatePipe);

  public isLoading = false;
  public rawData: ExaminationStat[] = [];
  
  // Filter State
  public fromDate: string = '';
  public toDate: string = '';

  // UI Data
  public widgetData: WidgetData[] = [];
  public trendChartOptions: EChartsCoreOption | null = null;
  public typeChartOptions: EChartsCoreOption | null = null;
  public admissionChartOptions: EChartsCoreOption | null = null;

  // Table Config
  public tableColumns: GridColumn[] = [
    { key: 'NGAY_TIEP_NHAN', label: 'Ngày', sortable: true, width: '120px' },
    { key: 'TONG_LUOT_TIEP_NHAN', label: 'Tổng Lượt', sortable: true },
    { key: 'BHYT', label: 'BHYT', sortable: true },
    { key: 'VIEN_PHI', label: 'Viện Phí', sortable: true },
    { key: 'LUOT_CC', label: 'Cấp Cứu', sortable: true },
    { key: 'LUOT_NT', label: 'Nội Trú', sortable: true },
    { key: 'LUOT_KHAM_CK', label: 'Phòng Khám', sortable: true }
  ];

  ngOnInit(): void {
    // Default to current month
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    
    this.fromDate = this.formatDateInput(firstDay);
    this.toDate = this.formatDateInput(lastDay);

    this.loadData();
  }

  public loadData(): void {
    if (!this.fromDate || !this.toDate) {
      this.toastService.showWarning('Vui lòng chọn đầy đủ từ ngày và đến ngày');
      return;
    }

    this.isLoading = true;
    this.reportService.getExaminationOverview(this.fromDate, this.toDate)
      .pipe(finalize(() => {
        this.isLoading = false;
        this.cd.markForCheck();
      }))
      .subscribe({
        next: (data) => {
          // Process dates for display in table
          this.rawData = data.map(item => ({
             ...item,
             NGAY_TIEP_NHAN: DateUtils.formatToDisplay(item.NGAY_TIEP_NHAN)
          }));

          this.calculateWidgets(data);
          this.buildCharts(data);
        },
        error: (err) => {
          console.error(err);
          this.toastService.showError('Không thể tải dữ liệu báo cáo.');
        }
      });
  }

  private calculateWidgets(data: ExaminationStat[]): void {
    const totals = data.reduce((acc, cur) => ({
      total: acc.total + (cur.TONG_LUOT_TIEP_NHAN || 0),
      bhyt: acc.bhyt + (cur.BHYT || 0),
      emergency: acc.emergency + (cur.LUOT_CC || 0),
      inpatient: acc.inpatient + (cur.LUOT_NT || 0),
    }), { total: 0, bhyt: 0, emergency: 0, inpatient: 0 });

    this.widgetData = [
      {
        id: 'total',
        icon: 'fas fa-users',
        title: 'Tổng Tiếp Nhận',
        value: this.formatNumber(totals.total),
        caption: 'Lượt khám',
        accentColor: '#00839B' // teal-blue
      },
      {
        id: 'bhyt',
        icon: 'fas fa-address-card',
        title: 'Bảo Hiểm Y Tế',
        value: this.formatNumber(totals.bhyt),
        caption: 'Lượt',
        accentColor: '#006E96' // peacock-blue
      },
      {
        id: 'emergency',
        icon: 'fas fa-ambulance',
        title: 'Cấp Cứu',
        value: this.formatNumber(totals.emergency),
        caption: 'Lượt',
        accentColor: '#DC2626' // color-danger
      },
      {
        id: 'inpatient',
        icon: 'fas fa-procedures',
        title: 'Nội Trú',
        value: this.formatNumber(totals.inpatient),
        caption: 'Lượt nhập viện',
        accentColor: '#F59E0B' // color-warning
      }
    ];
  }

  private buildCharts(data: ExaminationStat[]): void {
    // Sort by date ensures correct line chart order
    const sortedData = [...data].sort((a, b) => 
      new Date(a.NGAY_TIEP_NHAN).getTime() - new Date(b.NGAY_TIEP_NHAN).getTime()
    );

    const dates = sortedData.map(d => this.datePipe.transform(d.NGAY_TIEP_NHAN, 'dd/MM'));
    const totalSeries = sortedData.map(d => d.TONG_LUOT_TIEP_NHAN || 0);
    const newSeries = sortedData.map(d => d.BENH_MOI || 0);
    const oldSeries = sortedData.map(d => d.BENH_CU || 0);

    // 1. Trend Chart
    this.trendChartOptions = {
      tooltip: { trigger: 'axis' },
      legend: { data: ['Tổng', 'Bệnh Mới', 'Bệnh Cũ'], bottom: 0 },
      grid: { left: '3%', right: '4%', bottom: '10%', top: '3%', containLabel: true },
      xAxis: { type: 'category', boundaryGap: false, data: dates },
      yAxis: { type: 'value' },
      series: [
        {
          name: 'Tổng', type: 'line', smooth: true, data: totalSeries,
          itemStyle: { color: '#00839B' }, areaStyle: { opacity: 0.1 }
        },
        {
          name: 'Bệnh Mới', type: 'line', smooth: true, data: newSeries,
          itemStyle: { color: '#16A34A' }
        },
        {
          name: 'Bệnh Cũ', type: 'line', smooth: true, data: oldSeries,
          itemStyle: { color: '#64748B' }, lineStyle: { type: 'dashed' }
        }
      ]
    };

    // Aggregates for Pie/Bar
    const totals = sortedData.reduce((acc, cur) => ({
      bhyt: acc.bhyt + (cur.BHYT || 0),
      service: acc.service + (cur.VIEN_PHI || 0),
      emergency: acc.emergency + (cur.LUOT_CC || 0),
      inpatient: acc.inpatient + (cur.LUOT_NT || 0),
      daycare: acc.daycare + (cur.LUOT_DNT || 0),
      clinic: acc.clinic + (cur.LUOT_KHAM_CK || 0)
    }), { bhyt: 0, service: 0, emergency: 0, inpatient: 0, daycare: 0, clinic: 0 });

    // 2. Breakdown by Type (Pie)
    this.typeChartOptions = {
      tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
      legend: { orient: 'vertical', left: 'left' },
      series: [{
        name: 'Đối tượng',
        type: 'pie',
        radius: ['40%', '70%'],
        avoidLabelOverlap: false,
        itemStyle: { borderRadius: 10, borderColor: '#fff', borderWidth: 2 },
        label: { show: false, position: 'center' },
        emphasis: { label: { show: true, fontSize: 20, fontWeight: 'bold' } },
        data: [
          { value: totals.bhyt, name: 'BHYT', itemStyle: { color: '#006E96' } },
          { value: totals.service, name: 'Viện Phí', itemStyle: { color: '#F59E0B' } }
        ]
      }]
    };

    // 3. Admission Source (Bar)
    this.admissionChartOptions = {
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
      xAxis: { type: 'category', data: ['Phòng Khám', 'Cấp Cứu', 'Nội Trú', 'DNT'] },
      yAxis: { type: 'value' },
      series: [{
        name: 'Lượt',
        type: 'bar',
        barWidth: '50%',
        data: [
          { value: totals.clinic, itemStyle: { color: '#00839B' } },
          { value: totals.emergency, itemStyle: { color: '#DC2626' } },
          { value: totals.inpatient, itemStyle: { color: '#F59E0B' } },
          { value: totals.daycare, itemStyle: { color: '#64748B' } }
        ]
      }]
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
}