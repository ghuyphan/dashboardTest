import { Type } from '@angular/core';

export interface ModalOptions {
  component: Type<any>;
  context?: any;
  title?: string; // <-- NEW: For a standard header
  size?: 'sm' | 'md' | 'lg' | 'xl'; // <-- NEW: For styling
  disableBackdropClose?: boolean; // <-- NEW: To prevent closing on click-away
}