// CHANGED: Imported AfterViewInit
import { Component, OnInit, OnDestroy, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Subscription } from 'rxjs';

import {
  ReusableTableComponent,
  GridColumn,
  SortChangedEvent,
} from '../components/reusable-table/reusable-table.component';

import { FooterActionService } from '../services/footer-action.service';
import { FooterAction } from '../models/footer-action.model';
import { SearchService } from '../services/search.service';
import { environment } from '../../environments/environment.development';

// +++ 1. IMPORT THE MODAL SERVICE AND FORM COMPONENT +++
import { ModalService } from '../services/modal.service';
import { DeviceFormComponent } from './device-form/device-form.component';

@Component({
  selector: 'app-device-list',
  standalone: true,
  // +++ 2. IMPORT THE FORM COMPONENT +++
  // (It's standalone, so it just needs to be in the imports array)
  imports: [CommonModule, ReusableTableComponent, DeviceFormComponent],
  templateUrl: './device-list.component.html',
  styleUrl: './device-list.component.scss',
})
export class DeviceListComponent implements OnInit, OnDestroy, AfterViewInit {
  // --- Grid Properties (Unchanged) ---
  public deviceColumns: GridColumn[] = [
    // Basic Information
    { key: 'Id', label: 'ID', sortable: true },
    { key: 'Ma', label: 'Mã Thiết Bị', sortable: true },
    { key: 'Ten', label: 'Tên Thiết Bị', sortable: true },
    { key: 'DeviceName', label: 'Tên Máy', sortable: true },
    { key: 'Model', label: 'Model', sortable: true },
    { key: 'SerialNumber', label: 'Số Serial', sortable: true },

    // Device Category Information
    // { key: 'MaLoaiThietBi', label: 'Mã Loại TB', sortable: true },
    { key: 'TenLoaiThietBi', label: 'Loại Thiết Bị', sortable: true },
    // { key: 'LoaiThietBi_Id', label: 'ID Loại TB', sortable: true },

    // Status Information
    { key: 'TrangThai_Ten', label: 'Trạng Thái', sortable: true },
    // { key: 'TrangThai_Id', label: 'ID Trạng Thái', sortable: true },

    // Location & Description
    { key: 'ViTri', label: 'Vị Trí', sortable: true },
    { key: 'MoTa', label: 'Mô Tả', sortable: true },

    // Purchase Information
    { key: 'NgayMua', label: 'Ngày Mua', sortable: true },
    { key: 'GiaMua', label: 'Giá Mua', sortable: true },
    { key: 'NgayHetHanBH', label: 'Ngày Hết Hạn BH', sortable: true },

    // Creator Information
    { key: 'NguoiTao', label: 'Người Tạo', sortable: true },
    // { key: 'NguoiTao_Id', label: 'ID Người Tạo', sortable: true },

    // Creation Date
    { key: 'NgayTao', label: 'Ngày Tạo', sortable: true },

    // System Fields
    { key: 'HL', label: 'HL', sortable: true }
  ];

  public allDeviceData: any[] = [];
  public selectedDevice: any | null = null;
  public isLoading: boolean = false;
  private deviceSub: Subscription | null = null;
  private searchSub: Subscription | null = null;
  public currentSearchTerm: string = '';

  constructor(
    private footerService: FooterActionService,
    private http: HttpClient,
    private searchService: SearchService,
    // +++ 3. INJECT THE MODAL SERVICE +++
    private modalService: ModalService
  ) { }

  ngOnInit(): void {
    this.updateFooterActions();
    this.searchSub = this.searchService.searchTerm$.subscribe((term) => {
      this.currentSearchTerm = term;
    });
  }

  ngAfterViewInit(): void {
    setTimeout(() => {
      this.loadDevices();
    }, 0);
  }

  ngOnDestroy(): void {
    this.footerService.clearActions();
    this.deviceSub?.unsubscribe();
    this.searchSub?.unsubscribe();
  }

  private formatDate(dateString: string): string {
    if (!dateString) return '';
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return '';
      const day = date.getDate().toString().padStart(2, '0');
      const month = (date.getMonth() + 1).toString().padStart(2, '0');
      const year = date.getFullYear();
      return `${day}/${month}/${year}`;
    } catch (error) {
      console.error('Error formatting date:', dateString, error);
      return dateString;
    }
  }

  private loadDevices(): void {
    this.isLoading = true;
    const url = environment.equipmentCatUrl;

    this.deviceSub = this.http.get<any[]>(url).subscribe({
      next: (data) => {
        const formattedData = data.map((device) => ({
          ...device,
          NgayTao: this.formatDate(device.NgayTao),
        }));
        this.allDeviceData = formattedData;
        this.isLoading = false;
        console.log('Devices loaded and formatted:', formattedData);
      },
      error: (err) => {
        console.error('Failed to load devices:', err);
        this.isLoading = false;
      },
    });
  }

  public onSortChanged(sortEvent: SortChangedEvent): void {
    console.log('Sort Changed (Handled by Table):', sortEvent);
  }

  public onDeviceSelected(device: any): void {
    // --- THIS IS THE FIX ---
    // This now correctly handles toggling the selection off
    this.selectedDevice = this.selectedDevice === device ? null : device;
    
    console.log('Selected device:', this.selectedDevice);
    this.updateFooterActions();
  }

  private updateFooterActions(): void {
    const isRowSelected = this.selectedDevice !== null;
    const actions: FooterAction[] = [
      {
        label: 'Tạo mới',
        icon: 'fas fa-plus',
        action: () => this.onCreate(), // <-- Changed to call our new method
        permission: 'QLThietBi.DMThietBi.RCREATE',
        className: 'btn-primary',
      },
      {
        label: 'Sửa',
        icon: 'fas fa-pencil-alt',
        action: () => this.onModify(), // <-- Changed to call our new method
        permission: 'QLThietBi.DMThietBi.RMODIFY',
        className: 'btn-secondary',
        disabled: !isRowSelected,
      },
    ];
    this.footerService.setActions(actions);
  }

  // --- +++ ACTION METHODS (MODIFIED) +++ ---

  /**
   * Opens the modal in "Create" mode.
   */
  private onCreate(): void {
    console.log('Create action triggered');

    // Use the ModalService to open the form
    this.modalService
      .open(DeviceFormComponent, {
        title: 'Tạo mới Thiết bị', // This title is used by app-modal
        context: {
          device: null, // Pass null to indicate "Create" mode
          title: 'Tạo mới Thiết bị' // The form can use this if it wants
        },
      })
      .subscribe((result) => {
        // This code runs *after* the modal is closed
        if (result) {
          // 'result' is the new device object passed from modalService.close(savedDevice)
          console.log('Modal closed with new device:', result);
          // For simplicity, just reload the whole list.
          // In a real app, you might just add the new row to allDeviceData.
          this.loadDevices();
        } else {
          // Modal was cancelled
          console.log('Create modal was cancelled');
        }
      });
  }

  /**
   * Opens the modal in "Edit" mode.
   */
  private onModify(): void {
    if (!this.selectedDevice) return;
    console.log('Modify action triggered for:', this.selectedDevice.Ten);

    // Use the ModalService to open the form
    this.modalService
      .open(DeviceFormComponent, {
        title: `Sửa Thiết bị: ${this.selectedDevice.Ten}`,
        context: {
          device: this.selectedDevice, // Pass the selected device
          title: 'Sửa Thiết bị'
        },
      })
      .subscribe((result) => {
        // This code runs *after* the modal is closed
        if (result) {
          // 'result' is the updated device object
          console.log('Modal closed with updated device:', result);
          // Reload the list to see changes
          this.loadDevices();
        } else {
          // Modal was cancelled
          console.log('Modify modal was cancelled');
        }
      });
  }
}