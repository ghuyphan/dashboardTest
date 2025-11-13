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
import { CommonModule } from '@angular/common'; // Provides CurrencyPipe
import { MatTableDataSource, MatTableModule } from '@angular/material/table';
import { MatSort, MatSortModule, Sort } from '@angular/material/sort';
import {
  MatPaginator,
  MatPaginatorIntl,
  MatPaginatorModule,
  PageEvent // <-- IMPORTED
} from '@angular/material/paginator';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatIconModule } from '@angular/material/icon';
import { TooltipDirective } from '../../directives/tooltip.directive';
import { MatMenuModule } from '@angular/material/menu'; 

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
  width?: string;
  sticky?: 'start' | 'end' | false;
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
    CommonModule, // <-- Provides CurrencyPipe
    MatTableModule,
    MatSortModule,
    MatPaginatorModule,
    MatProgressSpinnerModule,
    MatIconModule,
    TooltipDirective,
    MatMenuModule, 
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

  @Input() trackByField: string = 'Id';

  // --- NEW INPUT for Server-Side Paging ---
  @Input() totalDataLength: number = 0;

  @Output() rowClick = new EventEmitter<any>();
  @Output() sortChanged = new EventEmitter<SortChangedEvent>();
  @Output() pageChanged = new EventEmitter<PageEvent>(); // <-- Use PageEvent type
  @Output() searchCleared = new EventEmitter<void>();
  @Output() rowAction = new EventEmitter<{ action: string, data: any }>();

  public dataSource = new MatTableDataSource<any>();
  public displayedColumns: string[] = [];
  public selectedRow: any | null = null;
  public isLoadingWithDelay = false;
  private loadingTimer: any;

  @ViewChild(MatSort) sort!: MatSort;
  @ViewChild(MatPaginator) paginator!: MatPaginator;
  @ViewChild('tableContainer') tableContainer!: ElementRef;

  public sortState: { active: string; direction: SortDirection } = {
    active: '',
    direction: ''
  };

  constructor() { }

  ngAfterViewInit(): void {
    // We connect the SORT, but NOT the paginator.
    this.dataSource.sort = this.sort;

    // --- START OF FIX ---
    // DO NOT DO THIS FOR SERVER-SIDE PAGING:
    // this.dataSource.paginator = this.paginator; 
    // --- END OF FIX ---

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

      if (this.tableContainer?.nativeElement) {
        this.tableContainer.nativeElement.scrollTop = 0;
      }
    }

    // --- START OF FIX ---
    // This logic is not needed because the [length] property on
    // the <mat-paginator> in the HTML handles it automatically.
    // if (changes['totalDataLength'] && this.paginator) {
    //   this.paginator.length = this.totalDataLength;
    // }
    // --- END OF FIX ---

    if (changes['columns']) {
      this.displayedColumns = this.columns.map((col) => col.key);
    }

    if (changes['searchTerm']) {
      // Client-side filtering is already correctly removed.
      
      // --- FIX: This block is also unnecessary ---
      // The parent component (device-list) already resets the page index
      // when the search term changes.
      // if (this.dataSource.paginator) {
      //   this.dataSource.paginator.firstPage();
      // }
      // --- END OF FIX ---
    }
  }

  private handleLoadingState() {
    if (this.isLoading) {
      this.loadingTimer = setTimeout(() => {
        this.isLoadingWithDelay = true;
      }, 200);
    } else {
      clearTimeout(this.loadingTimer);
      this.isLoadingWithDelay = false;
    }
  }

  public onRowClick(row: any): void {
    this.selectedRow = this.selectedRow === row ? null : row;
    this.rowClick.emit(row);
  }

  public onMatSortChange(sort: Sort): void {
    this.sortState = {
      active: sort.active,
      direction: sort.direction as SortDirection
    };

    // This correctly emits the sort change to the parent (device-list)
    this.sortChanged.emit({
      column: sort.active,
      direction: sort.direction as SortDirection,
    });
  }

  public onPageChange(event: PageEvent): void { // <-- Use PageEvent type
    // This correctly emits the page change to the parent (device-list)
    this.pageChanged.emit(event);

    if (this.tableContainer?.nativeElement) {
      this.tableContainer.nativeElement.scrollTop = 0;
    }
  }

  public clearSearch(): void {
    this.searchTerm = '';
    // this.dataSource.filter = ''; // Not needed for server-side
    this.searchCleared.emit();

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
    // Note: filteredData might still be used by DataSource, but with server-side data
    // it will just be the current page's data.
    const rows = this.dataSource.filteredData; 
    if (!rows.length) return;

    const currentIndex = rows.findIndex(row => row === this.selectedRow);
    let newIndex = down ? currentIndex + 1 : currentIndex - 1;

    if (newIndex < 0) newIndex = rows.length - 1;
    if (newIndex >= rows.length) newIndex = 0;

    if (rows[newIndex]) {
      this.onRowClick(rows[newIndex]);

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

  public trackByFn = (index: number, item: any): any => {
    return item[this.trackByField] || index;
  }

  public getStatusClass(status: string): string {
    if (!status) return 'status-default';
    const lowerStatus = status.toLowerCase();

    if (lowerStatus.includes('đang sử dụng')) return 'status-in-use';
    if (lowerStatus.includes('sẵn sàng')) return 'status-ready';
    if (lowerStatus.includes('bảo trì') || lowerStatus.includes('sửa chữa')) return 'status-repair';
    if (lowerStatus.includes('hỏng') || lowerStatus.includes('thanh lý')) return 'status-broken';

    return 'status-default';
  }

  public onRowAction(action: string, element: any, event: MouseEvent): void {
    event.stopPropagation(); // Prevent row click
    this.rowAction.emit({ action, data: element });
  }
}