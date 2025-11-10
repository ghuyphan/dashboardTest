// src/app/device-list/device-form/device-form.component.ts
import { Component, Input, OnInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
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
// import { ToastService } from '../../services/toast.service';

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
    private authService: AuthService 
    // private toastService: ToastService
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
        // this.toastService.showError('Không thể tải dữ liệu cho biểu mẫu');
        this.modalRef?.close(); 
      }
    );

    if (this.modalRef) {
      this.modalRef.canClose = () => this.canDeactivate();
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
              controlType: 'text', // Use 'date' if you add that type to DynamicForm
              label: 'Ngày mua',
              placeholder: 'DD/MM/YYYY',
              value: deviceData.NgayMua || '', // Needs date formatting if not string
              validators: {},
              layout_flexGrow: 1,
            },
            {
              controlName: 'NgayHetHanBH',
              controlType: 'text', // Use 'date'
              label: 'Ngày hết hạn BH',
              placeholder: 'DD/MM/YYYY',
              value: deviceData.NgayHetHanBH || '', // Needs date formatting
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
    const currentUserId = this.authService.getUserId();

    if (!currentUserId) {
      // this.toastService.showError('Lỗi xác thực người dùng. Vui lòng đăng nhập lại.');
      console.error('User ID is missing, cannot save.');
      this.isLoading = false;
      return;
    }

    let saveObservable;

    if (entityId) {
      // --- UPDATE (PUT) ---
      // We merge the original device data with the new form data
      // This preserves fields not in the form (like HL, NgayTao)
      const updatePayload = {
        ...this.device,
        ...formData,
        USER_: currentUserId 
      };

      // Clean up null/empty strings for date/number fields if needed
      updatePayload.NgayMua = formData.NgayMua || null;
      updatePayload.GiaMua = formData.GiaMua || null;
      updatePayload.NgayHetHanBH = formData.NgayHetHanBH || null;
      
      const updateUrl = `${apiUrl}/${entityId}`;
      saveObservable = this.http.put(updateUrl, updatePayload);

    } else {
      // --- CREATE (POST) ---
      // We create the payload from scratch to match your model
      const createPayload = {
        Id: 0,
        Ma: formData.Ma,
        Ten: formData.Ten,
        SerialNumber: formData.SerialNumber || '',
        Model: formData.Model || '',
        TrangThai: formData.TrangThai, // This is the ID from the form
        ViTri: formData.ViTri || '',
        NgayMua: formData.NgayMua || null,
        GiaMua: formData.GiaMua || null,
        NgayHetHanBH: formData.NgayHetHanBH || null,
        MoTa: formData.MoTa || '',
        CategoryID: formData.CategoryID, // This is the ID from the form
        DeviceName: formData.DeviceName || '',
        USER_: currentUserId,
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
        next: (savedDevice) => {
          // this.toastService.showSuccess('Lưu thành công!');
          console.log('Save successful', savedDevice);
          if (this.modalRef) {
            this.modalRef.canClose = () => true;
          }
          this.modalRef?.close(savedDevice);
        },
        error: (err) => {
          // this.toastService.showError('Lưu thất bại!');
          console.error('Failed to save device:', err);
        },
      });
  }

  public onCancel(): void {
    this.modalRef?.close();
  }
}