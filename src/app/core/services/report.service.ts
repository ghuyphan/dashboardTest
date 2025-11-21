import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment.development';
import { ExaminationStat } from '../../shared/models/examination-stat.model';

@Injectable({
  providedIn: 'root'
})
export class ReportService {
  private http = inject(HttpClient);
  private apiUrl = environment.examinationOvUrl;

  constructor() { }

  getExaminationOverview(fromDate: string, toDate: string): Observable<ExaminationStat[]> {
    const params = new HttpParams()
      .set('TuNgay', fromDate)
      .set('DenNgay', toDate);

    return this.http.get<ExaminationStat[]>(this.apiUrl, { params });
  }
}