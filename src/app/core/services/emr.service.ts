import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

@Injectable({
  providedIn: 'root',
})
export class EmrService {
  private http = inject(HttpClient);

  constructor() {}

  getEmrAdmissions(
    fromDate: string,
    toDate: string,
    patientId: string
  ): Observable<any[]> {
    const body = {
      TuNgay: fromDate,
      DenNgay: toDate,
      TextSearch: patientId,
    };
    return this.http.post<any[]>(environment.emrExportUrl, body);
  }

  getEmrSignedFiles(tiepNhanId: string | number): Observable<any[]> {
    const body = {
      TiepNhan_Id: String(tiepNhanId),
    };
    return this.http.post<any[]>(environment.emrDetailUrl, body);
  }
}
