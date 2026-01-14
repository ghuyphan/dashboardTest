import {
  Component,
  Injectable,
  HostListener,
  ElementRef,
  OnInit,
  AfterViewInit,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  inject,
  ViewEncapsulation,
  input,
  output,
  viewChild,
  effect,
  DestroyRef,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
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

const ROW_NAVIGATION_DELAY_MS = 50;
const DEFAULT_PAGE_SIZE = 10;
const DEFAULT_PAGE_SIZE_OPTIONS = [10, 25, 50, 100];
const DEFAULT_TRACK_BY_FIELD = 'id';

export type ColumnType = 'text' | 'currency' | 'date' | 'status' | 'actions';

export interface GridColumn {
  key: string;
  label: string;
  type?: ColumnType;
  sortable: boolean;
  width?: string;
  sticky?: 'start' | 'end' | false;
  statusClassFn?: (value: string) => string;
}

export interface TableAction<T = unknown> {
  action: string;
  label: string;
  icon: string;
  color?: 'primary' | 'accent' | 'warn';
  visibleFn?: (row: T) => boolean;
}

export type SortDirection = 'asc' | 'desc' | '';

export interface SortChangedEvent {
  column: string;
  direction: SortDirection;
}

export interface RowActionEvent<T = unknown> {
  action: string;
  data: T;
}

interface SortState {
  active: string;
  direction: SortDirection;
}

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
  encapsulation: ViewEncapsulation.None,
  host: {
    '[style.--table-header-bg]': 'headerColor()',
  },
})
export class ReusableTableComponent<T> implements OnInit, AfterViewInit {
  private cdr = inject(ChangeDetectorRef);
  private elementRef = inject(ElementRef);
  private destroyRef = inject(DestroyRef);
  private scrollTimer: ReturnType<typeof setTimeout> | null = null;

  public data = input<T[]>([]);
  public columns = input<GridColumn[]>([]);
  public rowActions = input<TableAction<T>[]>([]);
  public searchTerm = input('');
  public isLoading = input(false);
  public pageSize = input(DEFAULT_PAGE_SIZE);
  public pageSizeOptions = input(DEFAULT_PAGE_SIZE_OPTIONS);
  public showLoadingText = input(true);
  public showSkeletonLoading = input(true);
  public emptyStateText = input('Không có dữ liệu');
  public noResultsText = input('Không tìm thấy kết quả phù hợp');
  public trackByField = input(DEFAULT_TRACK_BY_FIELD);
  public enableMultiSelect = input(false);
  public totalDataLength = input(0);
  public showPaginator = input(true);
  public clientSideSort = input(false);
  public headerColor = input<string | null>(null);
  public pageIndex = input(0);
  public sortActive = input('');
  public sortDirection = input<SortDirection>('');

  // NEW: Option to toggle action column visibility on PC
  public showActionColumn = input(true);

  // NEW: Option to disable row click events and styling
  public disableRowClick = input(false);

  // Skeleton loading row count (configurable)
  public skeletonRowCount = input(20);
  public readonly skeletonRows = Array.from({ length: 20 });

  public rowClick = output<T | undefined>();
  public sortChanged = output<SortChangedEvent>();
  public pageChanged = output<PageEvent>();
  public searchCleared = output<void>();
  public rowAction = output<RowActionEvent<T>>();
  public selectionChanged = output<T[]>();

  public sort = viewChild(MatSort);
  public paginator = viewChild(MatPaginator);
  public tableContainer = viewChild<ElementRef>('tableContainer');

  public readonly dataSource = new MatTableDataSource<T>();
  public displayedColumns: string[] = [];
  public selectedRow: T | null = null;

  public readonly selection = new SelectionModel<T>(true, []);
  public sortState: SortState = { active: '', direction: '' };

  constructor() {
    effect(() => {
      const currentData = this.data();
      this.handleDataChange(currentData);
    });

    effect(() => {
      const cols = this.columns();
      const multiSelect = this.enableMultiSelect();
      const showActions = this.showActionColumn();

      if (!multiSelect) this.selection.clear();
      this.updateDisplayedColumns(cols, multiSelect, showActions);
    });

    effect(() => {
      const sortInstance = this.sort();
      const paginatorInstance = this.paginator();
      const isClientSort = this.clientSideSort();

      if (isClientSort) {
        if (sortInstance) this.dataSource.sort = sortInstance;
        if (paginatorInstance) this.dataSource.paginator = paginatorInstance;
      }
    });
  }

  ngOnInit(): void {
    this.initializeSelectionListener();
  }

  ngAfterViewInit(): void {
    this.initializeSortState();
  }

  ngOnDestroy(): void {
    if (this.scrollTimer) clearTimeout(this.scrollTimer);
  }

  public isDateValue(value: unknown): boolean {
    if (value === null || value === undefined || value === '') return false;
    if (
      typeof value === 'string' &&
      (value === 'N/A' || value.toLowerCase() === 'na')
    )
      return false;

    const date = new Date(value as string | number | Date);
    return !isNaN(date.getTime());
  }

  private initializeSelectionListener(): void {
    this.selection.changed
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.selectionChanged.emit(this.selection.selected);
      });
  }

  private initializeSortState(): void {
    const sortInstance = this.sort();
    if (sortInstance) {
      this.sortState = {
        active: sortInstance.active,
        direction: sortInstance.direction as SortDirection,
      };
    }
  }

  private updateDisplayedColumns(
    cols: GridColumn[],
    enableMultiSelect: boolean,
    showActions: boolean
  ): void {
    // Filter columns based on showActionColumn input
    const visibleCols = showActions
      ? cols
      : cols.filter(col => col.type !== 'actions');

    const baseColumns = visibleCols.map(col => col.key);
    this.displayedColumns = enableMultiSelect
      ? ['select', ...baseColumns]
      : baseColumns;

    this.cdr.markForCheck();
  }

  private handleDataChange(data: T[]): void {
    this.dataSource.data = data;
    this.clearSelection();
    this.scrollToTop();
  }

  private clearSelection(): void {
    this.selectedRow = null;
    this.selection.clear();
  }

  private scrollToTop(): void {
    const container = this.tableContainer();
    if (container?.nativeElement) {
      container.nativeElement.scrollTop = 0;
    }
  }

  public onRowClick(row: T): void {
    if (this.disableRowClick()) return;

    if (this.enableMultiSelect()) {
      this.toggleRowSelection(row, null);
    } else {
      this.toggleSingleRowSelection(row);
    }
  }

  private toggleSingleRowSelection(row: T): void {
    this.selectedRow = this.selectedRow === row ? null : row;
    this.rowClick.emit(this.selectedRow || undefined);
  }

  public onMatSortChange(sort: Sort): void {
    this.updateSortState(sort);
    if (!this.clientSideSort()) {
      this.emitSortChange(sort);
    }
  }

  private updateSortState(sort: Sort): void {
    this.sortState = {
      active: sort.active,
      direction: sort.direction as SortDirection,
    };
  }

  private emitSortChange(sort: Sort): void {
    this.sortChanged.emit({
      column: sort.active,
      direction: sort.direction as SortDirection,
    });
  }

  public onPageChange(event: PageEvent): void {
    this.pageChanged.emit(event);
    this.scrollToTop();
  }

  public clearSearch(): void {
    this.searchCleared.emit();
    const paginatorInstance = this.paginator();
    if (paginatorInstance) {
      paginatorInstance.firstPage();
    }
  }

  @HostListener('window:keydown', ['$event'])
  handleKeyboardEvent(event: KeyboardEvent): void {
    if (this.enableMultiSelect()) return;
    if (this.isNavigationKey(event.key)) {
      event.preventDefault();
      this.handleRowNavigation(event.key === 'ArrowDown');
    }
  }

  private isNavigationKey(key: string): boolean {
    return key === 'ArrowDown' || key === 'ArrowUp';
  }

  private handleRowNavigation(down: boolean): void {
    const rows = this.dataSource.filteredData;
    if (!rows.length) return;

    const newIndex = this.calculateNewRowIndex(rows, down);
    const newRow = rows[newIndex];

    if (newRow) {
      this.onRowClick(newRow);
      this.scrollRowIntoView(newIndex);
    }
  }

  private calculateNewRowIndex(rows: T[], down: boolean): number {
    const currentIndex = rows.findIndex(row => row === this.selectedRow);
    let newIndex = down ? currentIndex + 1 : currentIndex - 1;
    if (newIndex < 0) newIndex = rows.length - 1;
    if (newIndex >= rows.length) newIndex = 0;
    return newIndex;
  }

  private scrollRowIntoView(index: number): void {
    if (this.scrollTimer) clearTimeout(this.scrollTimer);

    this.scrollTimer = setTimeout(() => {
      const rowElements =
        this.elementRef.nativeElement.querySelectorAll('.clickable-row');
      const rowElement = rowElements[index];
      if (rowElement) {
        rowElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }, ROW_NAVIGATION_DELAY_MS);
  }

  public getEmptyStateMessage(): string {
    return this.searchTerm()
      ? `${this.noResultsText()} "${this.searchTerm()}"`
      : this.emptyStateText();
  }

  public trackByFn = (index: number, item: T): unknown => {
    return (item as any)[this.trackByField()] ?? index;
  };

  public onActionClick(action: string, element: T, event: MouseEvent): void {
    // [FIX] Do not stop propagation so the MatMenu can close automatically upon selection
    // event.stopPropagation();
    this.rowAction.emit({ action, data: element });
  }

  public onCheckboxClick(event: MouseEvent): void {
    event.stopPropagation();
  }

  public toggleRowSelection(row: T, event: MouseEvent | null): void {
    if (event) event.stopPropagation();
    this.selectedRow = null;
    this.rowClick.emit(undefined);
    this.selection.toggle(row);
  }

  public isAllSelected(): boolean {
    const numSelected = this.selection.selected.length;
    const numRows = this.dataSource.data.length;
    return numSelected === numRows && numRows > 0;
  }

  public masterToggle(): void {
    this.selectedRow = null;
    this.rowClick.emit(undefined);
    if (this.isAllSelected()) {
      this.selection.clear();
    } else {
      this.selection.select(...this.dataSource.data);
    }
  }

  public checkboxLabel(row?: T): string {
    if (!row) {
      return `${this.isAllSelected() ? 'deselect' : 'select'} all`;
    }
    const rowId = (row as any)[this.trackByField()] || '';
    const action = this.selection.isSelected(row) ? 'deselect' : 'select';
    return `${action} row ${rowId}`;
  }

  public getSelectedRows(): T[] {
    return this.selection.selected;
  }

  public refresh(): void {
    this.dataSource.data = [...this.data()];
  }
}
