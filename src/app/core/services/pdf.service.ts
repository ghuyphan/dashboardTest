import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { generate } from '@pdfme/generator';
import { Template, BLANK_PDF } from '@pdfme/common';
import { firstValueFrom, Observable } from 'rxjs';
import { saveAs } from 'file-saver';

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

      this.printBlob(blob);
    } catch (err) {
      console.error('Failed to fetch and print PDF from API:', err);
      throw err;
    }
  }

  /**
   * Creates an invisible iframe to trigger the browser print dialog for a Blob
   */
  public printBlob(blob: Blob): void {
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
      visibility: 'hidden',
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
          }, 60000);
        }
      }, 500);
    };
  }
}
