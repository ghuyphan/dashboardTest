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

import { TooltipDirective } from '../../shared/directives/tooltip.directive';
import { HighlightSearchPipe } from '../../shared/pipes/highlight-search.pipe';

const ROW_NAVIGATION_DELAY_MS = 50;
const DEFAULT_PAGE_SIZE = 10;
const DEFAULT_PAGE_SIZE_OPTIONS = [5, 10, 25, 50];
const DEFAULT_TRACK_BY_FIELD = 'Id';

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

export interface RowActionEvent<T = any> {
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
  private scrollTimer: any = null;

  // --- Inputs (Signals) ---
  public data = input<T[]>([]);
  public columns = input<GridColumn[]>([]);
  public searchTerm = input('');
  public isLoading = input(false);
  public pageSize = input(DEFAULT_PAGE_SIZE);
  public pageSizeOptions = input(DEFAULT_PAGE_SIZE_OPTIONS);
  public showLoadingText = input(true);
  public emptyStateText = input('Không có dữ liệu');
  public noResultsText = input('Không tìm thấy kết quả phù hợp');
  public trackByField = input(DEFAULT_TRACK_BY_FIELD);
  public enableMultiSelect = input(false);
  public totalDataLength = input(0);
  public showPaginator = input(true);
  public clientSideSort = input(false);
  public headerColor = input<string | null>(null);

  // --- Outputs (Signals) ---
  public rowClick = output<T | undefined>();
  public sortChanged = output<SortChangedEvent>();
  public pageChanged = output<PageEvent>();
  public searchCleared = output<void>();
  public rowAction = output<RowActionEvent<T>>();
  public selectionChanged = output<T[]>();

  // --- View Queries (Signals) ---
  public sort = viewChild(MatSort);
  public paginator = viewChild(MatPaginator);
  public tableContainer = viewChild<ElementRef>('tableContainer');

  // --- Public Properties ---
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

      // CRITICAL FIX: Clear selection when selection mode changes or columns change
      // This prevents ghost selections when switching from multi to single mode
      this.selection.clear();
      this.selectedRow = null;
      this.rowClick.emit(undefined);

      this.updateDisplayedColumns(cols, multiSelect);
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

  private initializeSelectionListener(): void {
    this.selection.changed.subscribe(() => {
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
    enableMultiSelect: boolean
  ): void {
    const baseColumns = cols.map((col) => col.key);
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
    const currentIndex = rows.findIndex((row) => row === this.selectedRow);
    let newIndex = down ? currentIndex + 1 : currentIndex - 1;
    if (newIndex < 0) newIndex = rows.length - 1;
    if (newIndex >= rows.length) newIndex = 0;
    return newIndex;
  }

  private scrollRowIntoView(index: number): void {
    if (this.scrollTimer) clearTimeout(this.scrollTimer);

    this.scrollTimer = setTimeout(() => {
      const rowElements = document.querySelectorAll('.clickable-row');
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

  public trackByFn = (index: number, item: any): any => {
    return item[this.trackByField()] ?? index;
  };

  public getStatusClass(status: string): string {
    if (!status) return 'status-default';
    const lower = status.toLowerCase();
    if (lower.includes('đang sử dụng')) return 'status-in-use';
    if (lower.includes('sẵn sàng')) return 'status-ready';
    if (lower.includes('đang bảo trì') || lower.includes('đang sửa chữa'))
      return 'status-maintenance';
    if (lower.includes('bảo trì') || lower.includes('sửa chữa'))
      return 'status-repair';
    if (lower.includes('hỏng') || lower.includes('thanh lý'))
      return 'status-broken';
    return 'status-default';
  }

  public onRowAction(action: string, element: T, event: MouseEvent): void {
    event.stopPropagation();
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

  public checkboxLabel(row?: any): string {
    if (!row) {
      return `${this.isAllSelected() ? 'deselect' : 'select'} all`;
    }
    const rowId = row[this.trackByField()] || '';
    const action = this.selection.isSelected(row) ? 'deselect' : 'select';
    return `${action} row ${rowId}`;
  }

  public getSelectedRows(): T[] {
    return this.selection.selected;
  }

  public isRowSelected(row: T): boolean {
    return this.selection.isSelected(row);
  }

  public clearAllSelections(): void {
    this.clearSelection();
  }

  public selectRows(rows: T[]): void {
    this.selection.clear();
    this.selection.select(...rows);
  }

  public getCurrentPageData(): T[] {
    return this.dataSource.filteredData;
  }

  public refresh(): void {
    this.dataSource.data = [...this.data()];
  }
}
