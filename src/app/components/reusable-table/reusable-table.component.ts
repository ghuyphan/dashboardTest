import {
  Component,
  Input,
  Output,
  EventEmitter,
  ViewChild,
  OnChanges,
  AfterViewInit,
  SimpleChanges,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatTableDataSource, MatTableModule } from '@angular/material/table';
import { MatSort, MatSortModule, Sort } from '@angular/material/sort';

// --- Interfaces (unchanged) ---
export interface GridColumn {
  key: string;
  label: string;
  sortable: boolean;
}
export type SortDirection = 'asc' | 'desc' | '';
export interface SortChangedEvent {
  column: string;
  direction: SortDirection;
}

@Component({
  selector: 'app-reusable-table',
  standalone: true,
  imports: [CommonModule, MatTableModule, MatSortModule],
  templateUrl: './reusable-table.component.html',
  styleUrls: ['./reusable-table.component.scss'],
})
export class ReusableTableComponent implements OnChanges, AfterViewInit {
  // --- Inputs & Outputs (unchanged) ---
  @Input() data: any[] = [];
  @Input() columns: GridColumn[] = [];
  @Input() searchTerm: string = '';
  @Output() rowClick = new EventEmitter<any>();
  @Output() sortChanged = new EventEmitter<SortChangedEvent>();

  // --- Internal MatTable Properties ---
  public dataSource = new MatTableDataSource<any>();
  public displayedColumns: string[] = [];

  // --- NEW: To track selected row for styling ---
  public selectedRow: any | null = null;

  @ViewChild(MatSort) sort!: MatSort;

  constructor() {}

  ngAfterViewInit(): void {
    this.dataSource.sort = this.sort;
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['data']) {
      this.dataSource.data = this.data;
      // Clear selection when data changes
      this.selectedRow = null;
    }

    if (changes['columns']) {
      this.displayedColumns = this.columns.map((col) => col.key);
    }

    if (changes['searchTerm']) {
      this.applyFilter(this.searchTerm);
    }
  }

  /**
   * Emits the row click event and sets the internal selectedRow.
   */
  public onRowClick(row: any): void {
    this.selectedRow = row; // Set for internal styling
    this.rowClick.emit(row); // Emit to parent
  }

  private applyFilter(filterValue: string): void {
    this.dataSource.filter = filterValue.trim().toLowerCase();
  }

  public onMatSortChange(sort: Sort): void {
    this.sortChanged.emit({
      column: sort.active,
      direction: sort.direction as SortDirection,
    });
  }
}