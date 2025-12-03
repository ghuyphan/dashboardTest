import { Component, input, inject, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ModalRef } from '../../../core/models/modal-ref.model';

@Component({
  selector: 'app-confirmation-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './confirmation-modal.component.html',
  styleUrls: ['./confirmation-modal.component.scss'],
  // Signals automatically notify Angular when to update the view.
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConfirmationModalComponent {
  protected modalRef = inject(ModalRef);

  public layout = input<'center' | 'standard'>('center');
  public title = input<string>('');
  public message = input<string>('');
  public confirmText = input<string>('OK');
  public cancelText = input<string>('Cancel');
  public icon = input<string>('');
  public iconColor = input<string>('');

  onConfirm(): void {
    this.modalRef.close(true);
  }

  onCancel(): void {
    this.modalRef.close(false);
  }
}