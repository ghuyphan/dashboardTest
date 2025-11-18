import {
  Component,
  Input,
  Output,
  EventEmitter,
  OnInit,
  OnChanges,
  SimpleChanges,
  ChangeDetectionStrategy,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  FormBuilder,
  FormGroup,
  Validators,
  ReactiveFormsModule,
  FormControl,
  ValidatorFn,
  AbstractControl,
} from '@angular/forms';

// Constants
const CURRENCY_LOCALE = 'en-US';
const CURRENCY_CLEAN_REGEX = /[^0-9.]+/g;
const DEFAULT_VALIDATION_MESSAGE = 'Trường này không hợp lệ.';

// Interfaces
interface FormControlConfig {
  controlName: string;
  controlType: string;
  label?: string;
  value?: any;
  disabled?: boolean;
  validators?: ValidatorsConfig;
  validationMessages?: Record<string, string>;
  placeholder?: string;
  options?: any[];
}

interface FormRowConfig {
  controls: FormControlConfig[];
}

interface FormConfig {
  formRows: FormRowConfig[];
}

interface ValidatorsConfig {
  required?: boolean;
  minLength?: number;
  maxLength?: number;
  email?: boolean;
  pattern?: string | RegExp;
  min?: number;
  max?: number;
}

@Component({
  selector: 'app-dynamic-form',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './dynamic-form.component.html',
  styleUrl: './dynamic-form.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DynamicFormComponent implements OnInit, OnChanges {
  // Inputs
  @Input() formConfig?: FormConfig;
  @Input() isLoading = false;

  // Outputs
  @Output() formSubmitted = new EventEmitter<any>();
  @Output() formCancelled = new EventEmitter<void>();

  // Public Properties
  public dynamicForm: FormGroup;

  // Private Properties
  private readonly fb = inject(FormBuilder);
  private readonly currencyFormatter = new Intl.NumberFormat(CURRENCY_LOCALE);

  constructor() {
    this.dynamicForm = this.fb.group({});
  }

  ngOnInit(): void {
    if (this.formConfig) {
      this.buildForm();
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['formConfig']?.currentValue) {
      this.buildForm();
    }
  }

  /**
   * Builds the reactive form based on configuration
   */
  private buildForm(): void {
    if (!this.formConfig) {
      return;
    }

    const formControls = this.createFormControls();
    this.dynamicForm = new FormGroup(formControls);
  }

  /**
   * Creates form controls from configuration
   */
  private createFormControls(): Record<string, FormControl> {
    const formGroup: Record<string, FormControl> = {};

    if (!this.formConfig) {
      return formGroup;
    }

    for (const row of this.formConfig.formRows) {
      for (const control of row.controls) {
        formGroup[control.controlName] = this.createFormControl(control);
      }
    }

    return formGroup;
  }

  /**
   * Creates a single form control from configuration
   */
  private createFormControl(config: FormControlConfig): FormControl {
    const value = this.prepareControlValue(config);
    const validators = this.buildValidators(config.validators);
    const disabled = config.disabled || false;

    return new FormControl({ value, disabled }, validators);
  }

  /**
   * Prepares control value based on control type
   */
  private prepareControlValue(config: FormControlConfig): any {
    const value = config.value ?? null;

    if (config.controlType === 'currency') {
      return this.cleanCurrency(value);
    }

    return value;
  }

  /**
   * Builds validators array from configuration
   */
  private buildValidators(validatorsConfig?: ValidatorsConfig): ValidatorFn[] {
    if (!validatorsConfig) {
      return [];
    }

    const validators: ValidatorFn[] = [];

    const validatorMap: Record<
      keyof ValidatorsConfig,
      (value: any) => ValidatorFn | null
    > = {
      required: () => Validators.required,
      minLength: (val) => Validators.minLength(val),
      maxLength: (val) => Validators.maxLength(val),
      email: () => Validators.email,
      pattern: (val) => Validators.pattern(val),
      min: (val) => Validators.min(val),
      max: (val) => Validators.max(val),
    };

    for (const [key, createValidator] of Object.entries(validatorMap)) {
      const configValue = validatorsConfig[key as keyof ValidatorsConfig];
      if (configValue !== undefined && configValue !== false) {
        const validator = createValidator(configValue);
        if (validator) {
          validators.push(validator);
        }
      }
    }

    return validators;
  }

  /**
   * Handles form save action
   */
  public onSave(): void {
    if (this.dynamicForm.invalid) {
      this.markAllControlsAsTouched();
      return;
    }

    const formValue = this.dynamicForm.getRawValue();
    this.formSubmitted.emit(formValue);
  }

  /**
   * Marks all form controls as touched to show validation errors
   */
  private markAllControlsAsTouched(): void {
    this.dynamicForm.markAllAsTouched();
  }

  /**
   * Handles form cancel action
   */
  public onCancel(): void {
    this.formCancelled.emit();
  }

  /**
   * Checks if a control is invalid and should show error
   */
  public isInvalid(controlName: string): boolean {
    const control = this.getControl(controlName);
    return control
      ? control.invalid && (control.dirty || control.touched)
      : false;
  }

  /**
   * Gets error message for a control
   */
  public getErrorMessage(controlConfig: FormControlConfig): string {
    const control = this.getControl(controlConfig.controlName);

    if (!control?.errors || !controlConfig.validationMessages) {
      return '';
    }

    return this.findFirstErrorMessage(control, controlConfig.validationMessages);
  }

  /**
   * Finds the first error message that matches control errors
   */
  private findFirstErrorMessage(
    control: AbstractControl,
    validationMessages: Record<string, string>
  ): string {
    if (!control.errors) {
      return '';
    }

    for (const errorKey of Object.keys(control.errors)) {
      if (validationMessages[errorKey]) {
        return validationMessages[errorKey];
      }
    }

    return DEFAULT_VALIDATION_MESSAGE;
  }

  /**
   * Gets a form control by name
   */
  private getControl(controlName: string): AbstractControl | null {
    return this.dynamicForm.get(controlName);
  }

  /**
   * Cleans currency string to number
   */
  private cleanCurrency(value: any): number | null {
    if (value === null || value === undefined || value === '') {
      return null;
    }

    const stringValue = String(value).replace(CURRENCY_CLEAN_REGEX, '');
    const numberValue = parseFloat(stringValue);

    return isNaN(numberValue) ? null : numberValue;
  }

  /**
   * Formats number as currency string
   */
  public formatCurrency(value: any): string {
    const numberValue = this.cleanCurrency(value);

    if (numberValue === null) {
      return '';
    }

    return this.currencyFormatter.format(numberValue);
  }

  /**
   * Handles currency input events with formatting
   */
  public onCurrencyInput(event: Event, controlName: string): void {
    const inputElement = event.target as HTMLInputElement;
    const control = this.getControl(controlName);

    if (!control) {
      return;
    }

    this.updateCurrencyControl(control, inputElement);
  }

  /**
   * Updates currency control value and formatting
   */
  private updateCurrencyControl(
    control: AbstractControl,
    inputElement: HTMLInputElement
  ): void {
    const rawValue = this.cleanCurrency(inputElement.value);

    // Update control value without triggering value changes
    control.setValue(rawValue, { emitEvent: false });

    // Mark as touched if not already
    if (!control.touched) {
      control.markAsTouched();
    }

    // Mark form as dirty
    this.dynamicForm.markAsDirty();

    // Update input display with formatted value
    inputElement.value = this.formatCurrency(rawValue);
  }

  /**
   * Resets the form to initial state
   */
  public resetForm(): void {
    this.dynamicForm.reset();
  }

  /**
   * Gets form value including disabled controls
   */
  public getFormValue(): any {
    return this.dynamicForm.getRawValue();
  }

  /**
   * Checks if form is valid
   */
  public isFormValid(): boolean {
    return this.dynamicForm.valid;
  }

  /**
   * Checks if form has been modified
   */
  public isFormDirty(): boolean {
    return this.dynamicForm.dirty;
  }

  /**
   * Patches form values
   */
  public patchFormValues(values: any): void {
    this.dynamicForm.patchValue(values);
  }

  /**
   * Enables a form control
   */
  public enableControl(controlName: string): void {
    this.getControl(controlName)?.enable();
  }

  /**
   * Disables a form control
   */
  public disableControl(controlName: string): void {
    this.getControl(controlName)?.disable();
  }

  /**
   * Gets all form controls
   */
  public getControls(): Record<string, AbstractControl> {
    return this.dynamicForm.controls;
  }

  /**
   * Validates a specific control
   */
  public validateControl(controlName: string): boolean {
    const control = this.getControl(controlName);
    if (control) {
      control.markAsTouched();
      control.updateValueAndValidity();
      return control.valid;
    }
    return false;
  }
}