import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Subscription } from 'rxjs';

// --- CHANGED ---
// Now importing from the new reusable-table component
import {
  ReusableTableComponent, // <-- Changed from ReusableGridComponent
  GridColumn,
  SortChangedEvent,
  SortDirection,
} from '../components/reusable-table/reusable-table.component';
// --- END CHANGE ---

import { FooterActionService } from '../services/footer-action.service';
import { FooterAction } from '../models/footer-action.model';
import { SearchService } from '../services/search.service';
import { environment } from '../../environments/environment.development';

@Component({
  selector: 'app-device-list',
  standalone: true,
  // --- CHANGED ---
  imports: [CommonModule, ReusableTableComponent], // <-- Changed from ReusableGridComponent
  // --- END CHANGE ---
  templateUrl: './device-list.component.html',
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

  // --- SIMPLIFIED: Only one master list ---
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
      // No need to call updateDisplayData()!
    });
  }

  ngOnDestroy(): void {
    this.footerService.clearActions();
    this.deviceSub?.unsubscribe();
    this.searchSub?.unsubscribe();
  }

  private loadDevices(): void {
    this.isLoading = true;
    const url = environment.equipmentCatUrl;

    this.deviceSub = this.http.get<any[]>(url).subscribe({
      next: (data) => {
        this.allDeviceData = data; // Set the master list
        // No need to call updateDisplayData()!
        this.isLoading = false;
        console.log('Devices loaded:', data);
      },
      error: (err) => {
        console.error('Failed to load devices:', err);
        this.isLoading = false;
      },
    });
  }

  /**
   * The grid now handles sorting internally. We can just log this.
   */
  public onSortChanged(sortEvent: SortChangedEvent): void {
    console.log('Sort Changed (Handled by Table):', sortEvent);
  }

  /**
   * --- REMOVED: updateDisplayData() ---
   * MatTableDataSource in the reusable table now handles all
   * filtering and sorting.
   */

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