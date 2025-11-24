import {
  Component,
  OnInit,
  ChangeDetectionStrategy,
  inject,
  input,
  output, // Import output function
  effect,
  ViewEncapsulation
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

import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';

const CURRENCY_LOCALE = 'en-US';
const CURRENCY_CLEAN_REGEX = /[^0-9.]+/g;
const DEFAULT_VALIDATION_MESSAGE = 'Trường này không hợp lệ.';

export interface FormControlConfig {
  controlName: string;
  controlType: string;
  label?: string;
  value?: any;
  disabled?: boolean;
  validators?: ValidatorsConfig;
  validationMessages?: Record<string, string>;
  placeholder?: string;
  options?: any[];
  layout_flexGrow?: number;
}

export interface FormRowConfig {
  controls: FormControlConfig[];
}

export interface FormConfig {
  formRows: FormRowConfig[];
}

export interface ValidatorsConfig {
  required?: boolean;
  minLength?: number;
  maxLength?: number;
  email?: boolean;
  pattern?: string | RegExp;
  min?: number;
  max?: number;
}

export type DynamicFormValue = Record<string, any>;

@Component({
  selector: 'app-dynamic-form',
  standalone: true,
  imports: [
    CommonModule, 
    ReactiveFormsModule, 
    MatSelectModule, 
    MatFormFieldModule,
    MatInputModule
  ],
  templateUrl: './dynamic-form.component.html',
  styleUrl: './dynamic-form.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None 
})
export class DynamicFormComponent implements OnInit {
  // --- MODERN SIGNALS ---
  public formConfig = input<FormConfig | undefined>();
  public isLoading = input<boolean>(false);

  // Modern Outputs
  public formSubmitted = output<DynamicFormValue>();
  public formCancelled = output<void>();

  public dynamicForm: FormGroup<Record<string, FormControl<any>>>;

  private readonly fb = inject(FormBuilder);
  private readonly currencyFormatter = new Intl.NumberFormat(CURRENCY_LOCALE);

  constructor() {
    this.dynamicForm = this.fb.group<Record<string, FormControl<any>>>({});
    
    effect(() => {
      const config = this.formConfig();
      if (config) {
        this.buildForm(config);
      }
    });
  }

  ngOnInit(): void {}

  private buildForm(config: FormConfig): void {
    const formControls = this.createFormControls(config);
    this.dynamicForm = new FormGroup(formControls);
  }

  private createFormControls(config: FormConfig): Record<string, FormControl<any>> {
    const formGroup: Record<string, FormControl<any>> = {};

    for (const row of config.formRows) {
      for (const control of row.controls) {
        formGroup[control.controlName] = this.createFormControl(control);
      }
    }
    return formGroup;
  }

  private createFormControl(config: FormControlConfig): FormControl<any> {
    const value = this.prepareControlValue(config);
    const validators = this.buildValidators(config.validators);
    return new FormControl<any>({ value, disabled: config.disabled ?? false }, validators);
  }

  private prepareControlValue(config: FormControlConfig): any {
    const value = config.value ?? null;
    if (config.controlType === 'currency') {
      return this.cleanCurrency(value);
    }
    return value;
  }

  private buildValidators(validatorsConfig?: ValidatorsConfig): ValidatorFn[] {
    if (!validatorsConfig) return [];

    const validators: ValidatorFn[] = [];
    const validatorMap: Record<keyof ValidatorsConfig, (value: any) => ValidatorFn | null> = {
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
        if (validator) validators.push(validator);
      }
    }
    return validators;
  }

  public onSave(): void {
    if (this.dynamicForm.invalid) {
      this.markAllControlsAsTouched();
      return;
    }
    const formValue = this.dynamicForm.getRawValue();
    this.formSubmitted.emit(formValue);
  }

  private markAllControlsAsTouched(): void {
    this.dynamicForm.markAllAsTouched();
  }

  public onCancel(): void {
    this.formCancelled.emit();
  }

  public isInvalid(controlName: string): boolean {
    const control = this.getControl(controlName);
    return control ? control.invalid && (control.dirty || control.touched) : false;
  }

  public getErrorMessage(controlConfig: FormControlConfig): string {
    const control = this.getControl(controlConfig.controlName);
    if (!control?.errors || !controlConfig.validationMessages) {
      return '';
    }
    return this.findFirstErrorMessage(control, controlConfig.validationMessages);
  }

  private findFirstErrorMessage(
    control: AbstractControl,
    validationMessages: Record<string, string>
  ): string {
    if (!control.errors) return '';
    for (const errorKey of Object.keys(control.errors)) {
      if (validationMessages[errorKey]) {
        return validationMessages[errorKey];
      }
    }
    return DEFAULT_VALIDATION_MESSAGE;
  }

  private getControl(controlName: string): FormControl<any> | null {
    return this.dynamicForm.get(controlName) as FormControl<any> | null;
  }

  private cleanCurrency(value: any): number | null {
    if (value === null || value === undefined || value === '') {
      return null;
    }
    const stringValue = String(value).replace(CURRENCY_CLEAN_REGEX, '');
    const numberValue = parseFloat(stringValue);
    return isNaN(numberValue) ? null : numberValue;
  }

  public formatCurrency(value: any): string {
    const numberValue = this.cleanCurrency(value);
    if (numberValue === null) return '';
    return this.currencyFormatter.format(numberValue);
  }

  public onCurrencyInput(event: Event, controlName: string): void {
    const inputElement = event.target as HTMLInputElement;
    const control = this.getControl(controlName);
    if (!control) return;
    this.updateCurrencyControl(control, inputElement);
  }

  private updateCurrencyControl(
    control: FormControl<any>,
    inputElement: HTMLInputElement
  ): void {
    const rawValue = this.cleanCurrency(inputElement.value);
    control.setValue(rawValue, { emitEvent: false });
    if (!control.touched) control.markAsTouched();
    this.dynamicForm.markAsDirty();
    inputElement.value = this.formatCurrency(rawValue);
  }

  // Public API methods (kept for compatibility with parent via viewChild)
  public resetForm(): void {
    this.dynamicForm.reset();
  }

  public getFormValue(): DynamicFormValue {
    return this.dynamicForm.getRawValue();
  }

  public isFormValid(): boolean {
    return this.dynamicForm.valid;
  }

  public isFormDirty(): boolean {
    return this.dynamicForm.dirty;
  }

  public patchFormValues(values: Partial<DynamicFormValue>): void {
    this.dynamicForm.patchValue(values);
  }

  public enableControl(controlName: string): void {
    this.getControl(controlName)?.enable();
  }

  public disableControl(controlName: string): void {
    this.getControl(controlName)?.disable();
  }

  public getControls(): Record<string, FormControl<any>> {
    return this.dynamicForm.controls;
  }

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