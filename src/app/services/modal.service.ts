import { Injectable, Type } from '@angular/core';
// CHANGED: Added Subject
import { BehaviorSubject, Observable, Subject } from 'rxjs';
import { ModalOptions } from '../models/modal-options.model';

@Injectable({
  providedIn: 'root',
})
export class ModalService {
  private modalSubject = new BehaviorSubject<ModalOptions | null>(null);
  modalState$: Observable<ModalOptions | null> = this.modalSubject.asObservable();

  // CHANGED: This subject handles the data returned on close
  private modalCloseSubject: Subject<any> | null = null;

  constructor() {}

  /**
   * Opens the modal with a specified component and configuration.
   *
   * @param component The component class (Type<any>) to render inside the modal.
   * @param options Optional configuration (title, context, etc.)
   * @returns An Observable that emits data when the modal is closed.
   */
  open(
    component: Type<any>,
    options?: Omit<ModalOptions, 'component'>
  ): Observable<any> { // <-- CHANGED: Returns Observable
    const modalOptions: ModalOptions = {
      component,
      ...options,
    };
    
    // Create a new subject for this specific modal instance
    this.modalCloseSubject = new Subject<any>();
    this.modalSubject.next(modalOptions);

    // Return the observable for the caller to subscribe to
    return this.modalCloseSubject.asObservable();
  }

  /**
   * Closes the currently open modal and optionally passes data back.
   *
   * @param data The data to return to the caller of open()
   */
  close(data?: any): void { // <-- CHANGED: Accepts data
    this.modalSubject.next(null);

    // If a subject exists, emit the data and complete it
    if (this.modalCloseSubject) {
      this.modalCloseSubject.next(data);
      this.modalCloseSubject.complete();
      this.modalCloseSubject = null;
    }
  }
}