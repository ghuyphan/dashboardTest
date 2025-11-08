import { Component, Input, OnInit } from '@angular/core';
import {
  FormBuilder,
  FormGroup,
  Validators,
  ReactiveFormsModule,
} from '@angular/forms';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { finalize } from 'rxjs/operators';

import { ModalService } from '../../services/modal.service';
import { environment } from '../../../environments/environment.development';
// Assume you have a toast service for notifications
// import { ToastService } from '../../services/toast.service';

@Component({
  selector: 'app-device-form',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule], // Import ReactiveFormsModule
  templateUrl: './device-form.component.html',
  styleUrl: './device-form.component.scss',
})
export class DeviceFormComponent implements OnInit {
  // --- Data passed in from the modal context ---
  /**
   * The device object to edit. If null, we are in "Create" mode.
   */
  @Input() device: any | null = null;
  
  /**
   * A title passed from the modal context.
   */
  @Input() title: string = 'Device Form';

  // --- Component Properties ---
  public deviceForm: FormGroup;
  public isEditMode: boolean = false;
  public isLoading: boolean = false;
  
  // Hardcoded for example. In a real app, you'd fetch these.
  public deviceTypes: any[] = [
    { id: 1, ten: 'Máy thở' },
    { id: 2, ten: 'Monitor' },
    { id: 3, ten: 'Bơm tiêm điện' },
  ];
  public deviceStatuses: string[] = ['Sẵn sàng', 'Đang sử dụng', 'Bảo trì'];

  constructor(
    private fb: FormBuilder,
    private modalService: ModalService,
    private http: HttpClient
    // private toastService: ToastService 
  ) {
    // Initialize the form
    this.deviceForm = this.fb.group({
      Ma: ['', Validators.required],
      Ten: ['', Validators.required],
      Model: [''],
      SerialNumber: [''],
      ViTri: [''],
      LoaiThietBi_Id: [null, Validators.required], // Matches 'deviceTypes' id
      TrangThai_Ten: [this.deviceStatuses[0], Validators.required], // Default to 'Sẵn sàng'
      // Read-only fields are not part of the form
    });
  }

  ngOnInit(): void {
    this.isEditMode = !!this.device; // true if device is not null

    if (this.isEditMode) {
      // We have a device, patch the form with its data
      this.deviceForm.patchValue(this.device);
    }
  }

  /**
   * Handles the form submission.
   * Performs a POST (Create) or PUT (Update) operation.
   */
  public onSave(): void {
    if (this.deviceForm.invalid) {
      // Mark all fields as touched to show validation errors
      this.deviceForm.markAllAsTouched();
      return;
    }

    this.isLoading = true;
    const formData = this.deviceForm.value;
    const apiUrl = environment.equipmentCatUrl;

    let saveObservable;

    if (this.isEditMode) {
      // --- Update (PUT) ---
      const updateUrl = `${apiUrl}/${this.device.Id}`;
      saveObservable = this.http.put(updateUrl, { ...this.device, ...formData });
    } else {
      // --- Create (POST) ---
      // We don't have NguoiTao, NgayTao, etc.
      // The server should handle setting those fields.
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
          
          // --- THIS IS KEY ---
          // Close the modal and pass the *new/updated* device data back
          this.modalService.close(savedDevice);
        },
        error: (err) => {
          // this.toastService.showError('Lưu thất bại!');
          console.error('Failed to save device:', err);
        },
      });
  }

  /**
   * Closes the modal without saving (passes no data).
   */
  public onCancel(): void {
    this.modalService.close(); // No data means "cancel"
  }

  // --- Helper for form validation ---
  public isInvalid(controlName: string): boolean {
    const control = this.deviceForm.get(controlName);
    return !!control && control.invalid && (control.dirty || control.touched);
  }
}