import {
  Component,
  AfterViewInit,
  inject,
  viewChild,
  ViewContainerRef,
  ChangeDetectionStrategy,
  OnInit,
  OnDestroy,
  HostListener,
  DestroyRef
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ModalOptions } from '../../../core/models/modal-options.model';
import { ModalRef, MODAL_OPTIONS } from '../../../core/models/modal-ref.model';
import { KeyboardShortcutService } from '../../../core/services/keyboard-shortcut.service';
import { GLOBAL_SHORTCUTS } from '../../../core/config/keyboard-shortcuts.config';

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
  private shortcutService = inject(KeyboardShortcutService);
  private destroyRef = inject(DestroyRef);
  public options = inject<ModalOptions>(MODAL_OPTIONS);

  // Track if we pushed a history state (to avoid double-pop issues)
  private historyStatePushed = false;
  private popstateHandler = this.onPopState.bind(this);

  constructor() { }

  ngOnInit(): void {
    // [NEW] Use central shortcut service for ESC key
    if (!this.options.disableClose) {
      // listen(shortcut, allowInInputs=false, ignoreModalCheck=true)
      this.shortcutService.listen(GLOBAL_SHORTCUTS.ESCAPE, false, true)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe((e) => {
          e.event.preventDefault();
          this.closeModal();
        });

      // Push a history state so the back button can close the modal
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
      // If modal was closed by other means (not back button), clean up the history state
      // Use replaceState instead of history.back() to avoid interfering with router navigation
      if (history.state?.modal) {
        history.replaceState(null, '');
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
      const instance = componentRef.instance as { closeModal?: { subscribe: (fn: (d?: unknown) => void) => void } };
      if (instance.closeModal && typeof instance.closeModal.subscribe === 'function') {
        instance.closeModal.subscribe((data?: unknown) => {
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

  closeModal(data?: unknown): void {
    this.modalRef.close(data);
  }

  onModalContentClick(event: Event): void {
    event.stopPropagation();
  }
}
