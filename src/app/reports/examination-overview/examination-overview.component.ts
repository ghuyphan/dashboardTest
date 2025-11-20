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
  public isInitialLoad = true;
  public rawData: ExaminationStat[] = [];

  // Filter State
  public fromDate: string = '';
  public toDate: string = '';
  public activeRange: string = 'thisMonth';

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
    { key: 'LUOT_CC', label: 'Cấp Cứu', sortable: true },
    { key: 'LUOT_NT', label: 'Nội Trú', sortable: true },
    { key: 'LUOT_KHAM_CK', label: 'Phòng Khám', sortable: true }
  ];

  ngOnInit(): void {
    this.setRange('thisMonth');
  }

  public setRange(range: 'today' | 'thisWeek' | 'thisMonth' | 'thisQuarter' | 'thisYear'): void {
    this.activeRange = range;
    const now = new Date();
    let start = new Date();
    let end = new Date();

    switch (range) {
      case 'today':
        // start/end are already now
        break;
      case 'thisWeek':
        // Assume Monday start
        const day = now.getDay(), diff = now.getDate() - day + (day == 0 ? -6 : 1);
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

    this.reportService.getExaminationOverview(this.fromDate, this.toDate)
      .pipe(finalize(() => {
        this.isLoading = false;
        this.isInitialLoad = false;
        this.cd.markForCheck();
      }))
      .subscribe({
        next: (data) => {
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
          this.isInitialLoad = false;
        }
      });
  }
  private calculateWidgets(data: ExaminationStat[]): void {
    const totals = data.reduce((acc, cur) => ({
      total: acc.total + (cur.TONG_LUOT_TIEP_NHAN || 0),
      bhyt: acc.bhyt + (cur.BHYT || 0),
      emergency: acc.emergency + (cur.LUOT_CC || 0),
      inpatient: acc.inpatient + (cur.LUOT_NT || 0),
      daycare: acc.daycare + (cur.LUOT_DNT || 0),
    }), { total: 0, bhyt: 0, emergency: 0, inpatient: 0, daycare: 0 });

    this.widgetData = [
      {
        id: 'total',
        icon: 'fas fa-users',
        title: 'Tổng Tiếp Nhận',
        value: this.formatNumber(totals.total),
        caption: 'Total Admissions',
        accentColor: '#00839B'
      },
      {
        id: 'bhyt',
        icon: 'fas fa-address-card',
        title: 'Bảo Hiểm Y Tế',
        value: this.formatNumber(totals.bhyt),
        caption: 'Health Insurance',
        accentColor: '#006E96'
      },
      {
        id: 'emergency',
        icon: 'fas fa-ambulance',
        title: 'Cấp Cứu',
        value: this.formatNumber(totals.emergency),
        caption: 'Emergency',
        accentColor: '#FFB3BA' // Violet
      },
      {
        id: 'inpatient',
        icon: 'fas fa-procedures',
        title: 'Nội Trú',
        value: this.formatNumber(totals.inpatient),
        caption: 'Inpatient',
        accentColor: '#F59E0B'
      },
      {
        id: 'daycare',
        icon: 'fas fa-clinic-medical',
        title: 'ĐT Ngoại Trú (DNT)',
        value: this.formatNumber(totals.daycare),
        caption: 'Daycares',
        accentColor: '#52C3D7' // Teal Midtone (Distinct from main teal)
      }
    ];
  }

  private buildCharts(data: ExaminationStat[]): void {
    const sortedData = [...data].sort((a, b) =>
      new Date(a.NGAY_TIEP_NHAN).getTime() - new Date(b.NGAY_TIEP_NHAN).getTime()
    );

    const dates = sortedData.map(d => this.datePipe.transform(d.NGAY_TIEP_NHAN, 'dd/MM'));
    const totalSeries = sortedData.map(d => d.TONG_LUOT_TIEP_NHAN || 0);
    const newSeries = sortedData.map(d => d.BENH_MOI || 0);
    const oldSeries = sortedData.map(d => d.BENH_CU || 0);

    this.trendChartOptions = {
      tooltip: {
        trigger: 'axis',
        backgroundColor: 'rgba(255, 255, 255, 0.95)',
        borderColor: '#E2E8F0',
        textStyle: { color: '#1E293B' }
      },
      legend: { data: ['Tổng', 'Bệnh Mới', 'Bệnh Cũ'], bottom: 0, icon: 'circle' },
      grid: { left: '2%', right: '3%', bottom: '10%', top: '5%', containLabel: true },
      xAxis: {
        type: 'category',
        boundaryGap: false,
        data: dates,
        axisLine: { show: false },
        axisTick: { show: false }
      },
      yAxis: { type: 'value', splitLine: { lineStyle: { type: 'dashed', color: '#E2E8F0' } } },
      series: [
        {
          name: 'Tổng', 
          type: 'line', 
          smooth: true, 
          showSymbol: false, 
          data: totalSeries,
          itemStyle: { color: '#00839B' }
          // Removed areaStyle here to remove the gradient
        },
        {
          name: 'Bệnh Mới', type: 'line', smooth: true, showSymbol: false, data: newSeries,
          itemStyle: { color: '#16A34A' }
        },
        {
          name: 'Bệnh Cũ', type: 'line', smooth: true, showSymbol: false, data: oldSeries,
          itemStyle: { color: '#64748B' }, lineStyle: { type: 'dashed' }
        }
      ]
    };

    const totals = sortedData.reduce((acc, cur) => ({
      bhyt: acc.bhyt + (cur.BHYT || 0),
      service: acc.service + (cur.VIEN_PHI || 0),
      emergency: acc.emergency + (cur.LUOT_CC || 0),
      inpatient: acc.inpatient + (cur.LUOT_NT || 0),
      daycare: acc.daycare + (cur.LUOT_DNT || 0),
      clinic: acc.clinic + (cur.LUOT_KHAM_CK || 0)
    }), { bhyt: 0, service: 0, emergency: 0, inpatient: 0, daycare: 0, clinic: 0 });

    this.typeChartOptions = {
      tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
      legend: { orient: 'horizontal', bottom: 0, icon: 'circle' },
      series: [{
        name: 'Đối tượng',
        type: 'pie',
        radius: ['45%', '70%'],
        center: ['50%', '45%'],
        avoidLabelOverlap: false,
        itemStyle: { borderRadius: 5, borderColor: '#fff', borderWidth: 2 },
        label: { show: false, position: 'center' },
        emphasis: { label: { show: true, fontSize: 18, fontWeight: 'bold' } },
        data: [
          { value: totals.bhyt, name: 'BHYT', itemStyle: { color: '#006E96' } },
          { value: totals.service, name: 'Viện Phí', itemStyle: { color: '#F59E0B' } }
        ]
      }]
    };

    this.admissionChartOptions = {
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
      xAxis: { type: 'category', data: ['Phòng Khám', 'Cấp Cứu', 'Nội Trú', 'DNT'] },
      yAxis: { type: 'value', splitLine: { lineStyle: { type: 'dashed', color: '#E2E8F0' } } },
      series: [{
        name: 'Lượt',
        type: 'bar',
        barWidth: '40%',
        itemStyle: { borderRadius: [4, 4, 0, 0] },
        data: [
          { value: totals.clinic, itemStyle: { color: '#00839B' } },
          { value: totals.emergency, itemStyle: { color: '#FFB3BA' } },
          { value: totals.inpatient, itemStyle: { color: '#F59E0B' } },
          { value: totals.daycare, itemStyle: { color: '#52C3D7' } }
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

  public onExport(): void {
    this.toastService.showInfo('Tính năng xuất Excel đang được phát triển.');
  }
}