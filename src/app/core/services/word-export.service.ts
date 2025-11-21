import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { saveAs } from 'file-saver';
import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';
import { Observable, throwError } from 'rxjs';
import { map, catchError } from 'rxjs/operators';

@Injectable({
  providedIn: 'root'
})
export class WordExportService {

  constructor(private http: HttpClient) { }

  /**
   * Helper to detect if a response is actually HTML (error page) instead of a binary file.
   * This happens often in SPAs when a file path is wrong and index.html is returned.
   */
  private isHtmlResponse(buffer: ArrayBuffer): boolean {
    const textDecoder = new TextDecoder('utf-8');
    // Check the first few bytes
    const textContent = textDecoder.decode(buffer.slice(0, 500)).trim().toLowerCase();
    return textContent.startsWith('<!doctype html') || textContent.startsWith('<html');
  }

  /**
   * Internal helper to fetch and prepare the docxtemplater instance.
   */
  private createDocFromTemplate(templatePath: string, data: any): Observable<Docxtemplater<PizZip>> {
    return this.http.get(templatePath, { responseType: 'arraybuffer' }).pipe(
      map((content: ArrayBuffer) => {
        // 1. Check for 404/HTML error
        if (this.isHtmlResponse(content)) {
          throw new Error(`File mẫu không tìm thấy ('${templatePath}'). Server trả về trang HTML.`);
        }

        // 2. Unzip
        const zip = new PizZip(content);
        
        // 3. Create Docxtemplater instance
        return new Docxtemplater(zip, {
          paragraphLoop: true,
          linebreaks: true,
          nullGetter: () => '' // Replace null/undefined with empty string automatically
        });
      }),
      map(doc => {
        // 4. Render data
        doc.render(data);
        return doc;
      })
    );
  }

  /**
   * Generates the report and immediately triggers a download in the browser.
   */
  public generateReport(templatePath: string, data: any, outputFileName: string): void {
    this.createDocFromTemplate(templatePath, data).subscribe({
      next: (doc) => {
        try {
          const out = doc.getZip().generate({
            type: 'blob',
            mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          });
          saveAs(out, outputFileName);
        } catch (error) {
          console.error('Error generating Word file:', error);
          alert('Lỗi khi tạo file báo cáo.');
        }
      },
      error: (err) => {
        console.error(err);
        alert(err.message || 'Không tìm thấy mẫu báo cáo.');
      }
    });
  }

  /**
   * Generates the report and returns it as a Blob (for Preview/Printing).
   */
  public generateReportBlob(templatePath: string, data: any): Observable<Blob> {
    return this.createDocFromTemplate(templatePath, data).pipe(
      map((doc) => {
        return doc.getZip().generate({
          type: 'blob',
          mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        });
      }),
      catchError(error => {
        console.error('Error generating report blob:', error);
        return throwError(() => new Error('Không thể tạo bản xem trước. Vui lòng kiểm tra file mẫu.'));
      })
    );
  }
}