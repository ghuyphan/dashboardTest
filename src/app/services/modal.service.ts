import { Injectable, Type, Injector } from '@angular/core';
import { Observable } from 'rxjs';
import { Overlay, OverlayConfig, OverlayRef } from '@angular/cdk/overlay';
import { ComponentPortal } from '@angular/cdk/portal';

import { ModalOptions } from '../models/modal-options.model';
import { ModalRef, MODAL_OPTIONS } from '../models/modal-ref.model';
import { ModalComponent } from '../components/modal/modal.component';

@Injectable({
  providedIn: 'root',
})
export class ModalService {
  
  // Inject the CDK Overlay and Angular's Injector
  constructor(private overlay: Overlay, private injector: Injector) {}

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
  ): Observable<any> {
    
    // 1. Combine component and options
    const modalOptions: ModalOptions = {
      component,
      ...options,
    };

    // 2. Create the overlay
    const overlayRef = this.createOverlay(modalOptions);

    // 3. Create the ModalRef
    const modalRef = new ModalRef(overlayRef);

    // 4. Create the injector
    const injector = this.createInjector(modalOptions, modalRef);

    // 5. Create the portal
    const portal = new ComponentPortal(ModalComponent, null, injector);

    // 6. Attach the portal to the overlay
    overlayRef.attach(portal);

    // 7. Handle backdrop click to close
    if (!modalOptions.disableBackdropClose) {
      overlayRef.backdropClick().subscribe(() => {
        modalRef.close();
      });
    }

    // 8. Return the observable for the caller to subscribe to
    return modalRef.afterClosed;
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