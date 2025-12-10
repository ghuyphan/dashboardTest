import { Type } from '@angular/core';

export interface ModalOptions {
  component: Type<any>;
  context?: any;
  title?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  disableBackdropClose?: boolean;
  disableClose?: boolean; // If true, ESC key and back button won't close the modal
  hideHeader?: boolean;
}
