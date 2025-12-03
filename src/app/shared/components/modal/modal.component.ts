import {
  Component,
  AfterViewInit,
  inject,
  viewChild,
  ViewContainerRef,
  ChangeDetectionStrategy,
  ElementRef
} from '@angular/core';
import { ModalOptions } from '../../../core/models/modal-options.model';
import { ModalRef, MODAL_OPTIONS } from '../../../core/models/modal-ref.model';

@Component({
  selector: 'app-modal',
  standalone: true,
  imports: [], // CommonModule removed; use @if in template
  templateUrl: './modal.component.html',
  styleUrl: './modal.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush // [1] Performance optimization
})
export class ModalComponent implements AfterViewInit {

  // [2] Use Signal-based viewChild
  // We use { read: ViewContainerRef } to get the container specifically
  private modalContentHost = viewChild.required('modalContentHost', { read: ViewContainerRef });

  // Inject services/tokens
  private modalRef = inject(ModalRef);
  public options = inject<ModalOptions>(MODAL_OPTIONS);

  constructor() { }

  ngAfterViewInit(): void {
    this.loadModalContent();
  }

  private loadModalContent(): void {
    const container = this.modalContentHost();
    container.clear();

    if (this.options?.component) {
      // Create the component
      const componentRef = container.createComponent(this.options.component);

      // [3] Use setInput() instead of Object.assign
      // This ensures it works if the child component uses signal inputs: public data = input();
      if (this.options.context) {
        Object.entries(this.options.context).forEach(([key, value]) => {
          componentRef.setInput(key, value);
        });
      }

      // [4] Optimization: REMOVED manual assignment of modalRef.
      // The Child component should inject ModalRef via DI, which is cleaner and strictly typed.
      // componentRef.instance.modalRef = this.modalRef; <--- DELETED

      // [5] Legacy Support: Handle Output Emitters automatically
      // Ideally, the child should call modalRef.close(), but if you support @Output() close:
      if ('closeModal' in componentRef.instance && (componentRef.instance as any).closeModal?.subscribe) {
        (componentRef.instance as any).closeModal.subscribe((data: any) => {
          this.closeModal(data);
        });
      }

      // Trigger change detection for the new component
      componentRef.changeDetectorRef.markForCheck();
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