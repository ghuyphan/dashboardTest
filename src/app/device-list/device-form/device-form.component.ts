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
  
  // --- START OF CHANGE ---
  public isFormLoading: boolean = true; // Renamed from isLoading
  public isSaving: boolean = false; // New state for submit
  // --- END OF CHANGE ---

  // --- 2. INJECT AuthService ---
  constructor(
    private modalService: ModalService,
    private http: HttpClient,
    private dropdownService: DropdownDataService,
    private authService: AuthService, 
    private toastService: ToastService
  ) {}

  ngOnInit(): void {
    // --- START OF CHANGE ---
    this.isFormLoading = true;
    forkJoin([
      this.dropdownService.getDeviceTypes(),
      this.dropdownService.getDeviceStatuses()
    ]).pipe(
      finalize(() => this.isFormLoading = false) // Use isFormLoading here
    ).subscribe(
    // --- END OF CHANGE ---
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

  // --- MODIFIED: Renamed and updated logic ---
  /**
   * Converts a "DD/MM/YYYY" string to a "yyyy-MM-dd" string
   * for the date input.
   */
  private parseApiDateToHtmlDate(dateString: string): string {
    if (!dateString || !dateString.includes('/')) {
      return ''; // Not a valid string to parse
    }
    try {
      const parts = dateString.split('/');
      if (parts.length < 3) return '';
      
      const day = parts[0];
      const month = parts[1];
      const year = parts[2];
      
      // Return YYYY-MM-DD format
      return `${year}-${month}-${day}`;
    } catch (e) {
      console.error('Error parsing date string:', dateString, e);
      return '';
    }
  }

  // --- MODIFIED: Renamed and updated logic ---
  /**
   * Converts a "yyyy-MM-dd" string from the input
   * back to an ISO 8601 string for the API.
   */
  private formatHtmlDateToApiDate(dateString: string): string | null {
    if (!dateString) { // dateString will be "YYYY-MM-DD"
      return null;
    }
    try {
      // This correctly parses "YYYY-MM-DD" as local midnight
      const date = new Date(dateString); 
      if (isNaN(date.getTime())) return null;

      // Return the standard ISO 8601 string.
      return date.toISOString(); 
    } catch (e) {
      console.error('Error formatting date string:', dateString, e);
      return null;
    }
  }

  private canDeactivate(): Observable<boolean> {
    const isDirty = this.dynamicForm?.dynamicForm?.dirty || false;
    
    // --- START OF CHANGE ---
    // Also check if we are in the middle of saving
    if (!isDirty && !this.isSaving) {
      return of(true);
    }
    
    // If saving, prevent deactivation
    if (this.isSaving) {
      return of(false);
    }
    // --- END OF CHANGE ---
    
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
              // --- MODIFICATION ---
              controlName: 'NgayMua',
              controlType: 'date', // <-- CHANGED
              label: 'Ngày mua',
              placeholder: 'DD/MM/YYYY',
              value: this.parseApiDateToHtmlDate(deviceData.NgayMua), // <-- Use new helper
              validators: {},
              layout_flexGrow: 1,
            },
            {
              // --- MODIFICATION ---
              controlName: 'NgayHetHanBH',
              controlType: 'date', // <-- CHANGED
              label: 'Ngày hết hạn BH',
              placeholder: 'DD/MM/YYYY',
              value: this.parseApiDateToHtmlDate(deviceData.NgayHetHanBH), // <-- Use new helper
              validators: {},
              layout_flexGrow: 1,
            },
            {
              controlName: 'GiaMua',
              controlType: 'currency',
              label: 'Giá mua',
              value: deviceData.GiaMua || null,
              validators: {},
              layout_flexGrow: 1
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
    // --- START OF CHANGE ---
    this.isSaving = true;
    // --- END OF CHANGE ---
    const apiUrl = this.formConfig.saveUrl;
    const entityId = this.formConfig.entityId;
    
    // +++ Get the user ID +++
    const currentUserId = this.authService.getUserId();

    if (!currentUserId) {
      this.toastService.showError('Lỗi xác thực người dùng. Vui lòng đăng nhập lại.');
      console.error('User ID is missing, cannot save.');
      // --- START OF CHANGE ---
      this.isSaving = false;
      // --- END OF CHANGE ---
      return;
    }

    // --- MODIFICATION: Use new helper ---
    const apiNgayMua = this.formatHtmlDateToApiDate(formData.NgayMua);
    const apiNgayHetHanBH = this.formatHtmlDateToApiDate(formData.NgayHetHanBH);

    let saveObservable;

    if (entityId) {
      // --- UPDATE (PUT) ---
      const updatePayload = {
        ...this.device,
        ...formData,
        NgayMua: apiNgayMua,
        GiaMua: formData.GiaMua || null,
        NgayHetHanBH: apiNgayHetHanBH,
        USER_: currentUserId 
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
        TrangThai: formData.TrangThai,
        ViTri: formData.ViTri || '',
        NgayMua: apiNgayMua,
        GiaMua: formData.GiaMua || null,
        NgayHetHanBH: apiNgayHetHanBH,
        MoTa: formData.MoTa || '',
        CategoryID: formData.CategoryID,
        DeviceName: formData.DeviceName || '',
        USER_: currentUserId
      };
      
      saveObservable = this.http.post(apiUrl, createPayload);
    }

    // --- This part remains the same ---
    saveObservable
      .pipe(
        finalize(() => {
          // --- START OF CHANGE ---
          this.isSaving = false;
          // --- END OF CHANGE ---
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
            if (err.error.errors) {
              const firstErrorKey = Object.keys(err.error.errors)[0];
              if (firstErrorKey.toLowerCase().includes('ngaymua')) {
                errorMessage = `Ngày Mua: ${err.error.errors[firstErrorKey][0]}`;
              } else if (err.error.errors[firstErrorKey]) {
                errorMessage = err.error.errors[firstErrorKey][0];
              }
            } else if (typeof err.error === 'string') {
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