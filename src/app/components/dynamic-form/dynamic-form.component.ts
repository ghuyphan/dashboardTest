// src/app/components/dynamic-form/dynamic-form.component.ts
import { Component, Input, Output, EventEmitter, OnInit, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  FormBuilder,
  FormGroup,
  Validators,
  ReactiveFormsModule,
  FormControl,
} from '@angular/forms';

@Component({
  selector: 'app-dynamic-form',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './dynamic-form.component.html',
  styleUrl: './dynamic-form.component.scss',
})
export class DynamicFormComponent implements OnInit, OnChanges {
  @Input() formConfig: any;
  @Input() isLoading: boolean = false;
  
  @Output() formSubmitted = new EventEmitter<any>();
  @Output() formCancelled = new EventEmitter<void>();

  public dynamicForm: FormGroup;
  
  // --- ADDITION: Formatter for currency ---
  private currencyFormatter = new Intl.NumberFormat('en-US');

  constructor(private fb: FormBuilder) {
    this.dynamicForm = this.fb.group({});
  }

  ngOnInit(): void {
    if (this.formConfig) {
      this.buildForm();
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['formConfig'] && changes['formConfig'].currentValue) {
      this.buildForm();
    }
  }

  private buildForm(): void {
    const formGroup: { [key: string]: FormControl } = {};

    for (const row of this.formConfig.formRows) {
      for (const control of row.controls) {
        
        // --- MODIFICATION: Clean currency value before setting ---
        let controlValue = control.value ?? null;
        if (control.controlType === 'currency') {
          // Ensure the initial value in the form model is a clean number
          controlValue = this.cleanCurrency(controlValue);
        }
        // --- END MODIFICATION ---
        
        const controlValidators = this.buildValidators(control.validators);
        
        formGroup[control.controlName] = new FormControl(
          controlValue,
          controlValidators
        );
      }
    }
    this.dynamicForm = new FormGroup(formGroup);
  }

  /**
   * Helper function to parse validator config into Angular Validators.
   */
  private buildValidators(validatorsConfig: any): any[] {
    if (!validatorsConfig) {
      return [];
    }
    const validators = [];
    if (validatorsConfig.required) {
      validators.push(Validators.required);
    }
    if (validatorsConfig.minLength) {
      validators.push(Validators.minLength(validatorsConfig.minLength));
    }
    // --- START OF BEST PRACTICE ADDITIONS ---
    if (validatorsConfig.maxLength) {
      validators.push(Validators.maxLength(validatorsConfig.maxLength));
    }
    if (validatorsConfig.email) {
      validators.push(Validators.email);
    }
    if (validatorsConfig.pattern) {
      validators.push(Validators.pattern(validatorsConfig.pattern));
    }
    if (validatorsConfig.min) {
      validators.push(Validators.min(validatorsConfig.min));
    }
    if (validatorsConfig.max) {
      validators.push(Validators.max(validatorsConfig.max));
    }
    // --- END OF BEST PRACTICE ADDITIONS ---
    
    return validators;
  }

  /**
   * Handles the form submission.
   * Emits the form value up to the parent component.
   */
  public onSave(): void {
    if (this.dynamicForm.invalid) {
      this.dynamicForm.markAllAsTouched();
      return;
    }
    // We don't save here. We just emit!
    this.formSubmitted.emit(this.dynamicForm.value);
  }

  /**
   * Emits the cancel event.
   */
  public onCancel(): void {
    this.formCancelled.emit();
  }

  /**
   * Helper for form validation.
   */
  public isInvalid(controlName: string): boolean {
    const control = this.dynamicForm.get(controlName);
    return !!control && control.invalid && (control.dirty || control.touched);
  }

  /**
   * Helper to get the first validation error message.
   */
  public getErrorMessage(controlConfig: any): string {
    const control = this.dynamicForm.get(controlConfig.controlName);
    if (!control || !control.errors || !controlConfig.validationMessages) {
      return '';
    }

    for (const errorKey in control.errors) {
      if (controlConfig.validationMessages[errorKey]) {
        // --- BEST PRACTICE: Add support for maxLength message ---
        if (errorKey === 'maxLength') {
          // Example: "Tên không được vượt quá 100 ký tự."
          return controlConfig.validationMessages[errorKey];
        }
        if (errorKey === 'max') {
           // Example: "Giá mua không hợp lệ (tối đa 10 tỷ)."
          return controlConfig.validationMessages[errorKey];
        }
        if (errorKey === 'pattern') {
          // Example: "Mã chỉ chứa chữ, số, gạch ngang, gạch dưới."
          return controlConfig.validationMessages[errorKey];
        }
        // --- END ADDITION ---
        return controlConfig.validationMessages[errorKey];
      }
    }

    return 'Trường này không hợp lệ.'; // Generic fallback
  }

  /**
   * Cleans a value (string or number) into a clean number or null.
   * e.g., "1,000" -> 1000
   * e.g., "abc" -> null
   */
  private cleanCurrency(value: any): number | null {
    if (value === null || value === undefined) return null;
    
    // Remove all non-numeric characters except a potential decimal point
    let stringValue = String(value).replace(/[^0-9.]+/g, '');
    let numberValue = parseFloat(stringValue);

    return isNaN(numberValue) ? null : numberValue;
  }

  /**
   * Formats a raw number from the form control into a displayed string.
   * e.g., 1000000 -> "1,000,000"
   */
  public formatCurrency(value: any): string {
    const numberValue = this.cleanCurrency(value);
    if (numberValue === null) {
      return '';
    }
    // Use en-US locale for standard comma separators (e.g., 1,000,000)
    return this.currencyFormatter.format(numberValue);
  }

  /**
   * Handles the (input) event on currency fields.
   * Updates the form control with the raw number and formats the displayed value.
   */
  public onCurrencyInput(event: Event, controlName: string): void {
    const inputElement = event.target as HTMLInputElement;
    const control = this.dynamicForm.get(controlName);
    if (!control) return;

    const rawValue = this.cleanCurrency(inputElement.value);

    control.setValue(rawValue, { emitEvent: false }); // Emit is false

    // --- CRITICAL FIX: Manually set dirty/touched flags ---
    if (!control.touched) {
      control.markAsTouched();
    }

    this.dynamicForm.markAsDirty();
    // --------------------------------------------------------

    // Re-format the displayed value
    const formattedValue = this.formatCurrency(rawValue);
    
    // Set the display value directly
    inputElement.value = formattedValue;
  }
}