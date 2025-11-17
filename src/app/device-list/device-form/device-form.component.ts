import { Component, Input, OnInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, of, forkJoin, map } from 'rxjs';
import { finalize, switchMap } from 'rxjs/operators';

import { ModalService } from '../../services/modal.service';
import { environment } from '../../../environments/environment.development';
import { DynamicFormComponent } from '../../components/dynamic-form/dynamic-form.component';
import { ModalRef } from '../../models/modal-ref.model';
import { ConfirmationModalComponent } from '../../components/confirmation-modal/confirmation-modal.component';
import {
  DropdownDataService,
  DropdownOption,
} from '../../services/dropdown-data.service';
import { AuthService } from '../../services/auth.service';
import { ToastService } from '../../services/toast.service';
import { Device } from '../../models/device.model';

@Component({
  selector: 'app-device-form',
  standalone: true,
  imports: [CommonModule, DynamicFormComponent],
  templateUrl: './device-form.component.html',
  styleUrl: './device-form.component.scss',
})
export class DeviceFormComponent implements OnInit {
  @Input() device: Device | null = null; 
  @Input() title: string = 'Biểu Mẫu Thiết Bị';

  public modalRef?: ModalRef;

  @ViewChild(DynamicFormComponent)
  private dynamicForm!: DynamicFormComponent;

  public formConfig: any | null = null;

  public isFormLoading: boolean = true;
  public isSaving: boolean = false;

  constructor(
    private modalService: ModalService,
    private http: HttpClient,
    private dropdownService: DropdownDataService,
    private authService: AuthService,
    private toastService: ToastService
  ) {}

  ngOnInit(): void {
    this.isFormLoading = true;

    let deviceData$: Observable<Device | null>;

    if (this.device && this.device.Id) {
      // --- EDIT MODE ---
      // Fetch fresh data from the API
      const url = `${environment.equipmentCatUrl}/${this.device.Id}`;
      deviceData$ = this.http.get<Device[]>(url).pipe(
        map(dataArray => (dataArray && dataArray.length > 0) ? dataArray[0] : null)
      );
    } else {
      // --- CREATE MODE ---
      deviceData$ = of(null);
    }

    // Load dropdowns and device data in parallel
    forkJoin({
      deviceTypes: this.dropdownService.getDeviceTypes(),
      deviceStatuses: this.dropdownService.getDeviceStatuses(),
      deviceData: deviceData$
    })
      .pipe(finalize(() => (this.isFormLoading = false)))
      .subscribe({
        next: ({ deviceTypes, deviceStatuses, deviceData }) => {
          this.buildFormConfig(deviceTypes, deviceStatuses, deviceData);
        },
        error: (error) => {
          console.error('Failed to load form data', error);
          this.toastService.showError('Không thể tải dữ liệu cho biểu mẫu');
          this.modalRef?.close();
        }
      });

    if (this.modalRef) {
      this.modalRef.canClose = () => this.canDeactivate();
    }
  }

  /**
   * Chuyển đổi chuỗi ngày (từ API) thành "yyyy-MM-dd"
   * cho <input type="date">.
   */
  private parseValueToHtmlDate(
    dateString: string | null | undefined
  ): string {
    if (!dateString || dateString === '0001-01-01T00:00:00') {
      return ''; // Handle null/empty/invalid dates
    }
    
    try {
      // 1. Check if it's a "dd/MM/yyyy..." string (from the API response)
      if (dateString.includes('/') && dateString.length >= 10) {
        const parts = dateString.substring(0, 10).split('/');
        if (parts.length === 3) {
          // Reformat from dd/MM/yyyy to yyyy-MM-dd
          return `${parts[2]}-${parts[1]}-${parts[0]}`;
        }
      }
      
      // 2. Check if it's an ISO string (just in case)
      if (dateString.includes('T')) {
        return dateString.substring(0, 10); // YYYY-MM-DD
      }

      // 3. Check if it's already in "yyyy-MM-dd" format
      if (dateString.includes('-') && dateString.length === 10) {
         return dateString;
      }

    } catch (e) {
      console.error('Error parsing date:', dateString, e);
      return '';
    }
    
    console.warn('Unrecognized date format in form:', dateString);
    return ''; 
  }


  /**
   * Chuyển đổi chuỗi "yyyy-MM-dd" từ input
   * trở lại thành chuỗi ISO 8601 cho API.
   */
  private formatHtmlDateToApiDate(dateString: string): string | null {
    if (!dateString) {
      return null;
    }
    try {
      // Create date as local time
      const parts = dateString.split('-'); // "yyyy", "MM", "dd"
      const year = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1; // JS months are 0-indexed
      const day = parseInt(parts[2], 10);
      const date = new Date(year, month, day);

      if (isNaN(date.getTime())) return null;
      
      // Return as ISO string
      return date.toISOString();
    } catch (e) {
      console.error('Error formatting date string:', dateString, e);
      return null;
    }
  }

  private canDeactivate(): Observable<boolean> {
    const isDirty = this.dynamicForm?.dynamicForm?.dirty || false;
    if (!isDirty && !this.isSaving) return of(true);
    if (this.isSaving) return of(false);

    return this.modalService
      .open(ConfirmationModalComponent, {
        title: 'Thay đổi chưa lưu',
        disableBackdropClose: true,
        size: 'sm',
        context: {
          message:
            'Bạn có thay đổi chưa lưu. \nBạn có chắc chắn muốn hủy bỏ chúng không?',
          confirmText: 'Hủy bỏ thay đổi',
          cancelText: 'Tiếp tục chỉnh sửa',
        },
      })
      .pipe(switchMap((result) => of(!!result)));
  }

  /**
   * Xây dựng cấu hình form
   */
  private buildFormConfig(
    deviceTypes: DropdownOption[],
    deviceStatuses: DropdownOption[],
    deviceData: Device | null // <-- Use the fresh data
  ): void {
    const isEditMode = !!deviceData;
    const data: Partial<Device> = deviceData || {}; // Use the fresh data

    const defaultStatusId =
      deviceStatuses.find((s) => s.value === 'Sẵn sàng')?.key || null;

    const categoryIdValue = data.LoaiThietBi_Id
      ? parseFloat(data.LoaiThietBi_Id.toString())
      : null;

    const trangThaiValue =
      data.TrangThai_Id !== null && data.TrangThai_Id !== undefined
        ? parseFloat(data.TrangThai_Id.toString()) 
        : defaultStatusId;

    this.formConfig = {
      entityId: isEditMode ? data.Id : null,
      saveUrl: environment.equipmentCatUrl,
      formRows: [
        // --- Row 1: Ma, Ten ---
        {
          controls: [
            {
              controlName: 'Ma',
              controlType: 'text',
              label: 'Mã thiết bị',
              value: data.Ma || '',
              validators: { required: true, maxLength: 20, pattern: '^[a-zA-Z0-9_-]+$' },
              validationMessages: {
                required: 'Mã là bắt buộc.',
                maxLength: 'Mã không được vượt quá 20 ký tự.',
                pattern: 'Mã chỉ chứa chữ, số, gạch ngang, gạch dưới.',
              },
              layout_flexGrow: 1,
            },
            {
              controlName: 'Ten',
              controlType: 'text',
              label: 'Tên thiết bị',
              value: data.Ten || '',
              validators: { required: true, maxLength: 100 },
              validationMessages: {
                required: 'Tên là bắt buộc.',
                maxLength: 'Tên không được vượt quá 100 ký tự.',
              },
              layout_flexGrow: 1,
            },
          ],
        },
        // --- Row 2: Model, SerialNumber ---
        {
          controls: [
            {
              controlName: 'Model',
              controlType: 'text',
              label: 'Model',
              value: data.Model || '',
              validators: { maxLength: 50 },
              validationMessages: { maxLength: 'Model không được vượt quá 50 ký tự.' },
              layout_flexGrow: 1,
            },
            {
              controlName: 'SerialNumber',
              controlType: 'text',
              label: 'Số Serial',
              value: data.SerialNumber || '',
              validators: { maxLength: 50 },
              validationMessages: { maxLength: 'Số Serial không được vượt quá 50 ký tự.' },
              layout_flexGrow: 1,
            },
          ],
        },
        // --- Row 3: CategoryID, TrangThai ---
        {
          controls: [
            {
              controlName: 'CategoryID',
              controlType: 'dropdown',
              label: 'Loại thiết bị',
              value: categoryIdValue,
              validators: { required: true },
              validationMessages: { required: 'Vui lòng chọn loại thiết bị.' },
              options: deviceTypes,
              layout_flexGrow: 1,
            },
            {
              controlName: 'TrangThai',
              controlType: 'dropdown',
              label: 'Trạng thái',
              value: trangThaiValue,
              validators: { required: true },
              options: deviceStatuses,
              layout_flexGrow: 1,
            },
          ],
        },
        // --- Row 4: DeviceName, ViTri ---
        {
          controls: [
            {
              controlName: 'DeviceName',
              controlType: 'text',
              label: 'Tên máy (Host name)',
              value: data.DeviceName || '',
              validators: { maxLength: 50 },
              validationMessages: { maxLength: 'Tên máy không được vượt quá 50 ký tự.' },
              layout_flexGrow: 1,
            },
            {
              controlName: 'ViTri',
              controlType: 'text',
              label: 'Vị trí',
              value: data.ViTri || '',
              validators: { maxLength: 100 },
              validationMessages: { maxLength: 'Vị trí không được vượt quá 100 ký tự.' },
              layout_flexGrow: 1,
            },
          ],
        },
        // --- Row 5: Dates ---
        {
          controls: [
            {
              controlName: 'NgayMua',
              controlType: 'date',
              label: 'Ngày mua',
              placeholder: 'DD/MM/YYYY',
              value: this.parseValueToHtmlDate(data.NgayMua), // This is correct
              validators: {},
              layout_flexGrow: 1,
            },
            {
              controlName: 'NgayHetHanBH',
              controlType: 'date',
              label: 'Ngày hết hạn BH',
              placeholder: 'DD/MM/YYYY',
              value: this.parseValueToHtmlDate(data.NgayHetHanBH), // This is correct
              validators: {},
              layout_flexGrow: 1,
            },
            {
              controlName: 'GiaMua',
              controlType: 'currency',
              label: 'Giá mua (VND)',
              value: data.GiaMua || null,
              validators: { max: 10000000000 }, 
              validationMessages: { max: 'Giá mua không hợp lệ (tối đa 10 tỷ).' },
              layout_flexGrow: 1,
            },
          ],
        },
        // --- Row 6: MoTa ---
        {
          controls: [
            {
              controlName: 'MoTa',
              controlType: 'textarea',
              label: 'Mô tả',
              value: data.MoTa || '',
              validators: { maxLength: 500 },
              validationMessages: { maxLength: 'Mô tả không được vượt quá 500 ký tự.' },
              layout_flexGrow: 1,
            },
          ],
        },
      ],
    };
  }

  /**
   * Xử lý lưu form
   */
  public onSave(formData: any): void {
    this.isSaving = true;
    const apiUrl = this.formConfig.saveUrl;
    const entityId = this.formConfig.entityId;

    const currentUserId = this.authService.getUserId();

    if (!currentUserId) {
      this.toastService.showError(
        'Lỗi xác thực người dùng. Vui lòng đăng nhập lại.'
      );
      console.error('User ID is missing, cannot save.');
      this.isSaving = false;
      return;
    }

    const apiNgayMua = this.formatHtmlDateToApiDate(formData.NgayMua);
    
    // --- *** THIS IS THE FIX *** ---
    // It was trying to read `formData.NgData.NgayHetHanBH`
    const apiNgayHetHanBH = this.formatHtmlDateToApiDate(formData.NgayHetHanBH);
    // --- *** END OF FIX *** ---

    let saveObservable;

    if (entityId) {
      const updatePayload = {
        Id: entityId,
        Ma: formData.Ma,
        Ten: formData.Ten,
        Model: formData.Model || null,
        SerialNumber: formData.SerialNumber || null,
        DeviceName: formData.DeviceName || '',
        ViTri: formData.ViTri || null,
        MoTa: formData.MoTa || null,
        TrangThai: formData.TrangThai, 
        CategoryID: formData.CategoryID, 
        NgayMua: apiNgayMua,
        GiaMua: formData.GiaMua || null,
        NgayHetHanBH: apiNgayHetHanBH,
        USER_: currentUserId, 
      };

      const updateUrl = `${apiUrl}/${entityId}`;
      saveObservable = this.http.put(updateUrl, updatePayload);
    } else {
      const devicePayloadForPost = {
        Id: 0,
        Ma: formData.Ma,
        Ten: formData.Ten,
        SerialNumber: formData.SerialNumber || null,
        Model: formData.Model || null,
        TrangThai: formData.TrangThai,
        ViTri: formData.ViTri || null,
        NgayMua: apiNgayMua,
        GiaMua: formData.GiaMua || null,
        NgayHetHanBH: apiNgayHetHanBH,
        MoTa: formData.MoTa || null,
        CategoryID: formData.CategoryID,
        DeviceName: formData.DeviceName || '',
        USER_: currentUserId,
      };

      const wrapperPayload = {
        dmThietBi: devicePayloadForPost,
      };

      saveObservable = this.http.post(apiUrl, wrapperPayload);
    }

    saveObservable
      .pipe(
        finalize(() => {
          this.isSaving = false;
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

          if (err.error && err.error.errors) {
            if (err.error.errors.dmThietBi) {
              errorMessage = `Lỗi API: ${err.error.errors.dmThietBi[0]}`;
            } else {
              const firstErrorKey = Object.keys(err.error.errors)[0];
              if (firstErrorKey.toLowerCase().includes('ngaymua')) {
                errorMessage = `Ngày Mua: ${err.error.errors[firstErrorKey][0]}`;
              } else if (err.error.errors[firstErrorKey]) {
                errorMessage = err.error.errors[firstErrorKey][0];
              }
            }
          } else if (err.status === 409) {
            errorMessage =
              'Thiết bị này đã được cập nhật bởi người dùng khác. Vui lòng làm mới và thử lại.';
          } else if (err.error) {
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