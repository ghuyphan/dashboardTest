import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { map, shareReplay, catchError } from 'rxjs/operators';
import { environment } from '../../../environments/environment.development';

export interface DropdownOption {
  key: string | number;
  value: string;
}

interface ApiDeviceType {
  Id: number;
  TenThietBi: string;
}

interface ApiDeviceStatus {
  ID: number;
  TEN: string;
}

@Injectable({
  providedIn: 'root'
})
export class DropdownDataService {
  
  private readonly http = inject(HttpClient);

  private deviceTypes$: Observable<DropdownOption[]> | null = null;
  private deviceStatusesCache = new Map<number, Observable<DropdownOption[]>>();

  getDeviceTypes(): Observable<DropdownOption[]> {
    if (this.deviceTypes$) {
      return this.deviceTypes$;
    }

    const url = environment.deviceListUrl;

    this.deviceTypes$ = this.http.get<ApiDeviceType[]>(url).pipe(
      map(items => items.map(item => ({
        key: item.Id,
        value: item.TenThietBi
      }))),
      shareReplay(1),
      catchError(err => {
        // Clear cache on error so retry is possible
        this.deviceTypes$ = null;
        return this.handleError('Device Types', err);
      })
    );

    return this.deviceTypes$;
  }

  getDeviceStatuses(groupId = 1105): Observable<DropdownOption[]> {
    if (this.deviceStatusesCache.has(groupId)) {
      return this.deviceStatusesCache.get(groupId)!;
    }

    const url = `${environment.statusListUrl}/${groupId}`;

    const statusObs$ = this.http.get<ApiDeviceStatus[]>(url).pipe(
      map(items => items.map(item => ({
        key: item.ID,
        value: item.TEN
      }))),
      shareReplay(1),
      catchError(err => {
        // CRITICAL FIX: Remove from cache map if error occurs
        this.deviceStatusesCache.delete(groupId);
        return this.handleError(`Device Statuses (Group ${groupId})`, err);
      })
    );

    this.deviceStatusesCache.set(groupId, statusObs$);
    return statusObs$;
  }

  clearCache(): void {
    this.deviceTypes$ = null;
    this.deviceStatusesCache.clear();
  }

  private handleError(context: string, error: HttpErrorResponse) {
    console.error(`Error fetching ${context}:`);
    return of([]); 
  }
}