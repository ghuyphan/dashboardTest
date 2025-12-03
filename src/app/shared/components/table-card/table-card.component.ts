import {
  Component,
  inject,
  input,
  output,
  ChangeDetectionStrategy,
  ViewEncapsulation,
  computed
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatMenuModule } from '@angular/material/menu';
import { MatIconModule } from '@angular/material/icon';
import { ActivatedRoute } from '@angular/router';

import { ReusableTableComponent, GridColumn, RowActionEvent } from '../reusable-table/reusable-table.component';
import { ExcelExportService, ExportColumn } from '../../../core/services/excel-export.service';
import { HasPermissionDirective } from '../../directives/has-permission.directive';

export interface ExportConfig {
  fileName: string;
  columns: ExportColumn[];
}

@Component({
  selector: 'app-table-card',
  standalone: true,
  imports: [
    CommonModule,
    ReusableTableComponent,
    MatMenuModule,
    MatIconModule,
    HasPermissionDirective
  ],
  templateUrl: './table-card.component.html',
  styleUrls: ['./table-card.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.Emulated,
  // [FIX] Remove the native 'title' attribute from the host element to prevent the browser tooltip
  host: {
    '[attr.title]': 'null'
  }
})
export class TableCardComponent<T> {
  private excelService = inject(ExcelExportService);
  private route = inject(ActivatedRoute);

  // --- Card Inputs ---
  public title = input.required<string>();
  public icon = input<string>('');
  public iconClass = input<string>('');

  // --- Table Inputs (Passthrough) ---
  public data = input<T[]>([]);
  public columns = input<GridColumn[]>([]);
  public isLoading = input<boolean>(false);
  public showPaginator = input<boolean>(true);
  public pageSize = input<number>(10);
  public pageSizeOptions = input<number[]>([10, 25, 50, 100]);
  public clientSideSort = input<boolean>(true);
  public emptyStateText = input<string>('Không có dữ liệu.');

  // --- Export Inputs ---
  public enableExport = input<boolean>(false);
  public isExporting = input<boolean>(false);
  public exportConfig = input<ExportConfig | null>(null);

  /**
   * [Optional] Manually specify the permission key for the export button.
   * If provided, this overrides the auto-detected route permission.
   */
  public exportPermission = input<string | undefined>(undefined);

  /**
   * Computes the final permission string required to see the Export button.
   * Priority:
   * 1. `exportPermission` input (Manual override).
   * 2. Auto-derived from the current Route's `data.permission` + `.REXPORT`.
   * 3. `undefined` (If no permission found, button is visible to all).
   */
  public fullExportPermission = computed(() => {
    // 1. Check for manual override input
    const manualOverride = this.exportPermission();
    if (manualOverride) {
      return manualOverride;
    }

    // 2. Traverse to find the deepest active route (where the data usually lives)
    let currentRoute = this.route.snapshot;
    while (currentRoute.firstChild) {
      currentRoute = currentRoute.firstChild;
    }

    // 3. Derive from Route Data
    const basePermission = currentRoute.data['permission'] as string | undefined;
    if (basePermission) {
      return `${basePermission}.REXPORT`;
    }

    return undefined;
  });

  // --- Outputs ---
  public exportClicked = output<void>();
  public rowClick = output<T>();
  public rowAction = output<RowActionEvent<T>>();

  // --- Logic ---
  public onExport(): void {
    const config = this.exportConfig();

    // 1. Automatic Export (if config is provided)
    if (config) {
      this.excelService.exportToExcel(this.data(), config.fileName, config.columns);
    }

    // 2. Always emit event (Parent might want to handle custom logic)
    this.exportClicked.emit();
  }

  public onRowClick(row: T | undefined): void {
    if (row) this.rowClick.emit(row);
  }

  public onRowAction(event: RowActionEvent<T>): void {
    this.rowAction.emit(event);
  }
}