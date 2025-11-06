import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Subscription } from 'rxjs';

import {
  ReusableGridComponent,
  GridColumn,
  SortChangedEvent,
  SortDirection
} from '../components/reusable-grid/reusable-grid.component';

import { FooterActionService } from '../services/footer-action.service';
import { FooterAction } from '../models/footer-action.model';

// --- 1. IMPORT THE NEW SEARCH SERVICE ---
import { SearchService } from '../services/search.service';

import { environment } from '../../environments/environment.development';

@Component({
  selector: 'app-device-list',
  standalone: true,
  imports: [CommonModule, ReusableGridComponent],
  templateUrl: 'device-list.component.html',
  styleUrl: './device-list.component.scss',
})
export class DeviceListComponent implements OnInit, OnDestroy {
  // --- Grid Properties ---
  public deviceColumns: GridColumn[] = [
    { key: 'MaThietBi', label: 'Mã Thiết Bị', sortable: true },
    { key: 'TenThietBi', label: 'Tên Thiết Bị', sortable: true },
    { key: 'TrangThai_Ten', label: 'Trạng Thái', sortable: true },
    { key: 'Model', label: 'Model', sortable: true },
    { key: 'SerialNumber', label: 'Serial Number', sortable: true },
    { key: 'ViTri', label: 'Vị Trí', sortable: true },
    { key: 'LoaiThietBi_Id', label: 'Mã Loại TB', sortable: true },
    { key: 'NguoiTao', label: 'Người Tạo', sortable: true },
    { key: 'NgayTao', label: 'Ngày Tạo', sortable: true },
  ];

  // --- 2. Create two lists: one master, one for display ---
  public allDeviceData: any[] = []; // Master list from API
  public filteredDeviceData: any[] = []; // List to display in the grid
  public selectedDevice: any | null = null;

  public isLoading: boolean = false;
  private deviceSub: Subscription | null = null;
  // --- 3. Add subscription for search ---
  private searchSub: Subscription | null = null;

  // --- 4. Add properties to track current state ---
  private currentSearchTerm: string = '';
  private currentSort: { key: string; direction: SortDirection | '' } = { key: '', direction: '' };

  constructor(
    private footerService: FooterActionService,
    private http: HttpClient,
    private searchService: SearchService // --- 5. INJECT THE SERVICE ---
  ) { }

  ngOnInit(): void {
    this.loadDevices();
    this.updateFooterActions();

    // --- 6. Subscribe to search term changes ---
    this.searchSub = this.searchService.searchTerm$.subscribe(term => {
      this.currentSearchTerm = term.toLowerCase();
      this.updateDisplayData();
    });
  }

  ngOnDestroy(): void {
    this.footerService.clearActions();
    this.deviceSub?.unsubscribe();
    this.searchSub?.unsubscribe(); // --- 7. Unsubscribe ---
  }

  private loadDevices(): void {
    this.isLoading = true;
    const url = environment.equipmentCatUrl;

    this.deviceSub = this.http.get<any[]>(url).subscribe({
      next: (data) => {
        this.allDeviceData = data; // Set the master list
        this.updateDisplayData(); // Update the display list
        this.isLoading = false;
        console.log('Devices loaded:', data);
      },
      error: (err) => {
        console.error('Failed to load devices:', err);
        this.isLoading = false;
      },
    });
  }

  // --- 8. onSortChanged now just updates state and calls updateDisplayData ---
  public onSortChanged(sortEvent: SortChangedEvent): void {
    this.currentSort = sortEvent;
    this.updateDisplayData();
  }

  /**
   * --- 9. NEW METHOD ---
   * This central method applies filtering and sorting to the master list
   * to generate the list for display.
   */
  private updateDisplayData(): void {
    // Start with the full list
    let data = [...this.allDeviceData];

    // 1. Apply Filter
    if (this.currentSearchTerm) {
      data = data.filter(device =>
        // Add any fields you want to search here
        (device.MaThietBi && device.MaThietBi.toLowerCase().includes(this.currentSearchTerm)) ||
        (device.TenThietBi && device.TenThietBi.toLowerCase().includes(this.currentSearchTerm)) ||
        (device.SerialNumber && device.SerialNumber.toLowerCase().includes(this.currentSearchTerm))
      );
    }

    // 2. Apply Sort
    const { key, direction } = this.currentSort;
    if (key && direction) {
      data.sort((a, b) => {
        if (key === 'NgayTao') {
          const dateA = new Date(a[key]).getTime();
          const dateB = new Date(b[key]).getTime();
          return direction === 'asc' ? dateA - dateB : dateB - dateA;
        }

        // Handle potentially null/undefined values
        const valA = a[key] ?? '';
        const valB = b[key] ?? '';

        if (valA < valB) {
          return direction === 'asc' ? -1 : 1;
        }
        if (valA > valB) {
          return direction === 'asc' ? 1 : -1;
        }
        return 0;
      });
    }

    // 3. Set the final list for the grid
    this.filteredDeviceData = data;
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
      }
    ];

    this.footerService.setActions(actions);
  }

  private onCreate(): void {
    console.log('Create action triggered');
  }

  private onModify(): void {
    if (!this.selectedDevice) return;
    console.log('Modify action triggered for:', this.selectedDevice.TenThietBi);
  }

  private onSave(): void {
    if (!this.selectedDevice) return;
    console.log('Save action triggered for:', this.selectedDevice.TenThietBi);
  }

  private onPrint(): void {
    console.log('Print action triggered');
  }
}