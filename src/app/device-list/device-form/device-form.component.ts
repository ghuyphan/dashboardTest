import { Component, Input, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { finalize } from 'rxjs/operators';
// CHANGED: No longer import ModalService
// import { ModalService } from '../../services/modal.service';
import { environment } from '../../../environments/environment.development';

import { DynamicFormComponent } from '../../components/dynamic-form/dynamic-form.component';

// --- NEW: Import the ModalRef ---
import { ModalRef } from '../../models/modal-ref.model';

// Assume you have a toast service for notifications
// import { ToastService } from '../../services/toast.service';

@Component({
  selector: 'app-device-form',
  standalone: true,
  imports: [CommonModule, DynamicFormComponent],
  templateUrl: './device-form.component.html',
  styleUrl: './device-form.component.scss',
})
export class DeviceFormComponent implements OnInit {
  // --- Data passed in from the modal context ---
  @Input() device: any | null = null;
  @Input() title: string = 'Device Form';

  // --- NEW: This will be injected by ModalComponent ---
  public modalRef?: ModalRef;

  public formConfig: any | null = null;
  public isLoading: boolean = false;

  private deviceTypes: any[] = [
    { key: null, value: '-- Chọn loại --' },
    { key: 1, value: 'Máy thở' },
    { key: 2, value: 'Monitor' },
    { key: 3, value: 'Bơm tiêm điện' },
  ];
  private deviceStatuses: any[] = [
    { key: 'Sẵn sàng', value: 'Sẵn sàng' },
    { key: 'Đang sử dụng', value: 'Đang sử dụng' },
    { key: 'Bảo trì', value: 'Bảo trì' },
  ];

  constructor(
    // --- CHANGED: Removed ModalService ---
    private http: HttpClient
    // private toastService: ToastService
  ) {}

  ngOnInit(): void {
    this.buildFormConfig();
  }

  /**
   * --- NEW: This method *builds the JSON config* ---
   * It maps your old hardcoded form to the new JSON structure.
   */
  private buildFormConfig(): void {
    const isEditMode = !!this.device;
    const deviceData = this.device || {}; // Use empty object if creating

    this.formConfig = {
      // We don't need formTitle, modal service handles that.
      entityId: isEditMode ? deviceData.Id : null,
      saveUrl: environment.equipmentCatUrl,
      formRows: [
        {
          controls: [
            {
              controlName: 'Ma',
              controlType: 'text',
              label: 'Mã thiết bị',
              value: deviceData.Ma || '',
              validators: { required: true },
              validationMessages: { required: 'Mã là bắt buộc.' },
              layout_flexGrow: 1,
            },
            {
              controlName: 'Ten',
              controlType: 'text',
              label: 'Tên thiết bị',
              value: deviceData.Ten || '',
              validators: { required: true },
              validationMessages: { required: 'Tên là bắt buộc.' },
              layout_flexGrow: 1,
            },
          ],
        },
        {
          controls: [
            {
              controlName: 'Model',
              controlType: 'text',
              label: 'Model',
              value: deviceData.Model || '',
              validators: {},
              layout_flexGrow: 1,
            },
            {
              controlName: 'SerialNumber',
              controlType: 'text',
              label: 'Serial Number',
              value: deviceData.SerialNumber || '',
              validators: {},
              layout_flexGrow: 1,
            },
          ],
        },
        {
          controls: [
            {
              controlName: 'LoaiThietBi_Id',
              controlType: 'dropdown',
              label: 'Loại thiết bị',
              value: deviceData.LoaiThietBi_Id || null,
              validators: { required: true },
              validationMessages: { required: 'Vui lòng chọn loại thiết bị.' },
              options: this.deviceTypes, // Use the data from this component
              layout_flexGrow: 1,
            },
            {
              controlName: 'TrangThai_Ten',
              controlType: 'dropdown',
              label: 'Trạng thái',
              value: deviceData.TrangThai_Ten || 'Sẵn sàng',
              validators: { required: true },
              options: this.deviceStatuses, // Use the data from this component
              layout_flexGrow: 1,
            },
          ],
        },
        {
          controls: [
            {
              controlName: 'ViTri',
              controlType: 'textarea', // Changed from text for more space
              label: 'Vị trí',
              value: deviceData.ViTri || '',
              validators: {},
              layout_flexGrow: 1,
            },
          ],
        },
      ],
    };
  }

  /**
   * --- This is now an event handler ---
   * It receives the form data from the dynamic component's output.
   */
  public onSave(formData: any): void {
    this.isLoading = true;
    const apiUrl = this.formConfig.saveUrl;
    const entityId = this.formConfig.entityId;

    let saveObservable;

    if (entityId) {
      // --- Update (PUT) ---
      const updateUrl = `${apiUrl}/${entityId}`;
      saveObservable = this.http.put(updateUrl, { ...this.device, ...formData });
    } else {
      // --- Create (POST) ---
      saveObservable = this.http.post(apiUrl, formData);
    }

    saveObservable
      .pipe(
        finalize(() => {
          this.isLoading = false;
        })
      )
      .subscribe({
        next: (savedDevice) => {
          // this.toastService.showSuccess('Lưu thành công!');
          console.log('Save successful', savedDevice);
          
          // --- CHANGED: Use modalRef to close ---
          this.modalRef?.close(savedDevice); // Close modal on success
        },
        error: (err) => {
          // this.toastService.showError('Lưu thất bại!');
          console.error('Failed to save device:', err);
        },
      });
  }

  /**
   * --- This is also an event handler ---
   * Closes the modal without saving.
   */
  public onCancel(): void {
    // --- CHANGED: Use modalRef to close ---
    this.modalRef?.close(); // No data means "cancel"
  }
}