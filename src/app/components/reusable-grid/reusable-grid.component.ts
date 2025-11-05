import { Component, Input, Output, EventEmitter } from '@angular/core'; // <-- Import Output & EventEmitter
import { CommonModule } from '@angular/common';

export interface GridColumn {
  key: string;
  label: string;
}

@Component({
  selector: 'app-reusable-grid',
  standalone: true,
  imports: [CommonModule], 
  templateUrl: './reusable-grid.component.html',
  styleUrl: './reusable-grid.component.scss'
})
export class ReusableGridComponent {
  
  @Input() columns: GridColumn[] = [];
  @Input() data: any[] = [];

  // --- START OF NEW CODE ---

  // 1. Emits the selected row object when a row is clicked
  @Output() rowSelected = new EventEmitter<any>();

  // 2. Tracks the currently selected row for styling
  public selectedRow: any | null = null;

  // --- END OF NEW CODE ---

  constructor() { }

  // --- START OF NEW FUNCTION ---

  /**
   * Called when a user clicks on a table row.
   * @param row The data object for the clicked row
   */
  public onRowClick(row: any): void {
    this.selectedRow = row;      // Set the row for internal styling
    this.rowSelected.emit(row);  // Emit the row data to the parent component
  }

  // --- END OF NEW FUNCTION ---
}