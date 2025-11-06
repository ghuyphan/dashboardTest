import {
  Component,
  Input,
  Output,
  EventEmitter,
  Renderer2,
  OnDestroy,
  ViewChild,
  ElementRef,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ScrollingModule } from '@angular/cdk/scrolling'; // <-- ADDED: CDK Scrolling

export interface GridColumn {
  key: string;
  label: string;
  sortable?: boolean;
  width?: number; // <-- ADDED: For resizing
}

export type SortDirection = 'asc' | 'desc';
export interface SortChangedEvent {
  key: string;
  direction: SortDirection;
}

@Component({
  selector: 'app-reusable-grid',
  standalone: true,
  imports: [CommonModule, ScrollingModule], // <-- UPDATED: Add ScrollingModule
  templateUrl: './reusable-grid.component.html',
  styleUrl: './reusable-grid.component.scss',
})
export class ReusableGridComponent implements OnDestroy {
  @Input() columns: GridColumn[] = [];
  @Input() data: any[] = [];
  @Input() virtualScrollHeight: string = '500px'; // <-- ADDED: Height for virtual scroll
  @Input() virtualScrollItemSize: number = 40; // <-- ADDED: Approx. row height

  @Output() rowSelected = new EventEmitter<any>();
  @Output() sortChanged = new EventEmitter<SortChangedEvent>();

  // --- START OF NEW SCROLL/RESIZE CODE ---

  // Viewport elements for syncing horizontal scroll
  @ViewChild('headerWrapper') headerWrapper!: ElementRef<HTMLElement>;
  @ViewChild('bodyWrapper') bodyWrapper!: ElementRef<HTMLElement>;

  // Properties for resizing
  public resizingColumn: GridColumn | null = null; // <-- FIX: Was private
  private startX: number = 0;
  private startWidth: number = 0;
  private globalMouseMoveListener: (() => void) | null = null;
  private globalMouseUpListener: (() => void) | null = null;

  // --- END OF NEW SCROLL/RESIZE CODE ---

  public sortColumn: string | null = null;
  public sortDirection: SortDirection = 'asc';
  public selectedRow: any | null = null;

  constructor(private renderer: Renderer2) {}

  /**
   * Sort logic (unchanged from original)
   */
  public onSort(column: GridColumn): void {
    if (!column.sortable) {
      return;
    }
    if (this.sortColumn === column.key) {
      this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      this.sortColumn = column.key;
      this.sortDirection = 'asc';
    }
    this.sortChanged.emit({
      key: this.sortColumn,
      direction: this.sortDirection,
    });
  }

  /**
   * Row click logic (unchanged from original)
   */
  public onRowClick(row: any): void {
    this.selectedRow = row;
    this.rowSelected.emit(row);
  }

  // --- START OF NEW RESIZING METHODS ---

  /**
   * Called on mousedown on a column resizer handle.
   */
  public onResizeStart(
    event: MouseEvent,
    column: GridColumn,
    th: HTMLTableCellElement
  ): void {
    event.preventDefault();
    event.stopPropagation();

    this.resizingColumn = column;
    this.startX = event.clientX;
    this.startWidth = th.getBoundingClientRect().width;

    // Listen to global mouse events
    this.globalMouseMoveListener = this.renderer.listen(
      'document',
      'mousemove',
      (e: MouseEvent) => this.onResizeMove(e)
    );
    this.globalMouseUpListener = this.renderer.listen(
      'document',
      'mouseup',
      () => this.onResizeEnd()
    );
  }

  /**
   * Called on document mousemove while resizing.
   */
  private onResizeMove(event: MouseEvent): void {
    if (!this.resizingColumn) return;

    const delta = event.clientX - this.startX;
    const newWidth = this.startWidth + delta;

    // Set a minimum width (e.g., 80px)
    this.resizingColumn.width = newWidth > 80 ? newWidth : 80;
  }

  /**
   * Called on document mouseup to end resizing.
   */
  private onResizeEnd(): void {
    this.resizingColumn = null;

    // Remove global listeners
    if (this.globalMouseMoveListener) {
      this.globalMouseMoveListener();
      this.globalMouseMoveListener = null;
    }
    if (this.globalMouseUpListener) {
      this.globalMouseUpListener();
      this.globalMouseUpListener = null;
    }
  }

  /**
   * Syncs the header scroll with the body scroll.
   */
  public onBodyScroll(): void {
    if (this.headerWrapper && this.bodyWrapper) {
      this.headerWrapper.nativeElement.scrollLeft =
        this.bodyWrapper.nativeElement.scrollLeft;
    }
  }

  /**
   * Clean up listeners when component is destroyed.
   */
  ngOnDestroy(): void {
    this.onResizeEnd(); // This will clean up any active listeners
  }
  // --- END OF NEW RESIZING METHODS ---
}