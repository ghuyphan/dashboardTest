import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Subscription } from 'rxjs';

// Import your reusable grid and new types
import {
  ReusableGridComponent,
  GridColumn,
  SortChangedEvent,
} from '../components/reusable-grid/reusable-grid.component';

// IMPORT THE FOOTER SERVICE AND MODEL
import { FooterActionService } from '../services/footer-action.service';
import { FooterAction } from '../models/footer-action.model';

// IMPORT THE ENVIRONMENT
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
  // === MODIFIED: Translated labels to Vietnamese ===
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

  public deviceData: any[] = [];
  public selectedDevice: any | null = null;

  // --- NEW: Loading and Subscription Management ---
  public isLoading: boolean = false;
  private deviceSub: Subscription | null = null;

  constructor(
    private footerService: FooterActionService,
    private http: HttpClient // <-- Inject HttpClient
  ) {}

  ngOnInit(): void {
    this.loadDevices(); // <-- Call the API
    this.updateFooterActions();
  }

  ngOnDestroy(): void {
    this.footerService.clearActions();
    this.deviceSub?.unsubscribe(); // <-- Unsubscribe
  }

  // --- Method to fetch data from the API ---
  private loadDevices(): void {
    this.isLoading = true;
    const url = environment.equipmentCatUrl; // Get URL from environment

    this.deviceSub = this.http.get<any[]>(url).subscribe({
      next: (data) => {
        this.deviceData = data;
        this.isLoading = false;
        console.log('Devices loaded:', data);
      },
      error: (err) => {
        console.error('Failed to load devices:', err);
        this.isLoading = false;
      },
    });
  }

  // --- Method to handle sorting from the grid ---
  public onSortChanged(sortEvent: SortChangedEvent): void {
    const { key, direction } = sortEvent;

    this.deviceData.sort((a, b) => {
      // Special handling for date sorting
      if (key === 'NgayTao') {
        const dateA = new Date(a[key]).getTime();
        const dateB = new Date(b[key]).getTime();
        return direction === 'asc' ? dateA - dateB : dateB - dateA;
      }

      // Standard string/number sort
      if (a[key] < b[key]) {
        return direction === 'asc' ? -1 : 1;
      }
      if (a[key] > b[key]) {
        return direction === 'asc' ? 1 : -1;
      }
      return 0;
    });

    // Create a new array copy to trigger Angular's change detection
    this.deviceData = [...this.deviceData];
  }

  /**
   * Called from the grid component when a row is clicked.
   * @param device The device object from the selected row
   */
  public onDeviceSelected(device: any): void {
    this.selectedDevice = device;
    console.log('Selected device:', this.selectedDevice);

    // Re-build the footer actions now that we have a selection
    this.updateFooterActions();
  }

  /**
   * Defines and sets the footer buttons.
   */
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

  // --- ACTION HANDLER METHODS ---

  private onCreate(): void {
    console.log('Create action triggered');
    // TODO: Add your logic to open a new form or modal
  }

  private onModify(): void {
    if (!this.selectedDevice) return; // Guard clause
    console.log('Modify action triggered for:', this.selectedDevice.TenThietBi);
    // TODO: Add your logic to modify the selected item
  }

  private onSave(): void {
    if (!this.selectedDevice) return; // Guard clause
    console.log('Save action triggered for:', this.selectedDevice.TenThietBi);
    // TODO: Add your logic to save data
  }

  private onPrint(): void {
    console.log('Print action triggered');
    // TODO: Add your logic to print the grid
  }
}