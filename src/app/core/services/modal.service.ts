import { Injectable, Type, Injector } from '@angular/core';
import { Observable } from 'rxjs';
import { Overlay, OverlayConfig, OverlayRef } from '@angular/cdk/overlay';
import { ComponentPortal } from '@angular/cdk/portal';

import { ModalOptions } from '../models/modal-options.model';
import { ModalRef, MODAL_OPTIONS } from '../models/modal-ref.model';
import { ModalComponent } from '../../shared/components/modal/modal.component';

@Injectable({
  providedIn: 'root',
})
export class ModalService {

  // Inject the CDK Overlay and Angular's Injector
  constructor(private overlay: Overlay, private injector: Injector) { }

  /**
   * Opens the modal with a specified component and configuration.
   *
   * @template T The component type to render
   * @template R The return type of the modal result
   * @param component The component class (Type<T>) to render inside the modal.
   * @param options Optional configuration (title, context, etc.)
   * @returns An Observable<R> that emits data when the modal is closed.
   */
  open<T, R = any>(
    component: Type<T>,
    options?: Omit<ModalOptions, 'component'>
  ): Observable<R | undefined> {

    // Combine component and options
    const modalOptions: ModalOptions = {
      component,
      ...options,
    };

    // Create the overlay
    const overlayRef = this.createOverlay(modalOptions);

    // Create the ModalRef
    const modalRef = new ModalRef(overlayRef);

    // Create the injector
    const injector = this.createInjector(modalOptions, modalRef);

    // Create the portal
    const portal = new ComponentPortal(ModalComponent, null, injector);

    // Attach the portal to the overlay
    overlayRef.attach(portal);

    // Handle backdrop click to close
    if (!modalOptions.disableBackdropClose) {
      overlayRef.backdropClick().subscribe(() => {
        modalRef.close();
      });
    }

    // Return the observable for the caller to subscribe to
    // Cast to Observable<R> to match the generic signature
    return modalRef.afterClosed as Observable<R | undefined>;
  }

  /**
   * Creates the CDK Overlay configuration.
   */
  private createOverlay(options: ModalOptions): OverlayRef {
    const positionStrategy = this.overlay
      .position()
      .global()
      .centerHorizontally()
      .centerVertically();

    const overlayConfig = new OverlayConfig({
      hasBackdrop: true,
      backdropClass: 'app-modal-backdrop',
      panelClass: 'app-modal-panel',
      positionStrategy,
    });

    return this.overlay.create(overlayConfig);
  }

  /**
   * Creates a custom injector to pass MODAL_OPTIONS and ModalRef
   * into the ModalComponent.
   */
  private createInjector(options: ModalOptions, modalRef: ModalRef): Injector {
    return Injector.create({
      parent: this.injector,
      providers: [
        { provide: ModalRef, useValue: modalRef },
        { provide: MODAL_OPTIONS, useValue: options },
      ],
    });
  }
}