import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { generate } from '@pdfme/generator';
import { Template, BLANK_PDF } from '@pdfme/common';
import { firstValueFrom, Observable } from 'rxjs';
import { saveAs } from 'file-saver';
import { PDFDocument } from 'pdf-lib';
import { environment } from '../../../environments/environment';

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

  private getHost(url: string): string {
    try {
      return new URL(url).host;
    } catch {
      return '';
    }
  }

  /**
   * Helper to detect external URLs and proxy them via the backend FileProxy server to bypass CORS.
   */
  private getProxyUrl(url: string): string {
    if (url && (url.startsWith('http://') || url.startsWith('https://'))) {
      const targetHost = this.getHost(url);
      const apiHost = this.getHost(environment.apiUrl);
      const currentHost =
        typeof window !== 'undefined' ? window.location.host : '';

      // If the URL is for the internal Files server (contains '/Files/'), or matches
      // the API/current host, fetch it directly (CORS-supported or same-origin).
      const isInternal =
        (apiHost && targetHost === apiHost) ||
        (currentHost && targetHost === currentHost) ||
        url.includes('/Files/');

      if (!isInternal) {
        return `${environment.fileProxyUrl}?url=${encodeURIComponent(url)}`;
      }
    }
    return url;
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
    const finalUrl = this.getProxyUrl(url);
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
        request$ = this.http.post(finalUrl, options.body, {
          headers: requestHeaders,
          params: requestParams,
          responseType: 'blob',
        });
      } else {
        request$ = this.http.get(finalUrl, {
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

      let cleanedUp = false;
      const cleanup = () => {
        if (cleanedUp) return;
        cleanedUp = true;

        // Cleanup after a short delay (allows time for print dialog interaction cleanup)
        setTimeout(() => {
          if (document.body.contains(iframe)) {
            document.body.removeChild(iframe);
          }
          URL.revokeObjectURL(blobUrl);
        }, 2000);
      };

      // Fallback if onload never fires (e.g. browser blocks iframe loading)
      const loadTimeout = setTimeout(() => {
        cleanup();
        resolve();
      }, 5000);

      iframe.onload = () => {
        clearTimeout(loadTimeout);

        // Small delay to ensure rendering is finished
        setTimeout(() => {
          try {
            const iframeWin = iframe.contentWindow;
            if (iframeWin) {
              iframeWin.focus();

              // Listen to afterprint event to clean up resources when user closes the print dialog
              iframeWin.addEventListener('afterprint', () => {
                cleanup();
              });

              iframeWin.print();

              // Resolve the promise immediately since the print dialog has been triggered
              resolve();

              // Fallback cleanup after 30 seconds if afterprint doesn't fire (e.g. Chrome/Edge PDF iframe)
              setTimeout(() => {
                cleanup();
              }, 30000);
            } else {
              cleanup();
              resolve();
            }
          } catch (e) {
            console.error('Print failed:', e);
            cleanup();
            resolve();
          }
        }, 500);
      };
    });
  }

  /**
   * Fetches a PDF from a URL and triggers a local file download using saveAs.
   *
   * @param url The API endpoint or URL to fetch the PDF from
   * @param filename Name of the file to save
   */
  async downloadPdf(url: string, filename: string): Promise<void> {
    try {
      const finalUrl = this.getProxyUrl(url);
      const blob = await firstValueFrom(
        this.http.get(finalUrl, { responseType: 'blob' })
      );
      saveAs(blob, filename);
    } catch (err) {
      console.error(`Failed to fetch and download PDF from ${url}:`, err);
      throw err;
    }
  }

  /**
   * Triggers the browser's native file download manager using a dynamic anchor element.
   * This respects the browser's "Ask where to save each file before downloading" setting.
   *
   * @param url The file URL
   * @param filename Name of the file to save
   */
  downloadPdfNatively(url: string, filename: string): void {
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
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
        const finalUrl = this.getProxyUrl(url);
        // Fetch the PDF as a Blob
        const blob = await firstValueFrom(
          this.http.get(finalUrl, { responseType: 'blob' })
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
      const mergedBlob = new Blob([mergedPdfBytes as Uint8Array<ArrayBuffer>], {
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
