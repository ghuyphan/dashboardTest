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
  STATE_NAME: string;
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

export interface QueueInfo {
  SCREEN_ID: number;
  NAME: string;
}

@Injectable({
  providedIn: 'root',
})
export class QmsService {
  private http = inject(HttpClient);
  private apiUrl = environment.apiUrl;

  constructor() {}

  getQueues(): Observable<QueueInfo[]> {
    return this.http.get<QueueInfo[]>(environment.qmsQueueUrl);
  }

  getDanhSachSTT(
    fromDate: string,
    toDate: string,
    queueId: number = 1,
    textSearch: string = '',
    pageNumber: number = 1,
    pageSize: number = 20
  ): Observable<PagedResult<QueueItem>> {
    const body = {
      TuNgay: fromDate,
      DenNgay: toDate,
      Queue: queueId,
      dieuKien: textSearch || '',
      PageNumber: pageNumber,
      PageSize: pageSize,
    };

    return this.http.post<PagedResult<QueueItem>>(environment.qmsListUrl, body);
  }
}
