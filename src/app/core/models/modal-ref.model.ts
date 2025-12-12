import { InjectionToken } from '@angular/core';
import { OverlayRef } from '@angular/cdk/overlay';
import { Subject, Observable, of, from } from 'rxjs';
import { first } from 'rxjs/operators';
import { ModalOptions } from './modal-options.model';

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

  /**
   * A function that returns a boolean, Promise<boolean>, or Observable<boolean>.
   * If it returns false (or a Promise/Observable that emits false),
   * the modal will not close.
   */
  public canClose: () => Observable<boolean> | Promise<boolean> | boolean =
    () => true;

  constructor(private overlayRef: OverlayRef) {}

  /**
   * Closes the modal and optionally passes data back.
   * Checks the `canClose` guard before closing.
   * @param data The data to return.
   */
  close(data?: any): void {
    const guardResult = this.canClose();
    let canClose$: Observable<boolean>;

    // Normalize the guard result to an Observable
    if (typeof guardResult === 'boolean') {
      canClose$ = of(guardResult);
    } else if (guardResult instanceof Promise) {
      canClose$ = from(guardResult);
    } else {
      // Assumed Observable
      canClose$ = guardResult;
    }

    // Subscribe to the guard result
    canClose$
      .pipe(first()) // We only care about the first emission
      .subscribe(canClose => {
        // Only close if the guard returned true
        if (canClose) {
          // Dispose the overlay
          this.overlayRef.dispose();

          // Emit the close event
          this._afterClosed.next(data);
          this._afterClosed.complete();
        }
        // If 'canClose' is false, do nothing. The modal stays open.
      });
  }
}
