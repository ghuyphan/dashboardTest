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
    forkJoin([
      this.dropdownService.getDeviceTypes(),
      this.dropdownService.getDeviceStatuses(),
    ])
      .pipe(finalize(() => (this.isFormLoading = false)))
      .subscribe(
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

  /**
   * Chuyển đổi chuỗi ngày ISO (từ API) thành "yyyy-MM-dd"
   * cho input date.
   */
  private parseApiDateToHtmlDate(
    isoDateString: string | null | undefined
  ): string {
    if (!isoDateString || isoDateString === '0001-01-01T00:00:00') {
      return ''; // Handle null/empty/invalid dates
    }
    try {
      return isoDateString.substring(0, 10); // YYYY-MM-DD
    } catch (e) {
      console.error('Error parsing date:', isoDateString, e);
      return '';
    }
  }

  /**
   * Chuyển đổi chuỗi "yyyy-MM-dd" từ input
   * trở lại thành chuỗi ISO 8601 cho API.
   */
  private formatHtmlDateToApiDate(dateString: string): string | null {
    if (!dateString) {
      // dateString sẽ là "YYYY-MM-DD"
      return null;
    }
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return null;
      return date.toISOString();
    } catch (e) {
      console.error('Error formatting date string:', dateString, e);
      return null;
    }
  }

  private canDeactivate(): Observable<boolean> {
    const isDirty = this.dynamicForm?.dynamicForm?.dirty || false;

    if (!isDirty && !this.isSaving) {
      return of(true);
    }

    if (this.isSaving) {
      return of(false);
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
   * Xây dựng cấu hình form
   */
  private buildFormConfig(
    deviceTypes: DropdownOption[],
    deviceStatuses: DropdownOption[]
  ): void {
    const isEditMode = !!this.device;
    const deviceData: Partial<Device> = this.device || {};

    const defaultStatusId =
      deviceStatuses.find((s) => s.value === 'Sẵn sàng')?.key || null;

    const categoryIdValue = deviceData.LoaiThietBi_Id
      ? parseFloat(deviceData.LoaiThietBi_Id.toString())
      : null;

    const trangThaiValue =
      deviceData.TrangThai_Id !== null && deviceData.TrangThai_Id !== undefined
        ? parseFloat(deviceData.TrangThai_Id.toString()) // Read from TrangThai_Id
        : defaultStatusId;

    this.formConfig = {
      entityId: isEditMode ? deviceData.Id : null,
      saveUrl: environment.equipmentCatUrl,
      formRows: [
        // --- Row 1: Ma, Ten ---
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
        // --- Row 2: Model, SerialNumber ---
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
              controlName: 'CategoryID', // Form control name
              controlType: 'dropdown',
              label: 'Loại thiết bị',
              value: categoryIdValue, // Value from Device.LoaiThietBi_Id
              validators: { required: true },
              validationMessages: { required: 'Vui lòng chọn loại thiết bị.' },
              options: deviceTypes,
              layout_flexGrow: 1,
            },
            {
              controlName: 'TrangThai', // Form control name
              controlType: 'dropdown',
              label: 'Trạng thái',
              value: trangThaiValue, // Value from Device.TrangThai_Id
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
              value: deviceData.DeviceName || '',
              validators: {},
              layout_flexGrow: 1,
            },
            {
              controlName: 'ViTri',
              controlType: 'text',
              label: 'Vị trí',
              value: deviceData.ViTri || '',
              validators: {},
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
              value: this.parseApiDateToHtmlDate(deviceData.NgayMua),
              validators: {},
              layout_flexGrow: 1,
            },
            {
              controlName: 'NgayHetHanBH',
              controlType: 'date',
              label: 'Ngày hết hạn BH',
              placeholder: 'DD/MM/YYYY',
              value: this.parseApiDateToHtmlDate(deviceData.NgayHetHanBH),
              validators: {},
              layout_flexGrow: 1,
            },
            {
              controlName: 'GiaMua',
              controlType: 'currency',
              label: 'Giá mua',
              value: deviceData.GiaMua || null,
              validators: {},
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
    const apiNgayHetHanBH = this.formatHtmlDateToApiDate(formData.NgayHetHanBH);

    let saveObservable;
    let devicePayload: Device; // Will hold the final device object

    if (entityId) {
      // --- UPDATE (PUT) ---
      devicePayload = {
        ...this.device!,
        Ma: formData.Ma,
        Ten: formData.Ten,
        Model: formData.Model || null,
        SerialNumber: formData.SerialNumber || null,
        DeviceName: formData.DeviceName || null,
        ViTri: formData.ViTri || null,
        MoTa: formData.MoTa || null,
        LoaiThietBi_Id: formData.CategoryID,
        TrangThai_Id: formData.TrangThai,
        NgayMua: apiNgayMua,
        GiaMua: formData.GiaMua || null,
        NgayHetHanBH: apiNgayHetHanBH,
      };

      // --- MODIFICATION: Wrap the payload as per user's request ---
      const wrapperPayload = {
        dmThietBi: devicePayload,
      };
      
      const updateUrl = `${apiUrl}/${entityId}`;
      saveObservable = this.http.put(updateUrl, wrapperPayload); // Send WRAPPED payload

    } else {
      // --- CREATE (POST) ---
      devicePayload = {
        Id: 0,
        Ma: formData.Ma,
        Ten: formData.Ten,
        SerialNumber: formData.SerialNumber || null,
        Model: formData.Model || null,
        TrangThai_Id: formData.TrangThai,
        ViTri: formData.ViTri || null,
        NgayMua: apiNgayMua,
        GiaMua: formData.GiaMua || null,
        NgayHetHanBH: apiNgayHetHanBH,
        MoTa: formData.MoTa || null,
        LoaiThietBi_Id: formData.CategoryID,
        DeviceName: formData.DeviceName || null,
      };

      // Create the wrapper object the API expects
      const wrapperPayload = {
        dmThietBi: devicePayload,
      };

      saveObservable = this.http.post(apiUrl, wrapperPayload); // Send wrapped payload
    }
    // --- END OF MODIFICATION ---

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