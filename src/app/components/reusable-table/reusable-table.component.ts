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
  HostListener,
  ElementRef
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

@Injectable()
export class VietnamesePaginatorIntl extends MatPaginatorIntl {
  override itemsPerPageLabel = 'Số hàng:';
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
  width?: string; // Optional width for better control
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
  @Input() showLoadingText: boolean = true;
  @Input() emptyStateText: string = 'Không có dữ liệu';
  @Input() noResultsText: string = 'Không tìm thấy kết quả phù hợp';

  @Output() rowClick = new EventEmitter<any>();
  @Output() sortChanged = new EventEmitter<SortChangedEvent>();
  @Output() pageChanged = new EventEmitter<any>();
  @Output() searchCleared = new EventEmitter<void>();

  public dataSource = new MatTableDataSource<any>();
  public displayedColumns: string[] = [];
  public selectedRow: any | null = null;
  public isLoadingWithDelay = false;
  private loadingTimer: any;

  @ViewChild(MatSort) sort!: MatSort;
  @ViewChild(MatPaginator) paginator!: MatPaginator;
  @ViewChild('tableContainer') tableContainer!: ElementRef;

  // Initialize sort state to prevent undefined errors
  public sortState: { active: string; direction: SortDirection } = {
    active: '',
    direction: ''
  };

  constructor() {}

  ngAfterViewInit(): void {
    this.dataSource.sort = this.sort;
    this.dataSource.paginator = this.paginator;
    this.setupColumnWidths();
    
    // Initialize sort state from MatSort
    if (this.sort) {
      this.sortState = {
        active: this.sort.active,
        direction: this.sort.direction as SortDirection
      };
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['isLoading']) {
      this.handleLoadingState();
    }

    if (changes['data']) {
      this.dataSource.data = this.data;
      this.selectedRow = null;
      
      // Auto-scroll to top when data changes
      if (this.tableContainer?.nativeElement) {
        this.tableContainer.nativeElement.scrollTop = 0;
      }
    }

    if (changes['columns']) {
      this.displayedColumns = this.columns.map((col) => col.key);
      this.setupColumnWidths();
    }

    if (changes['searchTerm']) {
      this.dataSource.filter = this.searchTerm.trim().toLowerCase();
      if (this.dataSource.paginator) {
        this.dataSource.paginator.firstPage();
      }
    }
  }

  private handleLoadingState() {
    if (this.isLoading) {
      // Show loading spinner only after 200ms to avoid flicker
      this.loadingTimer = setTimeout(() => {
        this.isLoadingWithDelay = true;
      }, 200);
    } else {
      clearTimeout(this.loadingTimer);
      this.isLoadingWithDelay = false;
    }
  }

  private setupColumnWidths() {
    setTimeout(() => {
      const headers = document.querySelectorAll('.mat-mdc-header-cell');
      this.columns.forEach((col, index) => {
        if (col.width && headers[index]) {
          (headers[index] as HTMLElement).style.width = col.width;
          (headers[index] as HTMLElement).style.minWidth = col.width;
        }
      });
    }, 0);
  }

  public onRowClick(row: any): void {
    this.selectedRow = this.selectedRow === row ? null : row;
    this.rowClick.emit(row);
  }

  public onMatSortChange(sort: Sort): void {
    // Update local sort state
    this.sortState = {
      active: sort.active,
      direction: sort.direction as SortDirection
    };
    
    this.sortChanged.emit({
      column: sort.active,
      direction: sort.direction as SortDirection,
    });
  }

  public onPageChange(event: any): void {
    this.pageChanged.emit(event);
    
    // Scroll to top when page changes
    if (this.tableContainer?.nativeElement) {
      this.tableContainer.nativeElement.scrollTop = 0;
    }
  }

  public clearSearch(): void {
    this.searchTerm = '';
    this.dataSource.filter = '';
    this.searchCleared.emit();
    
    // Reset to first page after clearing search
    if (this.paginator) {
      this.paginator.firstPage();
    }
  }

  @HostListener('window:keydown', ['$event'])
  handleKeyboardEvent(event: KeyboardEvent) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      this.handleRowNavigation(event.key === 'ArrowDown');
    }
  }

  private handleRowNavigation(down: boolean) {
    const rows = this.dataSource.filteredData;
    if (!rows.length) return;
    
    const currentIndex = rows.findIndex(row => row === this.selectedRow);
    let newIndex = down ? currentIndex + 1 : currentIndex - 1;
    
    if (newIndex < 0) newIndex = rows.length - 1;
    if (newIndex >= rows.length) newIndex = 0;
    
    if (rows[newIndex]) {
      this.onRowClick(rows[newIndex]);
      
      // Scroll to selected row
      setTimeout(() => {
        const rowElements = document.querySelectorAll('.clickable-row');
        if (rowElements[newIndex]) {
          rowElements[newIndex].scrollIntoView({ 
            behavior: 'smooth', 
            block: 'nearest' 
          });
        }
      }, 50);
    }
  }

  getEmptyStateMessage(): string {
    return this.searchTerm 
      ? `${this.noResultsText} "${this.searchTerm}"`
      : this.emptyStateText;
  }
}