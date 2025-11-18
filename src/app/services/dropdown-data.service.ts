import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, of, throwError } from 'rxjs';
import { map, shareReplay, tap, catchError } from 'rxjs/operators';
import { environment } from '../../environments/environment.development';

// --- Interfaces ---

// The target format for your Dynamic Form
export interface DropdownOption {
  key: string | number;
  value: string;
}

// Raw API shapes (matches your backend exactly)
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

  // --- Caching ---
  private deviceTypes$: Observable<DropdownOption[]> | null = null;
  private deviceStatuses$: Observable<DropdownOption[]> | null = null;

  /**
   * Gets the list of device types.
   * Caches the result until clearCache() is called.
   */
  getDeviceTypes(): Observable<DropdownOption[]> {
    if (this.deviceTypes$) {
      return this.deviceTypes$;
    }

    const url = environment.deviceListUrl;

    this.deviceTypes$ = this.http.get<ApiDeviceType[]>(url).pipe(
      map(items => items.map(item => ({
        key: item.Id,           // Maps "Id" -> key
        value: item.TenThietBi  // Maps "TenThietBi" -> value
      }))),
      shareReplay(1),
      catchError(err => this.handleError('Device Types', err))
    );

    return this.deviceTypes$;
  }

  /**
   * Gets the list of device statuses.
   * @param groupId The status group ID (defaults to 1105 as per your requirement)
   */
  getDeviceStatuses(groupId = 1105): Observable<DropdownOption[]> {
    // If we need to support different groupIds, we might need a Map<id, Observable> 
    // instead of a single variable. For now, assuming singleton usage:
    if (this.deviceStatuses$) {
      return this.deviceStatuses$;
    }

    const url = `${environment.statusListUrl}/${groupId}`;

    this.deviceStatuses$ = this.http.get<ApiDeviceStatus[]>(url).pipe(
      map(items => items.map(item => ({
        key: item.ID,  // Maps "ID" -> key
        value: item.TEN // Maps "TEN" -> value
      }))),
      shareReplay(1),
      catchError(err => this.handleError('Device Statuses', err))
    );

    return this.deviceStatuses$;
  }

  /**
   * Clears the cache. Call this if you add/edit items and need fresh data.
   */
  clearCache(): void {
    this.deviceTypes$ = null;
    this.deviceStatuses$ = null;
  }

  /**
   * Centralized error handling
   */
  private handleError(context: string, error: HttpErrorResponse) {
    console.error(`Error fetching ${context}:`, error);
    // Return an empty array so the UI doesn't break, or re-throw if you want to show a toast
    return of([]); 
  }
}