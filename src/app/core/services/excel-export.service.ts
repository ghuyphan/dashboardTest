import { Injectable } from '@angular/core';
import { saveAs } from 'file-saver';
import { DateUtils } from '../../shared/utils/date.utils';

export interface ExportColumn {
  key: string;       // Key in your data object
  header: string;    // Column header text in Excel
  type?: 'text' | 'date' | 'number' | 'currency'; // Format type
}

@Injectable({
  providedIn: 'root'
})
export class ExcelExportService {

  constructor() { }

  public async exportToExcel<T>(data: T[], fileName: string, columns: ExportColumn[]): Promise<void> {
    if (!data || data.length === 0) {
      return;
    }

    // [OPTIMIZATION] Dynamic Import to avoid blocking main bundle
    const XLSX = await import('@e965/xlsx');

    // 1. Transform data: Map internal keys to Display Headers and format values
    const exportData = data.map(row => {
      const newRow: Record<string, any> = {};

      columns.forEach(col => {
        const val = (row as any)[col.key];
        // Use the header string as the key for the new object
        // This ensures the Excel column headers match your configuration
        newRow[col.header] = this.formatValue(val, col.type);
      });

      return newRow;
    });

    // 2. Create Worksheet
    const worksheet = XLSX.utils.json_to_sheet(exportData);

    // Optional: Auto-width adjustment (Basic implementation)
    this.autoFitColumns(worksheet, exportData, XLSX);

    // 3. Create Workbook
    const workbook = {
      Sheets: { 'data': worksheet },
      SheetNames: ['data']
    };

    // 4. Write to Buffer
    const excelBuffer: any = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });

    // 5. Save File
    this.saveAsExcelFile(excelBuffer, fileName);
  }

  private formatValue(value: any, type?: string): any {
    if (value === null || value === undefined) return '';

    if (type === 'date') {
      return DateUtils.formatToDisplay(value);
    }
    // You can add currency formatting here if needed, 
    // though often it's better to send raw numbers to Excel and let Excel handle formatting.
    return value;
  }

  private saveAsExcelFile(buffer: any, fileName: string): void {
    const EXCEL_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;charset=UTF-8';
    const EXCEL_EXTENSION = '.xlsx';

    const data: Blob = new Blob([buffer], { type: EXCEL_TYPE });
    saveAs(data, fileName + '_export_' + new Date().getTime() + EXCEL_EXTENSION);
  }

  /**
   * Helper to calculate column width based on content length
   */
  private autoFitColumns(ws: any, data: any[], XLSX: any) {
    if (!data || data.length === 0) return;

    const objectMaxLength: number[] = [];
    const headers = Object.keys(data[0]);

    // Check header lengths
    headers.forEach((key, i) => {
      objectMaxLength[i] = key.length;
    });

    // Check data lengths (sampling first 50 rows for performance)
    data.slice(0, 50).forEach(d => {
      headers.forEach((key, i) => {
        const value = d[key] ? String(d[key]) : '';
        if (value.length > objectMaxLength[i]) {
          objectMaxLength[i] = value.length;
        }
      });
    });

    ws['!cols'] = objectMaxLength.map(w => ({ width: w + 2 }));
  }
}