import {
  Component,
  OnInit,
  ChangeDetectionStrategy,
  inject,
  input,
  output,
  effect,
  ViewEncapsulation,
  signal,
  OnDestroy
} from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common'; // Added DatePipe
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

// [NEW] Datepicker Imports
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule, MAT_DATE_LOCALE, provideNativeDateAdapter } from '@angular/material/core';
import { BreakpointObserver, Breakpoints } from '@angular/cdk/layout';
import { Subject, takeUntil } from 'rxjs';

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
    MatInputModule,
    // [NEW]
    MatDatepickerModule,
    MatNativeDateModule
  ],
  providers: [
    DatePipe,
    provideNativeDateAdapter(),
    { provide: MAT_DATE_LOCALE, useValue: 'vi-VN' }
  ],
  templateUrl: './dynamic-form.component.html',
  styleUrl: './dynamic-form.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None
})
export class DynamicFormComponent implements OnInit, OnDestroy {
  public formConfig = input<FormConfig | undefined>();
  public isLoading = input<boolean>(false);

  public formSubmitted = output<DynamicFormValue>();
  public formCancelled = output<void>();
  public formReady = output<FormGroup>();

  public dynamicForm: FormGroup<Record<string, FormControl<any>>>;

  // [NEW] Mobile Detection
  public isMobile = signal<boolean>(false);
  private destroy$ = new Subject<void>();
  private breakpointObserver = inject(BreakpointObserver);

  private readonly fb = inject(FormBuilder);
  private readonly currencyFormatter = new Intl.NumberFormat(CURRENCY_LOCALE);
  private readonly datePipe = inject(DatePipe);

  constructor() {
    this.dynamicForm = this.fb.group<Record<string, FormControl<any>>>({});

    // [NEW] Mobile Logic
    this.breakpointObserver.observe([
      Breakpoints.Handset,
      Breakpoints.TabletPortrait
    ]).pipe(takeUntil(this.destroy$))
      .subscribe(result => {
        this.isMobile.set(result.matches);
      });

    effect(() => {
      const config = this.formConfig();
      if (config) {
        this.buildForm(config);
      }
    });
  }

  ngOnInit(): void { }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private buildForm(config: FormConfig): void {
    const formControls = this.createFormControls(config);
    this.dynamicForm = new FormGroup(formControls);
    this.formReady.emit(this.dynamicForm);
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

    // [NEW] Handle String to Date conversion for Material Datepicker
    if (config.controlType === 'date' && value && typeof value === 'string') {
      // Assuming 'yyyy-MM-dd' or ISO string
      return new Date(value);
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

    // Convert Date objects back to string ('yyyy-MM-dd') before emitting
    const rawValue = this.dynamicForm.getRawValue();
    const formattedValue = this.formatDatesInFormValue(rawValue);

    this.formSubmitted.emit(formattedValue);
  }

  // [NEW] Helper to ensure consistency (BE usually expects strings)
  private formatDatesInFormValue(formValue: DynamicFormValue): DynamicFormValue {
    const newValue = { ...formValue };
    const config = this.formConfig();

    if (!config) return newValue;

    for (const row of config.formRows) {
      for (const control of row.controls) {
        if (control.controlType === 'date' && newValue[control.controlName] instanceof Date) {
          newValue[control.controlName] = this.datePipe.transform(newValue[control.controlName], 'yyyy-MM-dd');
        }
      }
    }
    return newValue;
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
    // If patching dates as strings, we might need to convert them to Dates manually
    // However, MatDatepicker often handles parsing strings if standard format.
    // For robustness, you could intercept here, but typically ReactiveForms 
    // patchValue is direct.
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