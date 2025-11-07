import {
  Component,
  Input,
  Output,
  EventEmitter,
  ViewChild,
  OnChanges,
  AfterViewInit,
  SimpleChanges,
  Injectable,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatTableDataSource, MatTableModule } from '@angular/material/table';
import { MatSort, MatSortModule, Sort } from '@angular/material/sort';
import {
  MatPaginator,
  MatPaginatorIntl,
  MatPaginatorModule,
} from '@angular/material/paginator';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatIconModule } from '@angular/material/icon';
import { TooltipDirective } from '../../directives/tooltip.directive';

// --- Custom Vietnamese Paginator Intl ---
// This is required because mixins only change style, not text.
@Injectable()
export class VietnamesePaginatorIntl extends MatPaginatorIntl {
  override itemsPerPageLabel = 'Số hàng:'; // Shorter label for compactness
  override nextPageLabel = 'Trang sau';
  override previousPageLabel = 'Trang trước';
  override firstPageLabel = 'Trang đầu';
  override lastPageLabel = 'Trang cuối';

  override getRangeLabel = (page: number, pageSize: number, length: number) => {
    if (length === 0 || pageSize === 0) {
      return `0 / ${length}`;
    }
    length = Math.max(length, 0);
    const startIndex = page * pageSize;
    const endIndex =
      startIndex < length
        ? Math.min(startIndex + pageSize, length)
        : startIndex + pageSize;
    return `${startIndex + 1} - ${endIndex} / ${length}`;
  };
}

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
  imports: [
    CommonModule,
    MatTableModule,
    MatSortModule,
    MatPaginatorModule,
    MatProgressSpinnerModule,
    MatIconModule,
    TooltipDirective,
  ],
  templateUrl: './reusable-table.component.html',
  styleUrls: ['./reusable-table.component.scss'],
  providers: [{ provide: MatPaginatorIntl, useClass: VietnamesePaginatorIntl }],
})
export class ReusableTableComponent implements OnChanges, AfterViewInit {
  @Input() data: any[] = [];
  @Input() columns: GridColumn[] = [];
  @Input() searchTerm: string = '';
  @Input() isLoading: boolean = false;
  @Input() pageSize: number = 10;
  @Input() pageSizeOptions: number[] = [5, 10, 25, 50];

  @Output() rowClick = new EventEmitter<any>();
  @Output() sortChanged = new EventEmitter<SortChangedEvent>();

  public dataSource = new MatTableDataSource<any>();
  public displayedColumns: string[] = [];
  public selectedRow: any | null = null;

  @ViewChild(MatSort) sort!: MatSort;
  @ViewChild(MatPaginator) paginator!: MatPaginator;

  constructor() {}

  ngAfterViewInit(): void {
    this.dataSource.sort = this.sort;
    this.dataSource.paginator = this.paginator;
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['data']) {
      this.dataSource.data = this.data;
      this.selectedRow = null;
    }
    if (changes['columns']) {
      this.displayedColumns = this.columns.map((col) => col.key);
    }
    if (changes['searchTerm']) {
      this.dataSource.filter = this.searchTerm.trim().toLowerCase();
      if (this.dataSource.paginator) {
        this.dataSource.paginator.firstPage();
      }
    }
  }

  public onRowClick(row: any): void {
    this.selectedRow = row;
    this.rowClick.emit(row);
  }

  public onMatSortChange(sort: Sort): void {
    this.sortChanged.emit({
      column: sort.active,
      direction: sort.direction as SortDirection,
    });
  }
}