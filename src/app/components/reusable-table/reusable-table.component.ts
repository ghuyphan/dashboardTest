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
  ElementRef,
  OnInit,
  HostBinding,
} from '@angular/core';
import { CommonModule } from '@angular/common'; // Provides CurrencyPipe
import { MatTableDataSource, MatTableModule } from '@angular/material/table';
import { MatSort, MatSortModule, Sort } from '@angular/material/sort';
import {
  MatPaginator,
  MatPaginatorIntl,
  MatPaginatorModule,
  PageEvent,
} from '@angular/material/paginator';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatIconModule } from '@angular/material/icon';
import { TooltipDirective } from '../../directives/tooltip.directive';
import { MatMenuModule } from '@angular/material/menu';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { SelectionModel } from '@angular/cdk/collections';
import { HighlightSearchPipe } from '../../pipes/highlight-search.pipe';

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
    CommonModule,
    MatTableModule,
    MatSortModule,
    MatPaginatorModule,
    MatProgressSpinnerModule,
    MatIconModule,
    TooltipDirective,
    MatMenuModule,
    MatCheckboxModule,
    HighlightSearchPipe,
  ],
  templateUrl: './reusable-table.component.html',
  styleUrls: ['./reusable-table.component.scss'],
  providers: [{ provide: MatPaginatorIntl, useClass: VietnamesePaginatorIntl }],
})
export class ReusableTableComponent implements OnInit, OnChanges, AfterViewInit {
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
  @Input() enableMultiSelect: boolean = false;

  @Input() totalDataLength: number = 0;

  @Input() showPaginator: boolean = true;
  @Input() clientSideSort: boolean = false;

  // --- START OF MODIFICATION ---
  @Input() headerColor: string | null = null;

  @HostBinding('style.--table-header-bg')
  get tableHeaderBg() {
    // If headerColor is provided, this binding will set the CSS variable.
    // If it's null, the binding is removed, and the CSS fallback will be used.
    return this.headerColor;
  }
  // --- END OF MODIFICATION ---

  @Output() rowClick = new EventEmitter<any>();
  @Output() sortChanged = new EventEmitter<SortChangedEvent>();
  @Output() pageChanged = new EventEmitter<PageEvent>();
  @Output() searchCleared = new EventEmitter<void>();
  @Output() rowAction = new EventEmitter<{ action: string; data: any }>();
  @Output() selectionChanged = new EventEmitter<any[]>();

  public dataSource = new MatTableDataSource<any>();
  public displayedColumns: string[] = [];
  public selectedRow: any | null = null;
  public isLoadingWithDelay = false;
  private loadingTimer: any;

  public selection = new SelectionModel<any>(true, []);

  @ViewChild(MatSort) sort!: MatSort;
  @ViewChild(MatPaginator) paginator!: MatPaginator;
  @ViewChild('tableContainer') tableContainer!: ElementRef;

  public sortState: { active: string; direction: SortDirection } = {
    active: '',
    direction: '',
  };

  constructor() {}

  ngOnInit(): void {
    // Emit selection changes
    this.selection.changed.subscribe(() => {
      this.selectionChanged.emit(this.selection.selected);
    });
    this.updateDisplayedColumns();
  }

  ngAfterViewInit(): void {
    // Only apply client-side sort if the flag is set
    if (this.clientSideSort) {
      this.dataSource.sort = this.sort;
    }

    if (this.sort) {
      this.sortState = {
        active: this.sort.active,
        direction: this.sort.direction as SortDirection,
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
      this.selection.clear();

      // Re-link sort if we are in client-side mode
      if (this.clientSideSort && this.sort) {
        this.dataSource.sort = this.sort;
      }

      if (this.tableContainer?.nativeElement) {
        this.tableContainer.nativeElement.scrollTop = 0;
      }
    }

    if (changes['columns'] || changes['enableMultiSelect']) {
      this.updateDisplayedColumns();
    }
  }

  private updateDisplayedColumns(): void {
    let baseCols = this.columns.map((col) => col.key);
    if (this.enableMultiSelect) {
      this.displayedColumns = ['select', ...baseCols];
    } else {
      this.displayedColumns = baseCols;
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
    if (!this.enableMultiSelect) {
      this.selectedRow = this.selectedRow === row ? null : row;
      this.rowClick.emit(row);
    } else {
      this.toggleRowSelection(row, null);
    }
  }

  public onMatSortChange(sort: Sort): void {
    this.sortState = {
      active: sort.active,
      direction: sort.direction as SortDirection,
    };

    // Only emit the event if we are NOT in client-side sort mode
    if (!this.clientSideSort) {
      this.sortChanged.emit({
        column: sort.active,
        direction: sort.direction as SortDirection,
      });
    }
  }

  public onPageChange(event: PageEvent): void {
    this.pageChanged.emit(event);

    if (this.tableContainer?.nativeElement) {
      this.tableContainer.nativeElement.scrollTop = 0;
    }
  }

  public clearSearch(): void {
    this.searchTerm = '';
    this.searchCleared.emit();

    if (this.paginator) {
      this.paginator.firstPage();
    }
  }

  @HostListener('window:keydown', ['$event'])
  handleKeyboardEvent(event: KeyboardEvent) {
    if (this.enableMultiSelect) return;

    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      this.handleRowNavigation(event.key === 'ArrowDown');
    }
  }

  private handleRowNavigation(down: boolean) {
    const rows = this.dataSource.filteredData;
    if (!rows.length) return;

    const currentIndex = rows.findIndex((row) => row === this.selectedRow);
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
            block: 'nearest',
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
  };

  public getStatusClass(status: string): string {
    if (!status) return 'status-default';
    const lowerStatus = status.toLowerCase();

    if (lowerStatus.includes('đang sử dụng')) return 'status-in-use';
    if (lowerStatus.includes('sẵn sàng')) return 'status-ready';
    if (lowerStatus.includes('bảo trì') || lowerStatus.includes('sửa chữa'))
      return 'status-repair';
    if (lowerStatus.includes('hỏng') || lowerStatus.includes('thanh lý'))
      return 'status-broken';

    return 'status-default';
  }

  public onRowAction(action: string, element: any, event: MouseEvent): void {
    event.stopPropagation(); // Prevent row click
    this.rowAction.emit({ action, data: element });
  }

  onCheckboxClick(event: MouseEvent): void {
    event.stopPropagation();
  }

  toggleRowSelection(row: any, event: MouseEvent | null): void {
    if (event) {
      event.stopPropagation();
    }

    this.selectedRow = null;
    this.rowClick.emit(null);

    this.selection.toggle(row);
  }

  isAllSelected(): boolean {
    const numSelected = this.selection.selected.length;
    const numRows = this.dataSource.data.length;
    return numSelected === numRows;
  }

  masterToggle(): void {
    this.selectedRow = null;
    this.rowClick.emit(null);

    if (this.isAllSelected()) {
      this.selection.clear();
      return;
    }
    this.selection.select(...this.dataSource.data);
  }

  checkboxLabel(row?: any): string {
    if (!row) {
      return `${this.isAllSelected() ? 'deselect' : 'select'} all`;
    }
    return `${
      this.selection.isSelected(row) ? 'deselect' : 'select'
    } row ${row[this.trackByField] || ''}`;
  }
}