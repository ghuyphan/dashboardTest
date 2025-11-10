// src/app/components/modal/modal.component.ts

import {
  Component,
  ViewChild,
  ViewContainerRef,
  Inject, // CHANGED: Import Inject
  AfterViewInit, // CHANGED: Import AfterViewInit
} from '@angular/core';
import { ModalOptions } from '../../models/modal-options.model';
import { ModalRef, MODAL_OPTIONS } from '../../models/modal-ref.model'; // CHANGED: Import new refs

@Component({
  selector: 'app-modal',
  standalone: true,
  templateUrl: './modal.component.html',
  styleUrl: './modal.component.scss'
})
export class ModalComponent implements AfterViewInit { // CHANGED: Removed OnInit, OnDestroy
  
  @ViewChild('modalContentHost', { read: ViewContainerRef, static: true }) // CHANGED: Set static: true
  modalContentHost!: ViewContainerRef;

  // CHANGED: No more observable state. We get options via injection.
  constructor(
    private modalRef: ModalRef,
    @Inject(MODAL_OPTIONS) public options: ModalOptions // Options are now public for the template
  ) {}

  // CHANGED: Load content after the view is initialized
  ngAfterViewInit(): void {
    this.loadModalContent();
  }

  /**
   * Dynamically loads the component specified in ModalOptions.
   */
  private loadModalContent(): void { // CHANGED: No longer takes options argument
    // Host is guaranteed to be ready in ngAfterViewInit with static: true
    this.modalContentHost.clear(); 

    if (this.options) {
      // 1. Create the component
      const componentRef = this.modalContentHost.createComponent(this.options.component);

      // 2. Pass context data (if any) to the component's instance
      if (this.options.context) {
        Object.assign(componentRef.instance, this.options.context);
      }
      
      // 3. Inject the ModalRef into the dynamic component
      // This allows the loaded component (e.g., a form) to close the modal
      // Note: The loaded component must have: `public modalRef?: ModalRef;`
      componentRef.instance.modalRef = this.modalRef;

      // 4. (Optional) Listen for a 'closeModal' event (your old pattern)
      // We'll keep this for compatibility, but injecting ModalRef is better.
      if (componentRef.instance.closeModal) {
        componentRef.instance.closeModal.subscribe((data: any) => {
          this.closeModal(data);
        });
      }
    }
  }

  /**
   * Closes the modal by calling the service.
   * CHANGED: Now passes data back via ModalRef.
   */
  closeModal(data?: any): void {
    this.modalRef.close(data);
  }

  /**
   * Prevents the backdrop click from firing when clicking
   * on the modal content itself.
   */
  onModalContentClick(event: Event): void {
    event.stopPropagation();
  }

  // CHANGED: onBackdropClick() is removed. The service handles this now.
}