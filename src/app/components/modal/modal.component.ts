import {
  Component,
  ViewChild,
  ViewContainerRef,
  Inject,
  AfterViewInit,
} from '@angular/core';
import { CommonModule } from '@angular/common'; 
import { ModalOptions } from '../../models/modal-options.model';
import { ModalRef, MODAL_OPTIONS } from '../../models/modal-ref.model';

@Component({
  selector: 'app-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './modal.component.html',
  styleUrl: './modal.component.scss'
})
export class ModalComponent implements AfterViewInit {
  
  @ViewChild('modalContentHost', { read: ViewContainerRef, static: true })
  modalContentHost!: ViewContainerRef;

  constructor(
    private modalRef: ModalRef,
    @Inject(MODAL_OPTIONS) public options: ModalOptions
  ) {}

  ngAfterViewInit(): void {
    this.loadModalContent();
  }

  /**
   * Renders the component specified in modal options.
   * Clears any existing content before loading new component.
   */
  private loadModalContent(): void {
    this.modalContentHost.clear(); 

    if (this.options?.component) {
      const componentRef = this.modalContentHost.createComponent(this.options.component);

      // Pass data to the dynamic component
      if (this.options.context) {
        Object.assign(componentRef.instance, this.options.context);
      }
      
      // Provide modal reference so the loaded component can close the modal
      componentRef.instance.modalRef = this.modalRef;

      // Support legacy closeModal event subscription
      if (componentRef.instance.closeModal) {
        componentRef.instance.closeModal.subscribe((data: any) => {
          this.closeModal(data);
        });
      }
    }
  }

  /**
   * Returns CSS class for modal sizing based on options.
   * Defaults to medium size if no size specified.
   */
  public getSizeClass(): string {
    return this.options.size ? `modal-size-${this.options.size}` : 'modal-size-md';
  }

  closeModal(data?: any): void {
    this.modalRef.close(data);
  }

  /**
   * Stops click events from bubbling up when user clicks inside modal content.
   * This prevents the backdrop click handler from triggering.
   */
  onModalContentClick(event: Event): void {
    event.stopPropagation();
  }
}