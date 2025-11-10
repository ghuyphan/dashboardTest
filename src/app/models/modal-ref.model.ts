// src/app/models/modal-ref.model.ts

import { InjectionToken }from '@angular/core';
import { OverlayRef }from '@angular/cdk/overlay';
import { Subject, Observable }from 'rxjs';
import { ModalOptions }from './modal-options.model';

/**
 * Injection token that can be used to pass data to the modal component.
 */
export const MODAL_OPTIONS = new InjectionToken<ModalOptions>('MODAL_OPTIONS');

/**
 * A reference to the currently open modal.
 * This is injected into the ModalComponent and the component
 * that is dynamically loaded.
 */
export class ModalRef {
  private _afterClosed = new Subject<any>();

  /**
   * An observable that emits when the modal is closed.
   */
  afterClosed: Observable<any> = this._afterClosed.asObservable();

  constructor(private overlayRef: OverlayRef) {}

  /**
   * Closes the modal and optionally passes data back.
   * @param data The data to return.
   */
  close(data?: any): void {
    // 1. Dispose the overlay
    this.overlayRef.dispose();

    // 2. Emit the close event
    this._afterClosed.next(data);
    this._afterClosed.complete();
  }
}