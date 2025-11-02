import { Type } from '@angular/core';

/**
 * Configuration options for the modal.
 */
export interface ModalOptions {
  /**
   * The component to dynamically load into the modal's body.
   */
  component: Type<any>;

  /**
   * Optional data to pass to the dynamically loaded component.
   * This data will be assigned to the component's inputs.
   *
   * Example: If context is { myData: 'Hello' }, the loaded
   * component should have an `@Input() myData: string;`
   */
  context?: any;

  /**
   * Optional title to display in the modal header.
   */
  title?: string;

  /**
   * Optional: Set to true to hide the default close button (e.g., for forced actions).
   * Defaults to false.
   */
  hideCloseButton?: boolean;
}