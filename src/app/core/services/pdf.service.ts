import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { generate } from '@pdfme/generator';
import { Template, BLANK_PDF } from '@pdfme/common';
import { firstValueFrom, Observable } from 'rxjs';
import { saveAs } from 'file-saver';
import { PDFDocument } from 'pdf-lib';

@Injectable({
  providedIn: 'root',
})
export class PdfService {
  constructor(private http: HttpClient) {}

  /**
   * Generates a PDF using the provided schema.
   * If basePdf is not provided in the schema, BLANK_PDF (A4) is used as default.
   * @param schemaPath Path to the JSON schema file (e.g. 'assets/schemas/device-report.json')
   * @param inputs Data object to fill the schema
   * @param outputFilename Name of the file to save
   */
  async generateReport(
    schemaPath: string,
    inputs: Record<string, any>,
    outputFilename: string
  ): Promise<void> {
    try {
      // 1. Fetch schema
      const schemaJson = await firstValueFrom(this.http.get<any>(schemaPath));

      if (!schemaJson || !schemaJson.schemas) {
        throw new Error('Schema is invalid or missing "schemas" property.');
      }

      // Use BLANK_PDF as fallback if basePdf is not provided
      const template: Template = {
        basePdf: schemaJson.basePdf || BLANK_PDF,
        schemas: schemaJson.schemas,
      };

      // 2. Generate PDF
      const pdfBytes = await generate({
        template,
        inputs: [inputs],
      });

      // 3. Save
      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
      saveAs(blob, outputFilename);
    } catch (err) {
      console.error('PDF Generation Error:', err);
      throw err;
    }
  }

  /**
   * Fetches a PDF from the given API endpoint and opens the browser print dialog.
   * Supports GET and POST requests, request headers, query parameters, and request body.
   *
   * @param url The API endpoint URL to fetch the PDF from
   * @param options Configuration for the HTTP request
   */
  async printPdfFromApi(
    url: string,
    options: {
      method?: 'GET' | 'POST';
      body?: any;
      headers?: Record<string, string>;
      params?: Record<string, string>;
    } = {}
  ): Promise<void> {
    const method = options.method || 'GET';
    const requestHeaders = new HttpHeaders(options.headers || {});
    let requestParams = new HttpParams();

    if (options.params) {
      Object.keys(options.params).forEach(key => {
        requestParams = requestParams.set(key, options.params![key]);
      });
    }

    try {
      let request$: Observable<Blob>;
      if (method === 'POST') {
        request$ = this.http.post(url, options.body, {
          headers: requestHeaders,
          params: requestParams,
          responseType: 'blob',
        });
      } else {
        request$ = this.http.get(url, {
          headers: requestHeaders,
          params: requestParams,
          responseType: 'blob',
        });
      }

      const blob = await firstValueFrom(request$);

      if (blob.type && blob.type !== 'application/pdf') {
        console.warn(
          `Expected 'application/pdf' response type, but received '${blob.type}'.`
        );
      }

      await this.printBlob(blob);
    } catch (err) {
      console.error('Failed to fetch and print PDF from API:', err);
      throw err;
    }
  }

  /**
   * Creates an invisible iframe to trigger the browser print dialog for a Blob.
   * Returns a Promise that resolves when the print dialog is closed.
   */
  public printBlob(blob: Blob): Promise<void> {
    return new Promise<void>(resolve => {
      const blobUrl = URL.createObjectURL(blob);
      const iframe = document.createElement('iframe');

      // Hide the iframe and set full size so the browser can calculate scaling correctly
      Object.assign(iframe.style, {
        position: 'fixed',
        top: '0',
        left: '0',
        width: '100%',
        height: '100%',
        border: 'none',
        visibility: 'hidden',
        zIndex: '-9999',
        pointerEvents: 'none',
      });

      iframe.src = `${blobUrl}#view=Fit`;
      document.body.appendChild(iframe);

      let resolved = false;
      const done = () => {
        if (resolved) return;
        resolved = true;

        // Cleanup after a short delay (allows time for print dialog interaction cleanup)
        setTimeout(() => {
          if (document.body.contains(iframe)) {
            document.body.removeChild(iframe);
          }
          URL.revokeObjectURL(blobUrl);
        }, 2000);

        resolve();
      };

      iframe.onload = () => {
        // Small delay to ensure rendering is finished
        setTimeout(() => {
          try {
            const iframeWin = iframe.contentWindow;
            if (iframeWin) {
              iframeWin.focus();

              // Listen to afterprint event to resolve when user closes the print dialog
              iframeWin.addEventListener('afterprint', () => {
                done();
              });

              iframeWin.print();

              // Fallback: Resolve after 10 seconds if afterprint doesn't fire (e.g. print blocked)
              setTimeout(() => {
                done();
              }, 10000);
            } else {
              done();
            }
          } catch (e) {
            console.error('Print failed:', e);
            done();
          }
        }, 500);
      };
    });
  }

  /**
   * Fetches multiple PDFs from their endpoints, merges them into a single PDF, and prints it.
   * If there is only one URL, prints it directly.
   *
   * @param urls Array of PDF URLs to fetch, merge, and print
   */
  async printMultiplePdfs(urls: string[]): Promise<void> {
    if (!urls || urls.length === 0) return;

    if (urls.length === 1) {
      return this.printPdfFromApi(urls[0]);
    }

    try {
      const mergedPdf = await PDFDocument.create();

      for (const url of urls) {
        // Fetch the PDF as a Blob
        const blob = await firstValueFrom(
          this.http.get(url, { responseType: 'blob' })
        );

        // Convert Blob to ArrayBuffer
        const arrayBuffer = await blob.arrayBuffer();

        // Load into pdf-lib
        const pdfDoc = await PDFDocument.load(arrayBuffer);

        // Copy pages
        const copiedPages = await mergedPdf.copyPages(
          pdfDoc,
          pdfDoc.getPageIndices()
        );

        // Add each page
        copiedPages.forEach(page => mergedPdf.addPage(page));
      }

      // Save the merged PDF as bytes
      const mergedPdfBytes = await mergedPdf.save();
      const mergedBlob = new Blob([mergedPdfBytes], {
        type: 'application/pdf',
      });

      // Print the combined PDF
      await this.printBlob(mergedBlob);
    } catch (err) {
      console.error('Failed to merge and print PDFs:', err);
      throw err;
    }
  }
}
