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
   * Loads a Word template, fills it with data, and triggers a download.
   * @param templatePath Path to the .docx template in assets (e.g., 'assets/templates/report.docx')
   * @param data The JSON object containing the data to fill into the template
   * @param outputFileName The name of the file to be downloaded
   */
  public generateReport(templatePath: string, data: any, outputFileName: string): void {
    // 1. Load the template file as a binary array buffer
    this.http.get(templatePath, { responseType: 'arraybuffer' }).subscribe({
      next: (content: ArrayBuffer) => {
        try {
          // Check if the server returned HTML (SPA fallback error)
          const textDecoder = new TextDecoder('utf-8');
          // Peek at the first 100 bytes to see if it looks like HTML
          const textContent = textDecoder.decode(content.slice(0, 100)); 
          
          if (textContent.includes('<!DOCTYPE html>') || textContent.includes('<html')) {
            throw new Error('File not found (Server returned HTML). Check assets path.');
          }

          // 2. Unzip the content of the file
          const zip = new PizZip(content);

          // 3. Parse the template
          const doc = new Docxtemplater(zip, {
            paragraphLoop: true,
            linebreaks: true,
          });

          // 4. Render the document (replace variables with data)
          doc.render(data);

          // 5. Generate the output file blob
          const out = doc.getZip().generate({
            type: 'blob',
            mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          });

          // 6. Save the file to the user's computer
          saveAs(out, outputFileName);

        } catch (error) {
          console.error('Error generating Word report:', error);
          alert('Có lỗi xảy ra khi tạo báo cáo (Template Error).');
        }
      },
      error: (err) => {
        console.error('Error loading template file:', err);
        alert('Không tìm thấy file mẫu báo cáo (404).');
      }
    });
  }

  /**
   * Generates the report and returns it as a Blob for viewing or printing,
   * instead of downloading it immediately.
   * @param templatePath Path to the .docx template
   * @param data Data to fill
   */
  public generateReportBlob(templatePath: string, data: any): Observable<Blob> {
    return this.http.get(templatePath, { responseType: 'arraybuffer' }).pipe(
      map((content: ArrayBuffer) => {
        // Check for HTML fallback error
        const textDecoder = new TextDecoder('utf-8');
        const textContent = textDecoder.decode(content.slice(0, 100));
        if (textContent.includes('<!DOCTYPE html>') || textContent.includes('<html')) {
          throw new Error('Template file not found (got HTML instead of DOCX).');
        }

        const zip = new PizZip(content);
        const doc = new Docxtemplater(zip, {
          paragraphLoop: true,
          linebreaks: true,
        });

        doc.render(data);

        return doc.getZip().generate({
          type: 'blob',
          mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        });
      }),
      catchError(error => {
        console.error('Error generating report blob:', error);
        return throwError(() => error);
      })
    );
  }
}