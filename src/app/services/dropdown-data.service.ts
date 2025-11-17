import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { map, shareReplay, tap } from 'rxjs/operators';
import { environment } from '../../environments/environment.development';

// The target format our forms will use
export interface DropdownOption {
  key: any; // Can be string or number
  value: string;
}

@Injectable({
  providedIn: 'root'
})
export class DropdownDataService {

  // --- Caches ---
  // We use shareReplay to "cache" the result of the observable
  private deviceTypes$: Observable<DropdownOption[]> | null = null;
  private deviceStatuses$: Observable<DropdownOption[]> | null = null;

  constructor(private http: HttpClient) { }

  /**
   * Gets the list of device types.
   * Will fetch from API on first call, then return cached result.
   */
  getDeviceTypes(): Observable<DropdownOption[]> {
    if (this.deviceTypes$) {
      return this.deviceTypes$;
    }

    // --- Using your environment variable ---
    const typesUrl = environment.deviceListUrl; 
    
    this.deviceTypes$ = this.http.get<any[]>(typesUrl).pipe(
      map(types => [
        { key: null, value: '-- Chọn loại --' },
        ...types.map(type => ({
          key: type.Id, // Matches { "Id": 10.0, ... }
          value: type.TenThietBi // Matches { "TenThietBi": "Laptop", ... }
        }))
      ]),
      shareReplay(1) // <-- Cache the result and share with all subscribers
    );

    return this.deviceTypes$;
  }

  /**
   * Gets the list of device statuses.
   * Will fetch from API on first call, then return cached result.
   */
  getDeviceStatuses(): Observable<DropdownOption[]> {
    if (this.deviceStatuses$) {
      return this.deviceStatuses$;
    }

    // --- Using your environment variable ---
    const statusUrl = environment.statusListUrl + '/1105'; 
    
    this.deviceStatuses$ = this.http.get<any[]>(statusUrl).pipe(
      map(statuses =>
        statuses.map(status => ({
          // --- *** IMPORTANT CORRECTION *** ---
          // We must use the ID as the key so the form saves "TrangThai": 1111
          key: status.ID, // <-- CORRECTED: Was status.TEN in your version
          value: status.TEN // Matches { "TEN": "Sẵn sàng", ... }
        }))
      ),
      shareReplay(1) // <-- Cache the result
    );

    return this.deviceStatuses$;
  }
}