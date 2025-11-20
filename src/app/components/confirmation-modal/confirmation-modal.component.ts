import { Component, input } from '@angular/core';
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
  public layout = input<'center' | 'standard'>('center');
  public title = input<string>(''); 
  public message = input<string>('');
  public confirmText = input<string>('OK');
  public cancelText = input<string>('Cancel');
  public icon = input<string>('');
  public iconColor = input<string>('');

  public modalRef!: ModalRef;

  constructor() {}

  onConfirm(): void {
    this.modalRef?.close(true);
  }

  onCancel(): void {
    this.modalRef?.close(false);
  }
}