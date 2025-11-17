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
        
        let controlValue = control.value ?? null;
        if (control.controlType === 'currency') {
          controlValue = this.cleanCurrency(controlValue);
        }
        
        const controlValidators = this.buildValidators(control.validators);
        
        formGroup[control.controlName] = new FormControl(
          controlValue,
          controlValidators
        );
      }
    }
    this.dynamicForm = new FormGroup(formGroup);
  }

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
    
    return validators;
  }

  public onSave(): void {
    if (this.dynamicForm.invalid) {
      this.dynamicForm.markAllAsTouched();
      return;
    }
    this.formSubmitted.emit(this.dynamicForm.value);
  }

  public onCancel(): void {
    this.formCancelled.emit();
  }

  public isInvalid(controlName: string): boolean {
    const control = this.dynamicForm.get(controlName);
    return !!control && control.invalid && (control.dirty || control.touched);
  }

  public getErrorMessage(controlConfig: any): string {
    const control = this.dynamicForm.get(controlConfig.controlName);
    if (!control || !control.errors || !controlConfig.validationMessages) {
      return '';
    }

    for (const errorKey in control.errors) {
      if (controlConfig.validationMessages[errorKey]) {
        if (errorKey === 'maxLength') {
          return controlConfig.validationMessages[errorKey];
        }
        if (errorKey === 'max') {
          return controlConfig.validationMessages[errorKey];
        }
        if (errorKey === 'pattern') {
          return controlConfig.validationMessages[errorKey];
        }
        return controlConfig.validationMessages[errorKey];
      }
    }

    return 'Trường này không hợp lệ.';
  }

  private cleanCurrency(value: any): number | null {
    if (value === null || value === undefined) return null;
    
    let stringValue = String(value).replace(/[^0-9.]+/g, '');
    let numberValue = parseFloat(stringValue);

    return isNaN(numberValue) ? null : numberValue;
  }

  public formatCurrency(value: any): string {
    const numberValue = this.cleanCurrency(value);
    if (numberValue === null) {
      return '';
    }
    return this.currencyFormatter.format(numberValue);
  }

  public onCurrencyInput(event: Event, controlName: string): void {
    const inputElement = event.target as HTMLInputElement;
    const control = this.dynamicForm.get(controlName);
    if (!control) return;

    const rawValue = this.cleanCurrency(inputElement.value);

    control.setValue(rawValue, { emitEvent: false });

    if (!control.touched) {
      control.markAsTouched();
    }

    this.dynamicForm.markAsDirty();

    const formattedValue = this.formatCurrency(rawValue);
    inputElement.value = formattedValue;
  }
}