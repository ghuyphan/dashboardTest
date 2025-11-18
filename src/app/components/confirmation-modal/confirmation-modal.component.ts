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
  @Input() title: string = ''; 
  @Input() message: string = '';
  @Input() confirmText: string = 'OK';
  @Input() cancelText: string = 'Cancel';
  
  @Input() icon: string = '';
  @Input() iconColor: string = '';

  public modalRef!: ModalRef;

  constructor() {}

  onConfirm(): void {
    this.modalRef?.close(true);
  }

  onCancel(): void {
    this.modalRef?.close(false);
  }
}