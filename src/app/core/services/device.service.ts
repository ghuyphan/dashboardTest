import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { environment } from '../../../environments/environment.development';
import { Device } from '../../shared/models/device.model';
import { DateUtils } from '../../shared/utils/date.utils';

export interface PagedResult<T> {
  Items: T[];
  TotalCount: number;
}

export interface DeviceQueryParams {
  pageNumber: number;
  pageSize: number;
  sortColumn: string;
  sortDirection: string;
  textSearch?: string;
}

@Injectable({
  providedIn: 'root',
})
export class DeviceService {
  private http = inject(HttpClient);
  private baseUrl = environment.equipmentCatUrl;

  constructor() {}

  /**
   * Gets a paged list of devices, optionally searching by text.
   * Corresponds to logic in DeviceListComponent.
   */
  getDevicesPaged(
    queryParams: DeviceQueryParams
  ): Observable<PagedResult<Device>> {
    const { pageNumber, pageSize, sortColumn, sortDirection, textSearch } =
      queryParams;

    let params = new HttpParams()
      .set('PageNumber', pageNumber.toString())
      .set('PageSize', pageSize.toString())
      .set('sortColumn', sortColumn)
      .set('sortDirection', sortDirection);

    if (textSearch) {
      params = params.set('TextSearch', textSearch);
    }

    // Determine URL based on whether search is present (matching existing logic)
    const url = textSearch
      ? `${this.baseUrl}/page/search`
      : `${this.baseUrl}/page`;

    return this.http.get<PagedResult<Device>>(url, { params }).pipe(
      map(response => ({
        ...response,
        Items: response.Items.map(d => this.formatDeviceDates(d)),
      }))
    );
  }

  /**
   * Gets ALL devices (for Dashboard statistics).
   * Corresponds to logic in DeviceDashboardComponent.
   */
  getAllDevices(): Observable<Device[]> {
    return this.http.get<Device[]>(this.baseUrl).pipe(
      // Optional: You might want to format dates here too if the dashboard needs them formatted
      map(devices => devices.map(d => this.formatDeviceDates(d)))
    );
  }

  /**
   * Gets a single device by ID.
   * Corresponds to logic in DeviceDetailComponent and DeviceFormComponent.
   */
  getDeviceById(id: number | string): Observable<Device> {
    const url = `${this.baseUrl}/${id}`;
    return this.http.get<Device[]>(url).pipe(
      map(dataArray => {
        if (dataArray && dataArray.length > 0) {
          return this.formatDeviceDates(dataArray[0]);
        }
        throw new Error('Không tìm thấy thiết bị.');
      })
    );
  }

  /**
   * Creates a new device.
   * Corresponds to logic in DeviceFormComponent.
   */
  createDevice(device: Partial<Device>): Observable<any> {
    return this.http.post(this.baseUrl, device);
  }

  /**
   * Updates an existing device.
   * Corresponds to logic in DeviceFormComponent.
   */
  updateDevice(id: number | string, device: Partial<Device>): Observable<any> {
    return this.http.put(`${this.baseUrl}/${id}`, device);
  }

  /**
   * Deletes a device.
   * Corresponds to logic in DeviceListComponent and DeviceDetailComponent.
   */
  deleteDevice(id: number | string): Observable<any> {
    return this.http.delete(`${this.baseUrl}/${id}`);
  }

  // --- Helper ---
  private formatDeviceDates(device: Device): Device {
    return {
      ...device,
      NgayTao: DateUtils.formatToDisplay(device.NgayTao),
      NgayMua: DateUtils.formatToDisplay(device.NgayMua),
      NgayHetHanBH: DateUtils.formatToDisplay(device.NgayHetHanBH),
    };
  }
}
