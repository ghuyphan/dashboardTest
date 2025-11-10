import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ModalRef } from '../../models/modal-ref.model';

@Component({
  selector: 'app-confirmation-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './confirmation-modal.component.html',
  styleUrls: ['./confirmation-modal.component.scss'],
})
export class ConfirmationModalComponent {
  // These will be set from the modal context
  @Input() title: string = 'Confirm';
  @Input() message: string = 'Are you sure?';
  @Input() confirmText: string = 'OK';
  @Input() cancelText: string = 'Cancel';

  // This will be injected when the modal is created
  public modalRef!: ModalRef;

  constructor() {}

  onConfirm(): void {
    this.modalRef?.close(true); // Close and return 'true'
  }

  onCancel(): void {
    this.modalRef?.close(false); // Close and return 'false'
  }
}