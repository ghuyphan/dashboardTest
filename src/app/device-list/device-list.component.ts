import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Subscription } from 'rxjs';

import {
  ReusableTableComponent,
  GridColumn,
  SortChangedEvent,
} from '../components/reusable-table/reusable-table.component'; // No SortDirection needed here

import { FooterActionService } from '../services/footer-action.service';
import { FooterAction } from '../models/footer-action.model';
import { SearchService } from '../services/search.service';
import { environment } from '../../environments/environment.development';

@Component({
  selector: 'app-device-list',
  standalone: true,
  imports: [CommonModule, ReusableTableComponent],
  templateUrl: './device-list.component.html',
  styleUrl: './device-list.component.scss',
})
export class DeviceListComponent implements OnInit, OnDestroy {
  // --- 1. Grid Properties UPDATED ---
  public deviceColumns: GridColumn[] = [
    { key: 'Id', label: 'ID', sortable: true },
    { key: 'Ma', label: 'Mã', sortable: true },
    { key: 'Ten', label: 'Tên', sortable: true },
    { key: 'MaLoaiThietBi', label: 'Mã Thiết Bị', sortable: true },
    { key: 'TenLoaiThietBi', label: 'Tên Thiết Bị', sortable: true },
    { key: 'DeviceName', label: 'Device Name', sortable: true },
    { key: 'Model', label: 'Model', sortable: true },
    { key: 'SerialNumber', label: 'Serial Number', sortable: true },
    { key: 'ViTri', label: 'Vị Trí', sortable: true },
    // { key: 'TrangThai_Id', label: 'ID Trạng Thái', sortable: true },
    { key: 'TrangThai_Ten', label: 'Trạng Thái', sortable: true },
    { key: 'LoaiThietBi_Id', label: 'ID Loại TB', sortable: true },
    // { key: 'NguoiTao_Id', label: 'ID Người Tạo', sortable: true },
    { key: 'NguoiTao', label: 'Người Tạo', sortable: true },
    { key: 'NgayTao', label: 'Ngày Tạo', sortable: true }, // Will be formatted to dd/mm/yyyy
    // { key: 'HL', label: 'HL', sortable: true },
  ];

  // --- Only one master list ---
  public allDeviceData: any[] = []; // Master list from API
  public selectedDevice: any | null = null;
  public isLoading: boolean = false;

  private deviceSub: Subscription | null = null;
  private searchSub: Subscription | null = null;

  // --- We just need to store the search term to pass to the grid ---
  public currentSearchTerm: string = '';

  constructor(
    private footerService: FooterActionService,
    private http: HttpClient,
    private searchService: SearchService
  ) {}

  ngOnInit(): void {
    this.loadDevices();
    this.updateFooterActions();

    // --- Subscribe to search term and just store it ---
    this.searchSub = this.searchService.searchTerm$.subscribe((term) => {
      this.currentSearchTerm = term;
      // The reusable-table handles filtering now
    });
  }

  ngOnDestroy(): void {
    this.footerService.clearActions();
    this.deviceSub?.unsubscribe();
    this.searchSub?.unsubscribe();
  }

  // --- 2. Helper function to format date ---
  /**
   * Formats an ISO date string (or any valid Date input) to "dd/mm/yyyy".
   * @param dateString The date string to format.
   * @returns The formatted date or an empty string if input is invalid.
   */
  private formatDate(dateString: string): string {
    if (!dateString) {
      return '';
    }
    try {
      const date = new Date(dateString);
      // Ghetto-guard against invalid dates
      if (isNaN(date.getTime())) {
        return '';
      }
      const day = date.getDate().toString().padStart(2, '0');
      const month = (date.getMonth() + 1).toString().padStart(2, '0'); // Month is 0-indexed
      const year = date.getFullYear();
      return `${day}/${month}/${year}`;
    } catch (error) {
      console.error('Error formatting date:', dateString, error);
      return dateString; // return original string on error
    }
  }

  // --- 3. loadDevices() MODIFIED to format the date ---
  private loadDevices(): void {
    this.isLoading = true;
    const url = environment.equipmentCatUrl;

    this.deviceSub = this.http.get<any[]>(url).subscribe({
      next: (data) => {
        // Map the data to format the 'NgayTao' field
        const formattedData = data.map(device => ({
          ...device,
          NgayTao: this.formatDate(device.NgayTao)
        }));

        this.allDeviceData = formattedData; // Set the master list with formatted data
        this.isLoading = false;
        console.log('Devices loaded and formatted:', formattedData);
      },
      error: (err) => {
        console.error('Failed to load devices:', err);
        this.isLoading = false;
      },
    });
  }

  /**
   * The grid now handles sorting internally via MatSort.
   * We just pass this event up if needed, but no internal logic required.
   */
  public onSortChanged(sortEvent: SortChangedEvent): void {
    console.log('Sort Changed (Handled by Table):', sortEvent);
  }

  public onDeviceSelected(device: any): void {
    this.selectedDevice = device;
    console.log('Selected device:', this.selectedDevice);
    this.updateFooterActions();
  }

  private updateFooterActions(): void {
    const isRowSelected = this.selectedDevice !== null;

    const actions: FooterAction[] = [
      {
        label: 'Tạo mới',
        icon: 'fas fa-plus',
        action: () => this.onCreate(),
        permission: 'QLThietBi.DMThietBi.RCREATE',
        className: 'btn-primary',
      },
      {
        label: 'Sửa',
        icon: 'fas fa-pencil-alt',
        action: () => this.onModify(),
        permission: 'QLThietBi.DMThietBi.RMODIFY',
        className: 'btn-secondary',
        disabled: !isRowSelected,
      },
    ];

    this.footerService.setActions(actions);
  }

  // --- Action methods (unchanged) ---
  private onCreate(): void {
    console.log('Create action triggered');
  }

  private onModify(): void {
    if (!this.selectedDevice) return;
    console.log('Modify action triggered for:', this.selectedDevice.TenThietBi);
  }
}