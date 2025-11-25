import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { PDFDocument, PDFCheckBox, PDFTextField } from 'pdf-lib';
import { saveAs } from 'file-saver';
import { firstValueFrom } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class PdfService {

  constructor(private http: HttpClient) { }

  /**
   * Loads a PDF template, fills it with data, and triggers a browser print/download.
   * @param templatePath Path to the PDF file in assets (e.g. 'assets/templates/form.pdf')
   * @param data Object containing values to fill into the form fields
   * @param outputFilename Name of the file to save (e.g. 'report.pdf')
   * @param action 'print' to open print dialog, 'download' to save file
   */
  async generatePdf(
    templatePath: string,
    data: Record<string, any>,
    outputFilename: string,
    action: 'print' | 'download' = 'print'
  ): Promise<void> {
    try {
      // 1. Fetch template
      const templateBytes = await firstValueFrom(
        this.http.get(templatePath, { responseType: 'arraybuffer' })
      );

      if (!templateBytes) throw new Error('Failed to load PDF template.');

      // 2. Load PDF Document
      const pdfDoc = await PDFDocument.load(templateBytes);
      const form = pdfDoc.getForm();

      // 3. Fill Fields
      // Iterate through all fields found in the PDF
      const fields = form.getFields();
      
      fields.forEach(field => {
        const fieldName = field.getName();
        const value = data[fieldName];

        // Skip if no data provided for this field
        if (value === undefined || value === null) return;

        try {
          if (field instanceof PDFTextField) {
            // Fill Text Field
            field.setText(String(value));
          } else if (field instanceof PDFCheckBox && value === true) {
            // Check Checkbox
            field.check();
          }
        } catch (err) {
          console.warn(`Warning: Could not fill field "${fieldName}"`, err);
        }
      });

      // 4. Flatten the form (converts editable fields to regular text)
      form.flatten();

      // 5. Save the PDF
      const pdfBytes = await pdfDoc.save();
      // Cast to 'any' to resolve strict TypeScript definition mismatch for BlobPart
      const blob = new Blob([pdfBytes as any], { type: 'application/pdf' });

      // 6. Handle Output
      if (action === 'download') {
        saveAs(blob, outputFilename);
      } else {
        this.printBlob(blob);
      }

    } catch (error) {
      console.error('PDF Generation Error:', error);
      throw error; // Re-throw so the component can show a Toast error
    }
  }

  /**
   * Creates an invisible iframe to trigger the browser print dialog
   */
  private printBlob(blob: Blob): void {
    const blobUrl = URL.createObjectURL(blob);
    const iframe = document.createElement('iframe');
    
    // Hide the iframe
    Object.assign(iframe.style, {
      position: 'fixed',
      top: '0',
      left: '0',
      width: '0',
      height: '0',
      border: 'none',
      visibility: 'hidden'
    });

    iframe.src = blobUrl;
    document.body.appendChild(iframe);

    iframe.onload = () => {
      // Small delay to ensure rendering is finished
      setTimeout(() => {
        try {
          iframe.contentWindow?.focus();
          iframe.contentWindow?.print();
        } catch (e) {
          console.error('Print failed:', e);
        } finally {
          // Cleanup after 1 minute (allows time for print dialog interaction)
          setTimeout(() => {
            document.body.removeChild(iframe);
            URL.revokeObjectURL(blobUrl);
          }, 600000);
        }
      }, 500);
    };
  }
}