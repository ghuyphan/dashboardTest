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
} from '@angular/material/paginator';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatIconModule } from '@angular/material/icon';
import { TooltipDirective } from '../../directives/tooltip.directive';
import { MatMenuModule } from '@angular/material/menu'; // <-- IMPORTED

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
    MatMenuModule, // <-- ADDED
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

  @Output() rowClick = new EventEmitter<any>();
  @Output() sortChanged = new EventEmitter<SortChangedEvent>();
  @Output() pageChanged = new EventEmitter<any>();
  @Output() searchCleared = new EventEmitter<void>();
  // --- ADDED: Output for row actions ---
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
    this.dataSource.sort = this.sort;
    this.dataSource.paginator = this.paginator;
    this.setupColumnWidths();

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

    if (this.tableContainer?.nativeElement) {
      this.tableContainer.nativeElement.scrollTop = 0;
    }
  }

  public clearSearch(): void {
    this.searchTerm = '';
    this.dataSource.filter = '';
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

  // --- ADDED: Helper for status chips ---
  public getStatusClass(status: string): string {
    if (!status) return 'status-default';
    const lowerStatus = status.toLowerCase();

    if (lowerStatus.includes('sẵn sàng')) return 'status-ready';
    if (lowerStatus.includes('bảo trì') || lowerStatus.includes('sửa chữa')) return 'status-repair';
    if (lowerStatus.includes('hỏng') || lowerStatus.includes('thanh lý')) return 'status-broken';

    return 'status-default';
  }

  // --- ADDED: Helper for row action menu ---
  public onRowAction(action: string, element: any, event: MouseEvent): void {
    event.stopPropagation(); // Prevent row click
    this.rowAction.emit({ action, data: element });
  }
}