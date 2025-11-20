import {
  Component,
  ViewChild,
  ViewContainerRef,
  Inject,
  AfterViewInit,
  inject,
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

  // Using inject() for ModalRef is cleaner
  private modalRef = inject(ModalRef);
  
  // MODAL_OPTIONS is a token, so we use inject with it
  public options = inject<ModalOptions>(MODAL_OPTIONS);

  constructor() {}

  ngAfterViewInit(): void {
    this.loadModalContent();
  }

  private loadModalContent(): void {
    this.modalContentHost.clear(); 

    if (this.options?.component) {
      const componentRef = this.modalContentHost.createComponent(this.options.component);

      if (this.options.context) {
        Object.assign(componentRef.instance, this.options.context);
      }
      
      componentRef.instance.modalRef = this.modalRef;

      if (componentRef.instance.closeModal) {
        componentRef.instance.closeModal.subscribe((data: any) => {
          this.closeModal(data);
        });
      }
    }
  }

  public getSizeClass(): string {
    return this.options.size ? `modal-size-${this.options.size}` : 'modal-size-md';
  }

  closeModal(data?: any): void {
    this.modalRef.close(data);
  }

  onModalContentClick(event: Event): void {
    event.stopPropagation();
  }
}