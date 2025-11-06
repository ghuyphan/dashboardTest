import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';

export interface GridColumn {
  key: string;
  label: string;
  sortable?: boolean; // <-- ADDED: Flag to enable sorting
}

// --- START OF NEW TYPE ---
export type SortDirection = 'asc' | 'desc';
export interface SortChangedEvent {
  key: string;
  direction: SortDirection;
}
// --- END OF NEW TYPE ---

@Component({
  selector: 'app-reusable-grid',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './reusable-grid.component.html',
  styleUrl: './reusable-grid.component.scss',
})
export class ReusableGridComponent {
  @Input() columns: GridColumn[] = [];
  @Input() data: any[] = [];
  @Output() rowSelected = new EventEmitter<any>();

  // --- START OF NEW SORTING CODE ---

  @Output() sortChanged = new EventEmitter<SortChangedEvent>();

  public sortColumn: string | null = null;
  public sortDirection: SortDirection = 'asc';

  /**
   * Called when a user clicks a column header.
   * @param column The column being sorted
   */
  public onSort(column: GridColumn): void {
    // 1. Do nothing if the column isn't sortable
    if (!column.sortable) {
      return;
    }

    // 2. Check if sorting a new column
    if (this.sortColumn === column.key) {
      // 3. If same column, flip direction
      this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      // 4. If new column, set to 'asc'
      this.sortColumn = column.key;
      this.sortDirection = 'asc';
    }

    // 5. Emit the event to the parent
    this.sortChanged.emit({
      key: this.sortColumn,
      direction: this.sortDirection,
    });
  }
  // --- END OF NEW SORTING CODE ---

  public selectedRow: any | null = null;

  constructor() {}

  public onRowClick(row: any): void {
    this.selectedRow = row;
    this.rowSelected.emit(row);
  }
}