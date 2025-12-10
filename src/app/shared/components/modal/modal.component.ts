import {
  Component,
  AfterViewInit,
  inject,
  viewChild,
  ViewContainerRef,
  ChangeDetectionStrategy,
  OnInit,
  OnDestroy,
  HostListener
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
export class ModalComponent implements OnInit, AfterViewInit, OnDestroy {

  // [2] Use Signal-based viewChild
  // We use { read: ViewContainerRef } to get the container specifically
  private modalContentHost = viewChild.required('modalContentHost', { read: ViewContainerRef });

  // Inject services/tokens
  private modalRef = inject(ModalRef);
  public options = inject<ModalOptions>(MODAL_OPTIONS);

  // Track if we pushed a history state (to avoid double-pop issues)
  private historyStatePushed = false;
  private popstateHandler = this.onPopState.bind(this);

  constructor() { }

  // [NEW] ESC key listener to close modal
  @HostListener('document:keydown.escape', ['$event'])
  onEscapeKey(event: KeyboardEvent): void {
    if (!this.options.disableClose) {
      event.preventDefault();
      this.closeModal();
    }
  }

  ngOnInit(): void {
    // [NEW] Push a history state so the back button can close the modal
    if (!this.options.disableClose) {
      history.pushState({ modal: true }, '');
      this.historyStatePushed = true;
      window.addEventListener('popstate', this.popstateHandler);
    }
  }

  ngAfterViewInit(): void {
    this.loadModalContent();
  }

  ngOnDestroy(): void {
    // [NEW] Cleanup: Remove popstate listener
    if (this.historyStatePushed) {
      window.removeEventListener('popstate', this.popstateHandler);
      // If modal was closed by other means (not back button), pop the history state we added
      // Check if the current state is our modal state
      if (history.state?.modal) {
        history.back();
      }
    }
  }

  // [NEW] Handle browser back button
  private onPopState(event: PopStateEvent): void {
    // When user presses back, close the modal
    this.historyStatePushed = false; // Already popped by browser
    window.removeEventListener('popstate', this.popstateHandler);
    this.modalRef.close();
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
