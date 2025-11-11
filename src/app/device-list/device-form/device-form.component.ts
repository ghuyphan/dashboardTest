// src/app/device-list/device-form/device-form.component.ts
import { Component, Input, OnInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, of, forkJoin } from 'rxjs';
import { finalize, switchMap } from 'rxjs/operators';

import { ModalService } from '../../services/modal.service';
import { environment } from '../../../environments/environment.development';
import { DynamicFormComponent } from '../../components/dynamic-form/dynamic-form.component';
import { ModalRef } from '../../models/modal-ref.model';
import { ConfirmationModalComponent } from '../../components/confirmation-modal/confirmation-modal.component';
import { DropdownDataService, DropdownOption } from '../../services/dropdown-data.service';
// --- 1. IMPORT AuthService ---
import { AuthService } from '../../services/auth.service'; 
import { ToastService } from '../../services/toast.service';

@Component({
  selector: 'app-device-form',
  standalone: true,
  imports: [CommonModule, DynamicFormComponent],
  templateUrl: './device-form.component.html',
  styleUrl: './device-form.component.scss',
})
export class DeviceFormComponent implements OnInit {
  @Input() device: any | null = null;
  @Input() title: string = 'Biểu Mẫu Thiết Bị';

  public modalRef?: ModalRef;

  @ViewChild(DynamicFormComponent)
  private dynamicForm!: DynamicFormComponent;

  public formConfig: any | null = null;
  public isLoading: boolean = true; 

  // --- 2. INJECT AuthService ---
  constructor(
    private modalService: ModalService,
    private http: HttpClient,
    private dropdownService: DropdownDataService,
    private authService: AuthService, 
    private toastService: ToastService
  ) {}

  ngOnInit(): void {
    this.isLoading = true;
    forkJoin([
      this.dropdownService.getDeviceTypes(),
      this.dropdownService.getDeviceStatuses()
    ]).pipe(
      finalize(() => this.isLoading = false)
    ).subscribe(
      ([deviceTypes, deviceStatuses]) => {
        this.buildFormConfig(deviceTypes, deviceStatuses);
      },
      (error) => {
        console.error('Failed to load form dropdown data', error);
        this.toastService.showError('Không thể tải dữ liệu cho biểu mẫu');
        this.modalRef?.close(); 
      }
    );

    if (this.modalRef) {
      this.modalRef.canClose = () => this.canDeactivate();
    }
  }

  // +++ NEW HELPER 1: Converts "DD/MM/YYYY" to "YYYY-MM-DDTHH:mm" +++
  /**
   * Converts a "DD/MM/YYYY" string to a "yyyy-MM-ddTHH:mm" string
   * for the datetime-local input.
   */
  private parseApiDateToDateTimeLocal(dateString: string): string {
    if (!dateString || !dateString.includes('/')) {
      return ''; // Not a valid string to parse
    }
    try {
      const parts = dateString.split('/');
      if (parts.length < 3) return '';
      
      const day = parts[0];
      const month = parts[1];
      const year = parts[2];
      
      // Default to 00:00 for time
      return `${year}-${month}-${day}T00:00`;
    } catch (e) {
      console.error('Error parsing date string:', dateString, e);
      return '';
    }
  }

  // +++ NEW HELPER 2: Converts "YYYY-MM-DDTHH:mm" to "DD/MM/YYYY" +++
  /**
   * Converts a "yyyy-MM-ddTHH:mm" string from the input
   * back to a "DD/MM/YYYY" string for the API.
   */
  private formatDateTimeLocalToApiDate(dateTimeString: string): string | null {
    if (!dateTimeString) {
      return null;
    }
    try {
      const date = new Date(dateTimeString);
      if (isNaN(date.getTime())) return null;

      const day = date.getDate().toString().padStart(2, '0');
      const month = (date.getMonth() + 1).toString().padStart(2, '0');
      const year = date.getFullYear();
      
      return `${day}/${month}/${year}`;
    } catch (e) {
      console.error('Error formatting datetime-local string:', dateTimeString, e);
      return null;
    }
  }

  private canDeactivate(): Observable<boolean> {
    const isDirty = this.dynamicForm?.dynamicForm?.dirty || false;
    if (!isDirty) {
      return of(true);
    }
    return this.modalService
      .open(ConfirmationModalComponent, {
        title: 'Thay đổi chưa lưu',
        disableBackdropClose: true,
        size: 'sm',
        context: {
          message:
            'Bạn có thay đổi chưa lưu. Bạn có chắc chắn muốn hủy bỏ chúng không?',
          confirmText: 'Hủy bỏ thay đổi',
          cancelText: 'Tiếp tục chỉnh sửa',
        },
      })
      .pipe(switchMap((result) => of(!!result)));
  }

  /**
   * --- 3. UPDATED to include all fields from your JSON ---
   */
  private buildFormConfig(
    deviceTypes: DropdownOption[],
    deviceStatuses: DropdownOption[]
  ): void {
    const isEditMode = !!this.device;
    const deviceData = this.device || {};

    // Find the default status ID for "Sẵn sàng"
    const defaultStatusId = deviceStatuses.find(s => s.value === 'Sẵn sàng')?.key || null;

    this.formConfig = {
      entityId: isEditMode ? deviceData.Id : null,
      saveUrl: environment.equipmentCatUrl,
      formRows: [
        // --- Row 1: Ma, Ten ---
        {
          controls: [
            {
              controlName: 'Ma', // Matches "Ma"
              controlType: 'text',
              label: 'Mã thiết bị',
              value: deviceData.Ma || '',
              validators: { required: true },
              validationMessages: { required: 'Mã là bắt buộc.' },
              layout_flexGrow: 1,
            },
            {
              controlName: 'Ten', // Matches "Ten"
              controlType: 'text',
              label: 'Tên thiết bị',
              value: deviceData.Ten || '',
              validators: { required: true },
              validationMessages: { required: 'Tên là bắt buộc.' },
              layout_flexGrow: 1,
            },
          ],
        },
        // --- Row 2: Model, SerialNumber ---
        {
          controls: [
            {
              controlName: 'Model', // Matches "Model"
              controlType: 'text',
              label: 'Model',
              value: deviceData.Model || '',
              validators: {},
              layout_flexGrow: 1,
            },
            {
              controlName: 'SerialNumber', // Matches "SerialNumber"
              controlType: 'text',
              label: 'Số Serial',
              value: deviceData.SerialNumber || '',
              validators: {},
              layout_flexGrow: 1,
            },
          ],
        },
        // --- Row 3: CategoryID, TrangThai ---
        {
          controls: [
            {
              controlName: 'CategoryID', // Matches "CategoryID"
              controlType: 'dropdown',
              label: 'Loại thiết bị',
              value: deviceData.CategoryID || null,
              validators: { required: true },
              validationMessages: { required: 'Vui lòng chọn loại thiết bị.' },
              options: deviceTypes,
              layout_flexGrow: 1,
            },
            {
              controlName: 'TrangThai', // Matches "TrangThai" (ID)
              controlType: 'dropdown',
              label: 'Trạng thái',
              value: deviceData.TrangThai || defaultStatusId, // Bind to ID
              validators: { required: true },
              options: deviceStatuses, // Already mapped to { key: ID, value: TEN }
              layout_flexGrow: 1,
            },
          ],
        },
         // --- Row 4: DeviceName, ViTri ---
        {
          controls: [
            {
              controlName: 'DeviceName', // Matches "DeviceName"
              controlType: 'text',
              label: 'Tên máy (Host name)',
              value: deviceData.DeviceName || '',
              validators: {},
              layout_flexGrow: 1,
            },
            {
              controlName: 'ViTri', // Matches "ViTri"
              controlType: 'text',
              label: 'Vị trí',
              value: deviceData.ViTri || '',
              validators: {},
              layout_flexGrow: 1,
            },
          ],
        },
        // --- Row 5: Dates (as text for now) ---
        {
          controls: [
            {
              controlName: 'NgayMua',
              // +++ UPDATED +++
              controlType: 'datetime', // Use 'datetime'
              label: 'Ngày mua',
              placeholder: 'DD/MM/YYYY',
              // +++ UPDATED +++
              value: this.parseApiDateToDateTimeLocal(deviceData.NgayMua), 
              validators: {},
              layout_flexGrow: 1,
            },
            {
              controlName: 'NgayHetHanBH',
              // +++ UPDATED +++
              controlType: 'datetime', // Use 'datetime'
              label: 'Ngày hết hạn BH',
              placeholder: 'DD/MM/YYYY',
              // +++ UPDATED +++
              value: this.parseApiDateToDateTimeLocal(deviceData.NgayHetHanBH), 
              validators: {},
              layout_flexGrow: 1,
            },
            {
              controlName: 'GiaMua',
              controlType: 'text', // Use 'number'
              label: 'Giá mua',
              value: deviceData.GiaMua || null,
              validators: {},
              layout_flexGrow: 1,
            }
          ]
        },
        // --- Row 6: MoTa ---
        {
          controls: [
            {
              controlName: 'MoTa', // Matches "MoTa"
              controlType: 'textarea',
              label: 'Mô tả',
              value: deviceData.MoTa || '',
              validators: {},
              layout_flexGrow: 1,
            },
          ],
        },
      ],
    };
  }

  /**
   * --- 4. UPDATED to build the exact JSON payload ---
   */
  public onSave(formData: any): void {
    this.isLoading = true;
    const apiUrl = this.formConfig.saveUrl;
    const entityId = this.formConfig.entityId;
    
    // +++ Get the user ID +++
    const currentUserId = this.authService.getUserId();

    if (!currentUserId) {
      this.toastService.showError('Lỗi xác thực người dùng. Vui lòng đăng nhập lại.');
      console.error('User ID is missing, cannot save.');
      this.isLoading = false;
      return;
    }

    // +++ UPDATED: Format dates back to API format +++
    const apiNgayMua = this.formatDateTimeLocalToApiDate(formData.NgayMua);
    const apiNgayHetHanBH = this.formatDateTimeLocalToApiDate(formData.NgayHetHanBH);

    let saveObservable;

    if (entityId) {
      // --- UPDATE (PUT) ---
      const updatePayload = {
        ...this.device,
        ...formData,
        NgayMua: apiNgayMua,
        GiaMua: formData.GiaMua || null,
        NgayHetHanBH: apiNgayHetHanBH,
      };
      
      const updateUrl = `${apiUrl}/${entityId}`;
      saveObservable = this.http.put(updateUrl, updatePayload);

    } else {
      // --- CREATE (POST) ---
      const createPayload = {
        Id: 0,
        Ma: formData.Ma,
        Ten: formData.Ten,
        SerialNumber: formData.SerialNumber || '',
        Model: formData.Model || '',
        TrangThai: formData.TrangThai, // This is the ID from the form
        ViTri: formData.ViTri || '',
        NgayMua: apiNgayMua,
        GiaMua: formData.GiaMua || null,
        NgayHetHanBH: apiNgayHetHanBH,
        MoTa: formData.MoTa || '',
        CategoryID: formData.CategoryID, // This is the ID from the form
        DeviceName: formData.DeviceName || '',
        HL: 1.0 // Assuming HL is 1.0 for new records
      };
      
      saveObservable = this.http.post(apiUrl, createPayload);
    }

    // --- This part remains the same ---
    saveObservable
      .pipe(
        finalize(() => {
          this.isLoading = false;
        })
      )
      .subscribe({
        next: (response: any) => { 
          const successMessage = response.TenKetQua || 'Lưu thành công!';
          this.toastService.showSuccess(successMessage);
          
          console.log('Save successful', response);
          if (this.modalRef) {
            this.modalRef.canClose = () => true;
          }
          this.modalRef?.close(response);
        },
        error: (err: HttpErrorResponse) => { 
          let errorMessage = 'Lưu thất bại! Đã có lỗi xảy ra.';
          if (err.error) {
            if (typeof err.error === 'string') {
              errorMessage = err.error;
            } else if (err.error.ErrorMessage) {
              errorMessage = err.error.ErrorMessage;
            } else if (err.error.TenKetQua) {
              errorMessage = err.error.TenKetQua;
            } else if (err.message) {
              errorMessage = err.message;
            }
          } else if (err.message) {
            errorMessage = err.message;
          }
          
          this.toastService.showError(errorMessage, 0); 
          console.error('Failed to save device:', err);
        },
      });
  }

  public onCancel(): void {
    this.modalRef?.close();
  }
}