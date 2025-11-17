import { Type } from '@angular/core';

export interface ModalOptions {
  component: Type<any>;
  context?: any;
  title?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl'; 
  disableBackdropClose?: boolean;
  hideHeader?: boolean;
}