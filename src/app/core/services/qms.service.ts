import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface QueueItem {
  STT: string;
  DOI_TUONG: string;
  MA_YTE: string;
  TEN_BENH_NHAN: string;
  NAM_SINH: number;
  MA_PHONG_BAN: string;
  PHONG_BAN: string;
  QMS_PHONG_KHAM: any;
  COMPUTER_NAME: any;
  QUEUE_NAME: string;
  SCREEN_ID: number;
  SEQUENCE: number;
  STATE: number;
  PRIORITY: number;
  PREVIOUS: number;
  CREATEDATE: string;
  CREATEDATE1: string;
  ESTIMATETIME: string;
  PROCESSTIME: any;
  FINISHTIME: any;
  SOLANGOI: any;
  DVYEUCAU_ID: number;
}

export interface PagedResult<T> {
  Items: T[];
  TotalCount: number;
}

@Injectable({
  providedIn: 'root',
})
export class QmsService {
  private http = inject(HttpClient);
  private apiUrl = environment.apiUrl; // Assuming environment.apiUrl exists

  constructor() {}

  getDanhSachSTT(
    fromDate: string,
    toDate: string,
    queueId: number = 1,
    phongBan: number = 1,
    textSearch: string = '',
    pageNumber: number = 1,
    pageSize: number = 20
  ): Observable<PagedResult<QueueItem>> {
    let params = new HttpParams()
      .set('TuNgay', fromDate)
      .set('DenNgay', toDate)
      .set('Queue', queueId.toString())
      .set('PhongBan', phongBan.toString())
      .set('TextSearch', textSearch)
      .set('PageNumber', pageNumber.toString())
      .set('PageSize', pageSize.toString());

    return this.http.get<PagedResult<QueueItem>>(
      `${this.apiUrl}/QMS/DanhSachSTT`,
      {
        params,
      }
    );
  }
}
