import {
  Component,
  ViewChild,
  ViewContainerRef,
  OnDestroy,
  OnInit,
} from '@angular/core';
// CHANGED: Imported NgClass
import { AsyncPipe, NgIf, NgClass } from '@angular/common';
import { Observable, Subscription } from 'rxjs';
import { ModalService } from '../../services/modal.service';
import { ModalOptions } from '../../models/modal-options.model';

@Component({
  selector: 'app-modal',
  standalone: true,
  // CHANGED: Added NgClass to the imports array
  imports: [AsyncPipe, NgIf, NgClass],
  templateUrl: './modal.component.html',
  styleUrl: './modal.component.scss'
})
export class ModalComponent implements OnInit, OnDestroy {
  // ViewContainerRef to dynamically insert the modal content
  @ViewChild('modalContentHost', { read: ViewContainerRef, static: false })
  modalContentHost!: ViewContainerRef;

  modalState$: Observable<ModalOptions | null>;
  private stateSubscription: Subscription | undefined;

  constructor(private modalService: ModalService) {
    this.modalState$ = this.modalService.modalState$;
  }

  ngOnInit(): void {
    // We subscribe to the state to manually load/clear the component
    this.stateSubscription = this.modalState$.subscribe(options => {
      this.loadModalContent(options);
    });
  }

  ngOnDestroy(): void {
    this.stateSubscription?.unsubscribe();
  }

  /**
   * Dynamically loads the component specified in ModalOptions
   * or clears the container if options are null.
   */
  private loadModalContent(options: ModalOptions | null): void {
    // Ensure host is available (it might not be on first load if *ngIf is used in template)
    if (!this.modalContentHost) {
      // If host isn't ready, retry briefly.
      // This can happen if the *ngIf in the template hasn't rendered the host yet.
      // We check for `options` to avoid an infinite loop when closing.
      if (options) {
        setTimeout(() => this.loadModalContent(options), 0);
      }
      return;
    }

    this.modalContentHost.clear(); // Clear any previous component

    if (options) {
      // 1. Create the component
      const componentRef = this.modalContentHost.createComponent(options.component);

      // 2. Pass context data (if any) to the component's instance
      if (options.context) {
        Object.assign(componentRef.instance, options.context);
      }

      // 3. (Optional but recommended) Listen for a 'closeModal' event from the injected component
      // This allows the component to close itself (e.g., on form submit)
      if (componentRef.instance.closeModal) {
        componentRef.instance.closeModal.subscribe(() => {
          this.closeModal();
        });
      }
    }
  }

  /**
   * Closes the modal by calling the service.
   */
  closeModal(): void {
    this.modalService.close();
  }

  /**
   * Closes the modal when the backdrop is clicked.
   * CHANGED: Now accepts options to check disableBackdropClose.
   */
  onBackdropClick(options: ModalOptions): void {
    // Check if the options (from the *ngIf) are defined
    // and if backdrop closing is explicitly disabled
    if (options && options.disableBackdropClose) {
      return; // Do nothing
    }
    
    // Otherwise, close the modal
    this.closeModal();
  }

  /**
   * Prevents the backdrop click from firing when clicking
   * on the modal content itself.
   */
  onModalContentClick(event: Event): void {
    event.stopPropagation();
  }
}