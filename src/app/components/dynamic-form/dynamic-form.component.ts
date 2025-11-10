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
  // Make sure to import CommonModule and ReactiveFormsModule
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

  constructor(private fb: FormBuilder) {
    this.dynamicForm = this.fb.group({});
  }

  ngOnInit(): void {
    if (this.formConfig) {
      this.buildForm();
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    // If the config is passed in late (e.g., from an API call),
    // we need to rebuild the form when it arrives.
    if (changes['formConfig'] && changes['formConfig'].currentValue) {
      this.buildForm();
    }
  }

  /**
   * Dynamically builds the FormGroup from the formConfig input.
   */
  private buildForm(): void {
    const formGroup: { [key: string]: FormControl } = {};

    for (const row of this.formConfig.formRows) {
      for (const control of row.controls) {
        const controlValue = control.value ?? null;
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
    if (validatorsConfig.email) {
      validators.push(Validators.email);
    }
    if (validatorsConfig.pattern) {
      validators.push(Validators.pattern(validatorsConfig.pattern));
    }
    // ... add more as needed
    
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
        return controlConfig.validationMessages[errorKey];
      }
    }

    return 'Trường này không hợp lệ.'; // Generic fallback
  }
}