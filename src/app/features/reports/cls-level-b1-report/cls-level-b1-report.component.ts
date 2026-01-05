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
  selector: 'app-cls-level-b1-report',
  standalone: true,
  imports: [
    CommonModule,
    ChartCardComponent,
    TableCardComponent,
    DateFilterComponent,
    WidgetCardComponent,
  ],
  providers: [DatePipe, DecimalPipe],
  templateUrl: './cls-level-b1-report.component.html',
  styleUrl: './cls-level-b1-report.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ClsLevelB1ReportComponent
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
    return this.reportService.getClsLevelB1Report(fromDate, toDate);
  }

  protected getExportFileName(): string {
    return `BaoCao_CLS_TangB1_${this.fromDate}_${this.toDate}`;
  }
}
