import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment.development';
import { ExaminationStat } from '../../shared/models/examination-stat.model';
import { ClsLevel6Stat, ClsLevel3Stat } from '../../shared/models/cls-stat.model';
import { SpecialtyClsStat } from '../../shared/models/specialty-cls-stat.model';
import { EmergencyStat } from '../../shared/models/emergency-stat';
import { SurgeryStat } from '../models/surgery-stat.model';
import { DetailedExaminationStat } from '../../shared/models/detailed-examination-stat.model';
import {
  MedicalRecordSummary,
  MedicalRecordDetail,
} from '../../shared/models/medical-record-stat.model';

@Injectable({
  providedIn: 'root',
})
export class ReportService {
  private http = inject(HttpClient);
  private apiUrl = environment.examinationOvUrl;
  private summaryUrl = environment.outpatientSumUrl;
  private detailUrl = environment.outpatientDetailUrl;
  private clsLevel6Url = environment.clsLevel6Url;
  private clsLevel3Url = environment.clsLevel3Url;
  private specialtyClsUrl = environment.specialtyClsUrl;
  private emergencyUrl = environment.emergencyUrl;
  private surgeryUrl = environment.surgeryUrl;
  private detailedExamUrl = environment.detailedExaminationUrl;

  constructor() {}

  getExaminationOverview(
    fromDate: string,
    toDate: string
  ): Observable<ExaminationStat[]> {
    const params = new HttpParams()
      .set('TuNgay', fromDate)
      .set('DenNgay', toDate);

    return this.http.get<ExaminationStat[]>(this.apiUrl, { params });
  }

  getMedicalRecordStatusSummary(
    fromDate: string,
    toDate: string
  ): Observable<MedicalRecordSummary[]> {
    const params = new HttpParams()
      .set('TuNgay', fromDate)
      .set('DenNgay', toDate);

    // Note: Update 'this.summaryUrl' with environment variable when you create it
    return this.http.get<MedicalRecordSummary[]>(this.summaryUrl, { params });
  }

  getMedicalRecordStatusDetail(
    fromDate: string,
    toDate: string
  ): Observable<MedicalRecordDetail[]> {
    const params = new HttpParams()
      .set('TuNgay', fromDate)
      .set('DenNgay', toDate);

    // Note: Update 'this.detailUrl' with environment variable when you create it
    return this.http.get<MedicalRecordDetail[]>(this.detailUrl, { params });
  }

  getClsLevel3Report(
    fromDate: string,
    toDate: string
  ): Observable<ClsLevel3Stat[]> {
    const params = new HttpParams()
      .set('TuNgay', fromDate)
      .set('DenNgay', toDate);

    return this.http.get<ClsLevel3Stat[]>(this.clsLevel3Url, { params });
  }

  getClsLevel6Report(
    fromDate: string,
    toDate: string
  ): Observable<ClsLevel6Stat[]> {
    const params = new HttpParams()
      .set('TuNgay', fromDate)
      .set('DenNgay', toDate);

    return this.http.get<ClsLevel6Stat[]>(this.clsLevel6Url, { params });
  }

  getSpecialtyClsReport(
    fromDate: string,
    toDate: string
  ): Observable<SpecialtyClsStat[]> {
    const params = new HttpParams()
      .set('TuNgay', fromDate)
      .set('DenNgay', toDate);

    return this.http.get<SpecialtyClsStat[]>(this.specialtyClsUrl, { params });
  }

  /**
   * Get Emergency Summary Report
   */
  getEmergencySummary(fromDate: string, toDate: string): Observable<EmergencyStat[]> {
    const params = new HttpParams()
      .set('TuNgay', fromDate)
      .set('DenNgay', toDate);
      
    return this.http.get<EmergencyStat[]>(this.emergencyUrl, { params });
  }
  
  getSurgeryReport(fromDate: string, toDate: string): Observable<SurgeryStat[]> {
    const params = new HttpParams()
      .set('TuNgay', fromDate)
      .set('DenNgay', toDate);

    return this.http.get<SurgeryStat[]>(this.surgeryUrl, { params });
  }

  getDetailedExaminationReport(fromDate: string, toDate: string): Observable<DetailedExaminationStat[]> {
    const params = new HttpParams()
      .set('TuNgay', fromDate)
      .set('DenNgay', toDate);

    return this.http.get<DetailedExaminationStat[]>(this.detailedExamUrl, { params });
  }
}

