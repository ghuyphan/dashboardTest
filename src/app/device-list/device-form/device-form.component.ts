import { Component, Input, OnInit, ViewChild, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, of, forkJoin, map } from 'rxjs';
import { finalize, switchMap } from 'rxjs/operators';

// Models & Services
import { Device } from '../../models/device.model';
import { ModalRef } from '../../models/modal-ref.model';
import { ModalService } from '../../services/modal.service';
import { AuthService } from '../../services/auth.service';
import { ToastService } from '../../services/toast.service';
import { DropdownDataService, DropdownOption } from '../../services/dropdown-data.service';
import { environment } from '../../../environments/environment.development';
import { DateUtils } from '../../utils/date.utils'; // Import DateUtils

// Components
import { DynamicFormComponent } from '../../components/dynamic-form/dynamic-form.component';
import { ConfirmationModalComponent } from '../../components/confirmation-modal/confirmation-modal.component';

@Component({
  selector: 'app-device-form',
  standalone: true,
  imports: [CommonModule, DynamicFormComponent],
  templateUrl: './device-form.component.html',
  styleUrl: './device-form.component.scss',
})
export class DeviceFormComponent implements OnInit {
  // -------------------------------------------------------------------------
  // Inputs & ViewChildren
  // -------------------------------------------------------------------------
  @Input() device: Device | null = null;
  @Input() title: string = 'Biểu Mẫu Thiết Bị';

  @ViewChild(DynamicFormComponent)
  private dynamicForm!: DynamicFormComponent;

  // -------------------------------------------------------------------------
  // Dependencies (Modern inject() pattern)
  // -------------------------------------------------------------------------
  private readonly modalService = inject(ModalService);
  private readonly http = inject(HttpClient);
  private readonly dropdownService = inject(DropdownDataService);
  private readonly authService = inject(AuthService);
  private readonly toastService = inject(ToastService);

  // -------------------------------------------------------------------------
  // State
  // -------------------------------------------------------------------------
  public modalRef?: ModalRef;
  public formConfig: any | null = null; // Consider creating an interface for FormConfig
  public isFormLoading = true;
  public isSaving = false;

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------
  ngOnInit(): void {
    this.initializeFormData();
    this.setupModalCloseGuard();
  }

  // -------------------------------------------------------------------------
  // Initialization Logic
  // -------------------------------------------------------------------------
  private initializeFormData(): void {
    this.isFormLoading = true;

    // 1. Prepare Device Data Stream
    const deviceData$ = this.getDeviceDataStream();

    // 2. Load all dependencies in parallel
    forkJoin({
      deviceTypes: this.dropdownService.getDeviceTypes(),
      deviceStatuses: this.dropdownService.getDeviceStatuses(),
      deviceData: deviceData$,
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
        },
      });
  }

  private getDeviceDataStream(): Observable<Device | null> {
    if (this.device?.Id) {
      const url = `${environment.equipmentCatUrl}/${this.device.Id}`;
      return this.http.get<Device[]>(url).pipe(
        // API returns an array, we need the first item
        map((dataArray) => (dataArray?.length ? dataArray[0] : null))
      );
    }
    return of(null);
  }

  private setupModalCloseGuard(): void {
    if (this.modalRef) {
      this.modalRef.canClose = () => this.canDeactivate();
    }
  }

  // -------------------------------------------------------------------------
  // Form Configuration
  // -------------------------------------------------------------------------
  private buildFormConfig(
    deviceTypes: DropdownOption[],
    deviceStatuses: DropdownOption[],
    deviceData: Device | null
  ): void {
    const isEditMode = !!deviceData;
    const data: Partial<Device> = deviceData || {};

    // REFACTOR: Force null for new items, strictly use existing ID for edit.
    // We removed the logic that looked for "Sẵn sàng".
    const trangThaiValue = isEditMode && data.TrangThai_Id !== undefined
      ? data.TrangThai_Id
      : null; 

    const categoryIdValue = data.LoaiThietBi_Id
      ? Number(data.LoaiThietBi_Id)
      : null;

    this.formConfig = {
      entityId: isEditMode ? data.Id : null,
      saveUrl: environment.equipmentCatUrl,
      formRows: [
        // Row 1: Code & Name
        {
          controls: [
            {
              controlName: 'Ma',
              controlType: 'text',
              label: 'Mã thiết bị',
              value: data.Ma || '',
              disabled: true,
              placeholder: isEditMode ? '' : 'Mã sẽ được tạo tự động',
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
        // Row 2: Model & Serial
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
        // Row 3: Type & Status
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
              value: trangThaiValue, // Will be null if new
              validators: { required: true },
              validationMessages: { required: 'Vui lòng chọn trạng thái.' },
              options: deviceStatuses,
              layout_flexGrow: 1,
            },
          ],
        },
        // Row 4: Hostname & Location
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
        // Row 5: Dates & Price
        {
          controls: [
            {
              controlName: 'NgayMua',
              controlType: 'date',
              label: 'Ngày mua',
              placeholder: 'DD/MM/YYYY',
              value: this.toHtmlDate(data.NgayMua),
              layout_flexGrow: 1,
            },
            {
              controlName: 'NgayHetHanBH',
              controlType: 'date',
              label: 'Ngày hết hạn BH',
              placeholder: 'DD/MM/YYYY',
              value: this.toHtmlDate(data.NgayHetHanBH),
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
        // Row 6: Description
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

  // -------------------------------------------------------------------------
  // Action Handlers
  // -------------------------------------------------------------------------
  public onSave(formData: any): void {
    this.isSaving = true;
    
    const currentUserId = this.authService.getUserId();
    if (!currentUserId) {
      this.toastService.showError('Lỗi xác thực: Vui lòng đăng nhập lại.');
      this.isSaving = false;
      return;
    }

    const payload = this.createSavePayload(formData, currentUserId);
    const request$ = this.getSaveRequest(payload);

    request$.pipe(
      finalize(() => this.isSaving = false)
    ).subscribe({
      next: (response: any) => {
        const msg = response.TenKetQua || 'Lưu thành công!';
        this.toastService.showSuccess(msg);
        
        // Allow closing without warning since we saved
        if (this.modalRef) this.modalRef.canClose = () => true;
        this.modalRef?.close(response);
      },
      error: (err: HttpErrorResponse) => this.handleSaveError(err)
    });
  }

  public onCancel(): void {
    this.modalRef?.close();
  }

  private canDeactivate(): Observable<boolean> {
    const isDirty = this.dynamicForm?.dynamicForm?.dirty ?? false;

    if (!isDirty && !this.isSaving) return of(true);
    if (this.isSaving) return of(false);

    return this.modalService.open(ConfirmationModalComponent, {
      title: 'Thay đổi chưa lưu',
      disableBackdropClose: true,
      size: 'sm',
      context: {
        message: 'Bạn có thay đổi chưa lưu. \nBạn có chắc chắn muốn hủy bỏ chúng không?',
        confirmText: 'Hủy bỏ thay đổi',
        cancelText: 'Tiếp tục chỉnh sửa',
        icon: 'fas fa-question-circle',
        iconColor: 'var(--color-info)',
      },
    }).pipe(switchMap((res) => of(!!res)));
  }

  // -------------------------------------------------------------------------
  // Helpers: Payload Construction & API
  // -------------------------------------------------------------------------
  private createSavePayload(formData: any, userId: string): any {
    // Using DateUtils for API date formatting logic if needed, 
    // but since formData from dynamic form is likely YYYY-MM-DD string from input[type=date],
    // we need to convert it to ISO string for API.
    // If your DateUtils has a specific method for this, you can use it.
    // Otherwise, stick with toApiDate or similar logic.
    const apiNgayMua = this.toApiDate(formData.NgayMua);
    const apiNgayHetHanBH = this.toApiDate(formData.NgayHetHanBH);

    return {
      // Common fields
      Id: this.formConfig.entityId || 0,
      Ma: formData.Ma || null,
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
      USER_: userId,
    };
  }

  private getSaveRequest(payload: any): Observable<any> {
    const apiUrl = this.formConfig.saveUrl;
    const id = this.formConfig.entityId;

    if (id) {
      return this.http.put(`${apiUrl}/${id}`, payload);
    } else {
      return this.http.post(apiUrl, payload);
    }
  }

  // -------------------------------------------------------------------------
  // Helpers: Date Conversion
  // -------------------------------------------------------------------------
  private toHtmlDate(dateStr: string | null | undefined): string {
    if (!dateStr || dateStr === '0001-01-01T00:00:00') return '';
    
    // Use DateUtils to parse the date string first to ensure valid date object
    const date = DateUtils.parse(dateStr);
    
    if (date) {
        // Convert Date object to YYYY-MM-DD string for input[type="date"]
        const year = date.getFullYear();
        const month = (date.getMonth() + 1).toString().padStart(2, '0');
        const day = date.getDate().toString().padStart(2, '0');
        return `${year}-${month}-${day}`;
    }
    
    return '';
  }

  private toApiDate(htmlDate: string): string | null {
    if (!htmlDate) return null;
    // DateUtils.parse handles various formats, including YYYY-MM-DD
    const date = DateUtils.parse(htmlDate);
    return date ? date.toISOString() : null;
  }

  // -------------------------------------------------------------------------
  // Helpers: Error Handling
  // -------------------------------------------------------------------------
  private handleSaveError(err: HttpErrorResponse): void {
    let errorMessage = 'Lưu thất bại! Đã có lỗi xảy ra.';

    if (err.error?.errors) {
      // Validation errors (ASP.NET Core style)
      const errors = err.error.errors;
      if (errors.dmThietBi) {
        errorMessage = `Lỗi API: ${errors.dmThietBi[0]}`;
      } else {
        // Find first error key
        const firstKey = Object.keys(errors)[0];
        const msg = errors[firstKey][0];
        
        if (firstKey.toLowerCase().includes('ngaymua')) {
          errorMessage = `Ngày Mua: ${msg}`;
        } else {
          errorMessage = msg;
        }
      }
    } else if (err.status === 409) {
      errorMessage = 'Dữ liệu đã bị thay đổi bởi người khác. Vui lòng tải lại trang.';
    } else if (typeof err.error === 'string') {
      errorMessage = err.error;
    } else if (err.message) {
      errorMessage = err.message;
    }

    console.error('Failed to save device:', err);
    this.toastService.showError(errorMessage);
  }
}