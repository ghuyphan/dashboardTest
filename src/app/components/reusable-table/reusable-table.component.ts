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
  OnDestroy,
  ChangeDetectionStrategy,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
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
import { MatMenuModule } from '@angular/material/menu';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { SelectionModel } from '@angular/cdk/collections';

import { TooltipDirective } from '../../directives/tooltip.directive';
import { HighlightSearchPipe } from '../../pipes/highlight-search.pipe';

// Constants
const LOADING_DEBOUNCE_MS = 200;
const LOADING_HIDE_DELAY_MS = 150;
const ROW_NAVIGATION_DELAY_MS = 50;
const DEFAULT_PAGE_SIZE = 10;
const DEFAULT_PAGE_SIZE_OPTIONS = [5, 10, 25, 50];
const DEFAULT_TRACK_BY_FIELD = 'Id';

// Interfaces
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

export interface RowActionEvent {
  action: string;
  data: any;
}

interface SortState {
  active: string;
  direction: SortDirection;
}

/**
 * Vietnamese localization for Material Paginator
 */
@Injectable()
export class VietnamesePaginatorIntl extends MatPaginatorIntl {
  override itemsPerPageLabel = 'Số hàng:';
  override nextPageLabel = 'Trang sau';
  override previousPageLabel = 'Trang trước';
  override firstPageLabel = 'Trang đầu';
  override lastPageLabel = 'Trang cuối';

  override getRangeLabel = (
    page: number,
    pageSize: number,
    length: number
  ): string => {
    if (length === 0 || pageSize === 0) {
      return `0 / ${length}`;
    }

    const maxLength = Math.max(length, 0);
    const startIndex = page * pageSize;
    const endIndex =
      startIndex < maxLength
        ? Math.min(startIndex + pageSize, maxLength)
        : startIndex + pageSize;

    return `${startIndex + 1} - ${endIndex} / ${maxLength}`;
  };
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
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReusableTableComponent
  implements OnInit, OnChanges, AfterViewInit, OnDestroy
{
  // Inputs
  @Input() data: any[] = [];
  @Input() columns: GridColumn[] = [];
  @Input() searchTerm = '';
  @Input() isLoading = false;
  @Input() pageSize = DEFAULT_PAGE_SIZE;
  @Input() pageSizeOptions = DEFAULT_PAGE_SIZE_OPTIONS;
  @Input() showLoadingText = true;
  @Input() emptyStateText = 'Không có dữ liệu';
  @Input() noResultsText = 'Không tìm thấy kết quả phù hợp';
  @Input() trackByField = DEFAULT_TRACK_BY_FIELD;
  @Input() enableMultiSelect = false;
  @Input() totalDataLength = 0;
  @Input() showPaginator = true;
  @Input() clientSideSort = false;
  @Input() headerColor: string | null = null;

  // Outputs
  @Output() rowClick = new EventEmitter<any>();
  @Output() sortChanged = new EventEmitter<SortChangedEvent>();
  @Output() pageChanged = new EventEmitter<PageEvent>();
  @Output() searchCleared = new EventEmitter<void>();
  @Output() rowAction = new EventEmitter<RowActionEvent>();
  @Output() selectionChanged = new EventEmitter<any[]>();

  // Host Binding
  @HostBinding('style.--table-header-bg')
  get tableHeaderBg(): string | null {
    return this.headerColor;
  }

  // ViewChildren
  @ViewChild(MatSort) sort!: MatSort;
  @ViewChild(MatPaginator) paginator!: MatPaginator;
  @ViewChild('tableContainer') tableContainer!: ElementRef;

  // Public Properties
  public readonly dataSource = new MatTableDataSource<any>();
  public displayedColumns: string[] = [];
  public selectedRow: any | null = null;
  public isLoadingWithDelay = false;
  public readonly selection = new SelectionModel<any>(true, []);
  public sortState: SortState = {
    active: '',
    direction: '',
  };

  // Private Properties
  private loadingTimer?: ReturnType<typeof setTimeout>;

  ngOnInit(): void {
    this.initializeSelectionListener();
    this.updateDisplayedColumns();
  }

  ngAfterViewInit(): void {
    this.initializeSort();
    this.initializeSortState();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['isLoading']) {
      this.handleLoadingStateChange();
    }

    if (changes['data']) {
      this.handleDataChange();
    }

    if (changes['columns'] || changes['enableMultiSelect']) {
      this.updateDisplayedColumns();
    }
  }

  ngOnDestroy(): void {
    this.clearLoadingTimer();
  }

  /**
   * Initializes selection change listener
   */
  private initializeSelectionListener(): void {
    this.selection.changed.subscribe(() => {
      this.selectionChanged.emit(this.selection.selected);
    });
  }

  /**
   * Initializes sort functionality
   */
  private initializeSort(): void {
    if (this.clientSideSort && this.sort) {
      this.dataSource.sort = this.sort;
    }
  }

  /**
   * Initializes sort state from MatSort
   */
  private initializeSortState(): void {
    if (this.sort) {
      this.sortState = {
        active: this.sort.active,
        direction: this.sort.direction as SortDirection,
      };
    }
  }

  /**
   * Updates displayed columns based on configuration
   */
  private updateDisplayedColumns(): void {
    const baseColumns = this.columns.map((col) => col.key);

    this.displayedColumns = this.enableMultiSelect
      ? ['select', ...baseColumns]
      : baseColumns;
  }

  /**
   * Handles loading state changes with debouncing
   */
  private handleLoadingStateChange(): void {
    if (this.isLoading) {
      this.startLoadingWithDelay();
    } else {
      this.stopLoadingWithDelay();
    }
  }

  /**
   * Starts loading state after debounce period
   */
  private startLoadingWithDelay(): void {
    this.loadingTimer = setTimeout(() => {
      this.isLoadingWithDelay = true;
    }, LOADING_DEBOUNCE_MS);
  }

  /**
   * Stops loading state with smooth transition
   */
  private stopLoadingWithDelay(): void {
    this.clearLoadingTimer();

    setTimeout(() => {
      this.isLoadingWithDelay = false;
    }, LOADING_HIDE_DELAY_MS);
  }

  /**
   * Clears the loading timer
   */
  private clearLoadingTimer(): void {
    if (this.loadingTimer) {
      clearTimeout(this.loadingTimer);
      this.loadingTimer = undefined;
    }
  }

  /**
   * Handles data changes
   */
  private handleDataChange(): void {
    this.dataSource.data = this.data;
    this.clearSelection();
    this.reinitializeSort();
    this.scrollToTop();
  }

  /**
   * Clears row and checkbox selection
   */
  private clearSelection(): void {
    this.selectedRow = null;
    this.selection.clear();
  }

  /**
   * Reinitializes sort after data change
   */
  private reinitializeSort(): void {
    if (this.clientSideSort && this.sort) {
      this.dataSource.sort = this.sort;
    }
  }

  /**
   * Scrolls table container to top
   */
  private scrollToTop(): void {
    if (this.tableContainer?.nativeElement) {
      this.tableContainer.nativeElement.scrollTop = 0;
    }
  }

  /**
   * Handles row click events
   */
  public onRowClick(row: any): void {
    if (this.enableMultiSelect) {
      this.toggleRowSelection(row, null);
    } else {
      this.toggleSingleRowSelection(row);
    }
  }

  /**
   * Toggles single row selection
   */
  private toggleSingleRowSelection(row: any): void {
    this.selectedRow = this.selectedRow === row ? null : row;
    this.rowClick.emit(row);
  }

  /**
   * Handles Material sort change events
   */
  public onMatSortChange(sort: Sort): void {
    this.updateSortState(sort);

    if (!this.clientSideSort) {
      this.emitSortChange(sort);
    }
  }

  /**
   * Updates internal sort state
   */
  private updateSortState(sort: Sort): void {
    this.sortState = {
      active: sort.active,
      direction: sort.direction as SortDirection,
    };
  }

  /**
   * Emits sort change event
   */
  private emitSortChange(sort: Sort): void {
    this.sortChanged.emit({
      column: sort.active,
      direction: sort.direction as SortDirection,
    });
  }

  /**
   * Handles page change events
   */
  public onPageChange(event: PageEvent): void {
    this.pageChanged.emit(event);
    this.scrollToTop();
  }

  /**
   * Clears search and resets to first page
   */
  public clearSearch(): void {
    this.searchTerm = '';
    this.searchCleared.emit();

    if (this.paginator) {
      this.paginator.firstPage();
    }
  }

  /**
   * Handles keyboard navigation
   */
  @HostListener('window:keydown', ['$event'])
  handleKeyboardEvent(event: KeyboardEvent): void {
    if (this.enableMultiSelect) {
      return;
    }

    if (this.isNavigationKey(event.key)) {
      event.preventDefault();
      this.handleRowNavigation(event.key === 'ArrowDown');
    }
  }

  /**
   * Checks if key is a navigation key
   */
  private isNavigationKey(key: string): boolean {
    return key === 'ArrowDown' || key === 'ArrowUp';
  }

  /**
   * Handles row navigation with arrow keys
   */
  private handleRowNavigation(down: boolean): void {
    const rows = this.dataSource.filteredData;
    if (!rows.length) {
      return;
    }

    const newIndex = this.calculateNewRowIndex(rows, down);
    const newRow = rows[newIndex];

    if (newRow) {
      this.onRowClick(newRow);
      this.scrollRowIntoView(newIndex);
    }
  }

  /**
   * Calculates new row index for navigation
   */
  private calculateNewRowIndex(rows: any[], down: boolean): number {
    const currentIndex = rows.findIndex((row) => row === this.selectedRow);
    let newIndex = down ? currentIndex + 1 : currentIndex - 1;

    if (newIndex < 0) {
      newIndex = rows.length - 1;
    }
    if (newIndex >= rows.length) {
      newIndex = 0;
    }

    return newIndex;
  }

  /**
   * Scrolls row into view
   */
  private scrollRowIntoView(index: number): void {
    setTimeout(() => {
      const rowElements = document.querySelectorAll('.clickable-row');
      const rowElement = rowElements[index];

      if (rowElement) {
        rowElement.scrollIntoView({
          behavior: 'smooth',
          block: 'nearest',
        });
      }
    }, ROW_NAVIGATION_DELAY_MS);
  }

  /**
   * Gets appropriate empty state message
   */
  public getEmptyStateMessage(): string {
    return this.searchTerm
      ? `${this.noResultsText} "${this.searchTerm}"`
      : this.emptyStateText;
  }

  /**
   * TrackBy function for performance optimization
   */
  public trackByFn = (index: number, item: any): any => {
    return item[this.trackByField] ?? index;
  };

  /**
   * Gets CSS class for status display
   */
  public getStatusClass(status: string): string {
    if (!status) {
      return 'status-default';
    }

    const statusMap: Record<string, string[]> = {
      'status-in-use': ['đang sử dụng'],
      'status-ready': ['sẵn sàng'],
      'status-repair': ['bảo trì', 'sửa chữa'],
      'status-broken': ['hỏng', 'thanh lý'],
    };

    const lowerStatus = status.toLowerCase();

    for (const [className, keywords] of Object.entries(statusMap)) {
      if (keywords.some((keyword) => lowerStatus.includes(keyword))) {
        return className;
      }
    }

    return 'status-default';
  }

  /**
   * Handles row action button clicks
   */
  public onRowAction(action: string, element: any, event: MouseEvent): void {
    event.stopPropagation();
    this.rowAction.emit({ action, data: element });
  }

  /**
   * Prevents checkbox click from bubbling
   */
  public onCheckboxClick(event: MouseEvent): void {
    event.stopPropagation();
  }

  /**
   * Toggles row selection in multi-select mode
   */
  public toggleRowSelection(row: any, event: MouseEvent | null): void {
    if (event) {
      event.stopPropagation();
    }

    this.selectedRow = null;
    this.rowClick.emit(null);
    this.selection.toggle(row);
  }

  /**
   * Checks if all rows are selected
   */
  public isAllSelected(): boolean {
    const numSelected = this.selection.selected.length;
    const numRows = this.dataSource.data.length;
    return numSelected === numRows && numRows > 0;
  }

  /**
   * Toggles selection for all rows
   */
  public masterToggle(): void {
    this.selectedRow = null;
    this.rowClick.emit(null);

    if (this.isAllSelected()) {
      this.selection.clear();
    } else {
      this.selection.select(...this.dataSource.data);
    }
  }

  /**
   * Gets accessibility label for checkboxes
   */
  public checkboxLabel(row?: any): string {
    if (!row) {
      return `${this.isAllSelected() ? 'deselect' : 'select'} all`;
    }

    const rowId = row[this.trackByField] || '';
    const action = this.selection.isSelected(row) ? 'deselect' : 'select';

    return `${action} row ${rowId}`;
  }

  /**
   * Gets selected rows
   */
  public getSelectedRows(): any[] {
    return this.selection.selected;
  }

  /**
   * Checks if a row is selected
   */
  public isRowSelected(row: any): boolean {
    return this.selection.isSelected(row);
  }

  /**
   * Clears all selections
   */
  public clearAllSelections(): void {
    this.clearSelection();
  }

  /**
   * Selects specific rows
   */
  public selectRows(rows: any[]): void {
    this.selection.clear();
    this.selection.select(...rows);
  }

  /**
   * Gets current page data
   */
  public getCurrentPageData(): any[] {
    return this.dataSource.filteredData;
  }

  /**
   * Refreshes table data source
   */
  public refresh(): void {
    this.dataSource.data = [...this.data];
  }
}