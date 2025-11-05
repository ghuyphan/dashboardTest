import { Component, OnInit, OnDestroy } from '@angular/core'; 
import { CommonModule } from '@angular/common';

// Import your reusable grid
import { ReusableGridComponent, GridColumn } from '../components/reusable-grid/reusable-grid.component';

// IMPORT THE FOOTER SERVICE AND MODEL
import { FooterActionService } from '../services/footer-action.service';
import { FooterAction } from '../models/footer-action.model';

@Component({
  selector: 'app-device-list',
  standalone: true,
  imports: [CommonModule, ReusableGridComponent],
  templateUrl: 'device-list.component.html',
  styleUrl: './device-list.component.scss'
})
export class DeviceListComponent implements OnInit, OnDestroy { 

  // --- Grid Properties ---
  public deviceColumns: GridColumn[] = [
    { key: 'deviceId', label: 'Device ID' },
    { key: 'deviceName', label: 'Device Name' },
    { key: 'type', label: 'Type' },
    { key: 'status', label: 'Status' },
    { key: 'location', label: 'Location' }
  ];

  public deviceData: any[] = [
    { deviceId: 'ULTRASOUND-001', deviceName: 'Ultrasound X1', type: 'Ultrasound', status: 'Active', location: 'Room 101' },
    { deviceId: 'XRAY-001', deviceName: 'X-Ray Z2', type: 'X-Ray', status: 'Maintenance', location: 'Room 102' },
    { deviceId: 'LAB-003', deviceName: 'Blood Analyzer', type: 'Laboratory', status: 'Active', location: 'Room 205' },
    { deviceId: 'VENT-001', deviceName: 'Ventilator V1', type: 'Respiratory', status: 'Inactive', location: 'Storage' },
  ];

  // --- NEW: Track selected device ---
  public selectedDevice: any | null = null;

  constructor(private footerService: FooterActionService) {}

  ngOnInit(): void {
    // Set initial footer state (with buttons disabled)
    this.updateFooterActions();
  }

  ngOnDestroy(): void {
    this.footerService.clearActions();
  }

  // --- NEW: Event handler for when a row is selected ---
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
   * This is now dynamic based on row selection.
   */
  private updateFooterActions(): void {
    
    const isRowSelected = this.selectedDevice !== null;

    const actions: FooterAction[] = [
      {
        label: 'Create New',
        icon: 'fas fa-plus',
        action: () => this.onCreate(),
        permission: 'QLThietBi.DMThietBi.RCREATE',
        className: 'btn-primary'
      },
      {
        label: 'Modify',
        icon: 'fas fa-pencil-alt',
        action: () => this.onModify(),
        permission: 'QLThietBi.DMThietBi.RMODIFY',
        className: 'btn-secondary',
        disabled: !isRowSelected // <-- DYNAMIC: Disabled if no row is selected
      },
      {
        label: 'Save',
        icon: 'fas fa-save',
        action: () => this.onSave(),
        permission: 'QLThietBi.DMThietBi.RSAVE',
        className: 'btn-secondary',
        disabled: !isRowSelected // <-- DYNAMIC: Let's assume Save also needs a selection
      },
      {
        label: 'Print',
        icon: 'fas fa-print',
        action: () => this.onPrint(),
        permission: 'QLThietBi.DMThietBi.RPRINT',
        className: 'btn-ghost'
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
    console.log('Modify action triggered for:', this.selectedDevice.deviceName);
    // TODO: Add your logic to modify the selected item
  }

  private onSave(): void {
    if (!this.selectedDevice) return; // Guard clause
    console.log('Save action triggered for:', this.selectedDevice.deviceName);
    // TODO: Add your logic to save data
  }

  private onPrint(): void {
    console.log('Print action triggered');
    // TODO: Add your logic to print the grid
  }
}