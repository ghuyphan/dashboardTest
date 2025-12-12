import { Component, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule, DatePipe, DecimalPipe } from '@angular/common';
import { Observable } from 'rxjs';

import { BaseClsReportComponent } from '../../../shared/components/base-cls-report/base-cls-report.component';
import { ClsStat } from '../../../shared/models/cls-stat.model';
import { ChartCardComponent } from '../../../shared/components/chart-card/chart-card.component';
import { DateFilterComponent } from '../../../shared/components/date-filter/date-filter.component';
import { TableCardComponent } from '../../../shared/components/table-card/table-card.component';
import { WidgetCardComponent } from '../../../shared/components/widget-card/widget-card.component';

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
export class ClsLevel6ReportComponent
  extends BaseClsReportComponent
  implements OnInit
{
  ngOnInit(): void {
    this.init();
  }

  protected getReportData(
    fromDate: string,
    toDate: string
  ): Observable<ClsStat[]> {
    return this.reportService.getClsLevel6Report(fromDate, toDate);
  }

  protected getExportFileName(): string {
    return `BaoCao_CLS_Tang6_${this.fromDate}_${this.toDate}`;
  }
}
