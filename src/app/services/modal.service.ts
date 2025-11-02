import { Injectable, Type } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { ModalOptions } from '../models/modal-options.model';

@Injectable({
  providedIn: 'root'
})
export class ModalService {
  // BehaviorSubject holds the current modal configuration, or null if closed.
  private modalSubject = new BehaviorSubject<ModalOptions | null>(null);
  
  /**
   * Observable stream of the current modal state.
   * Components can subscribe to this to show/hide the modal.
   */
  modalState$: Observable<ModalOptions | null> = this.modalSubject.asObservable();

  constructor() { }

  /**
   * Opens the modal with a specified component and configuration.
   *
   * @param component The component class (Type<any>) to render inside the modal.
   * @param options Optional configuration (title, context, etc.)
   */
  open(component: Type<any>, options?: Omit<ModalOptions, 'component'>): void {
    const modalOptions: ModalOptions = {
      component,
      ...options
    };
    this.modalSubject.next(modalOptions);
  }

  /**
   * Closes the currently open modal.
   */
  close(): void {
    this.modalSubject.next(null);
  }
}