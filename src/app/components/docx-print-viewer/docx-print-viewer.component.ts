import { Component, Input, ViewChild, ElementRef, AfterViewInit, OnDestroy, inject, Inject } from '@angular/core';
import { CommonModule, DOCUMENT } from '@angular/common';
import { renderAsync } from 'docx-preview';
import { ModalRef } from '../../models/modal-ref.model';
import { saveAs } from 'file-saver';

@Component({
  selector: 'app-docx-print-viewer',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="viewer-container">
      <div class="viewer-toolbar">
        <div class="toolbar-left">
          <div class="toolbar-hint">
            <i class="fas fa-info-circle"></i>
            Kiểm tra nội dung trước khi in
          </div>
        </div>
        <div class="toolbar-right">
          <button class="btn btn-ghost" (click)="onDownload()" [disabled]="isLoading" title="Tải file về máy">
            <i class="fas fa-download"></i>
            <span>Tải về</span>
          </button>
          <button class="btn btn-primary" (click)="onPrint()" [disabled]="isLoading" title="In tài liệu">
            <i class="fas fa-print"></i>
            <span>In Ngay</span>
          </button>
        </div>
      </div>

      <div class="viewer-body">
        <div *ngIf="isLoading" class="loading-overlay">
          <div class="spinner"></div>
          <p>Đang tải tài liệu...</p>
        </div>
        
        <div *ngIf="!isLoading && hasError" class="error-message">
          <i class="fas fa-exclamation-triangle"></i>
          <p>Không thể tải tài liệu. Vui lòng thử lại.</p>
        </div>

        <div class="content-wrapper" [class.hidden]="isLoading || hasError">
          <div #documentContainer class="document-content"></div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    /* ===== HOST & CONTAINER ===== */
    :host {
      display: flex;
      flex-direction: column;
      height: 100%;
      background-color: #f3f4f6;
      overflow: hidden;
    }

    .viewer-container {
      display: flex;
      flex-direction: column;
      height: 100%;
      width: 100%;
    }

    /* ===== TOOLBAR ===== */
    .viewer-toolbar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 1rem 1.5rem;
      background: white;
      border-bottom: 1px solid #e5e7eb;
      flex-shrink: 0;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
    }

    .toolbar-left {
      flex: 1;
    }

    .toolbar-hint {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      font-size: 0.875rem;
      color: #6b7280;
      font-style: italic;
    }

    .toolbar-hint i {
      color: #00839B;
    }

    .toolbar-right {
      display: flex;
      gap: 0.75rem;
      align-items: center;
    }

    /* ===== BUTTONS ===== */
    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 0.5rem;
      padding: 0.625rem 1.25rem;
      border-radius: 0.375rem;
      font-weight: 500;
      font-size: 0.875rem;
      border: 1px solid transparent;
      cursor: pointer;
      transition: all 0.2s ease-in-out;
      white-space: nowrap;
    }

    .btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
      pointer-events: none;
    }

    .btn i {
      font-size: 1rem;
    }

    .btn-primary {
      background-color: #00839B;
      color: white;
      border-color: #00839B;
    }

    .btn-primary:hover:not(:disabled) {
      background-color: #006E96;
      border-color: #006E96;
      transform: translateY(-1px);
      box-shadow: 0 4px 6px -1px rgba(0, 131, 155, 0.3);
    }

    .btn-ghost {
      background-color: white;
      color: #374151;
      border-color: #d1d5db;
    }

    .btn-ghost:hover:not(:disabled) {
      background-color: #f9fafb;
      border-color: #9ca3af;
    }

    /* ===== VIEWER BODY ===== */
    .viewer-body {
      flex: 1;
      overflow: auto;
      padding: 2rem;
      position: relative;
      background-color: #f3f4f6;
    }

    .content-wrapper {
      min-width: min-content;
      display: flex;
      justify-content: center;
      padding: 1rem 0;
    }

    .content-wrapper.hidden {
      display: none;
    }

    /* ===== DOCUMENT PREVIEW STYLES ===== */
    .document-content {
      background: white;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
      margin: 0 auto;
      /* A4 size at 96 DPI */
      width: 21cm;
      min-height: 29.7cm;
    }

    /* Force docx-preview wrapper styles */
    ::ng-deep .docx-wrapper {
      background: white !important;
      padding: 0 !important;
      margin: 0 !important;
      width: 21cm !important;
    }

    /* Style each page section */
    ::ng-deep section.docx {
      /* Font matching Word default */
      font-family: "Times New Roman", Times, serif !important;
      font-size: 11pt !important;
      
      /* A4 dimensions */
      width: 21cm !important;
      min-height: 29.7cm !important;
      box-sizing: border-box !important;
      
      /* Standard Word margins (1 inch = 2.54cm) */
      padding: 2.54cm !important;
      
      /* Visual separation between pages */
      background: white !important;
      margin: 0 auto 1.5rem auto !important;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1) !important;
      
      /* Preserve page breaks */
      page-break-after: always !important;
      page-break-inside: avoid !important;
    }

    ::ng-deep section.docx:last-child {
      margin-bottom: 0 !important;
    }

    /* Preserve font inheritance */
    ::ng-deep section.docx * {
      font-family: inherit !important;
    }

    /* Paragraph styling to match Word */
    ::ng-deep section.docx p {
      margin: 0 0 8pt 0 !important;
      line-height: 1.15 !important;
    }

    /* Table styling */
    ::ng-deep section.docx table {
      border-collapse: collapse !important;
      width: 100% !important;
    }

    ::ng-deep section.docx table td,
    ::ng-deep section.docx table th {
      padding: 0.1cm 0.19cm !important;
      border: 1px solid #000 !important;
    }

    /* List styling */
    ::ng-deep section.docx ul,
    ::ng-deep section.docx ol {
      margin: 0 0 8pt 0 !important;
      padding-left: 1.27cm !important;
    }

    ::ng-deep section.docx li {
      margin-bottom: 0 !important;
    }

    /* ===== LOADING & ERROR STATES ===== */
    .loading-overlay {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(255, 255, 255, 0.9);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      z-index: 20;
      gap: 1rem;
    }

    .spinner {
      width: 48px;
      height: 48px;
      border: 4px solid #e5e7eb;
      border-top-color: #00839B;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    .loading-overlay p {
      color: #4b5563;
      font-size: 0.875rem;
      font-weight: 500;
    }

    .error-message {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 3rem;
      color: #ef4444;
      gap: 1rem;
    }

    .error-message i {
      font-size: 3rem;
      opacity: 0.8;
    }

    .error-message p {
      font-size: 1rem;
      font-weight: 500;
    }

    /* ===== PRINT STYLES ===== */
    @media print {
      /* Remove browser default margins */
      @page {
        margin: 0;
        size: A4 portrait;
      }

      /* Make host fill entire print area */
      :host {
        display: block !important;
        position: fixed !important;
        top: 0 !important;
        left: 0 !important;
        width: 100vw !important;
        height: 100vh !important;
        z-index: 99999 !important;
        background: white !important;
        margin: 0 !important;
        padding: 0 !important;
        overflow: visible !important;
      }

      /* Reset all containers for print */
      .viewer-container,
      .viewer-body,
      .content-wrapper {
        display: block !important;
        height: auto !important;
        overflow: visible !important;
        padding: 0 !important;
        margin: 0 !important;
        background: white !important;
        box-shadow: none !important;
      }

      /* Hide UI elements */
      .viewer-toolbar,
      .loading-overlay,
      .error-message {
        display: none !important;
      }

      /* Document container for print */
      .document-content {
        box-shadow: none !important;
        margin: 0 !important;
        width: 100% !important;
      }

      /* docx-preview wrapper */
      ::ng-deep .docx-wrapper {
        background: white !important;
        padding: 0 !important;
        margin: 0 !important;
        width: 100% !important;
      }

      /* Each page section for print */
      ::ng-deep section.docx {
        margin: 0 !important;
        box-shadow: none !important;
        width: 100% !important;
        min-height: auto !important;
        
        /* Restore Word margins for print */
        padding: 2.54cm !important;
        
        /* Page break control */
        page-break-after: always !important;
        page-break-inside: avoid !important;
      }

      ::ng-deep section.docx:last-child {
        page-break-after: auto !important;
      }

      /* Break out of modal containers */
      ::ng-deep .modal-content,
      ::ng-deep .modal-backdrop,
      ::ng-deep .cdk-global-overlay-wrapper,
      ::ng-deep .cdk-overlay-pane,
      ::ng-deep .cdk-overlay-container {
        position: static !important;
        transform: none !important;
        width: 100% !important;
        height: auto !important;
        max-width: none !important;
        max-height: none !important;
        border: none !important;
        box-shadow: none !important;
        margin: 0 !important;
        padding: 0 !important;
        overflow: visible !important;
        background: white !important;
      }

      /* Ensure tables print correctly */
      ::ng-deep section.docx table {
        page-break-inside: auto !important;
      }

      ::ng-deep section.docx tr {
        page-break-inside: avoid !important;
        page-break-after: auto !important;
      }
    }
  `]
})
export class DocxPrintViewerComponent implements AfterViewInit, OnDestroy {
  @Input() docBlob!: Blob;
  @Input() fileName: string = 'document.docx';

  @ViewChild('documentContainer', { static: false }) container!: ElementRef<HTMLDivElement>;

  public modalRef = inject(ModalRef);
  public isLoading = true;
  public hasError = false;

  constructor(@Inject(DOCUMENT) private document: Document) {}

  ngAfterViewInit(): void {
    if (this.docBlob) {
      this.renderDocument();
    } else {
      this.isLoading = false;
      this.hasError = true;
      console.error('No document blob provided');
    }
  }

  ngOnDestroy(): void {
    // Clean up print mode class if component is destroyed during print
    this.document.body.classList.remove('print-mode-docx');
  }

  private renderDocument(): void {
    const options = {
      className: 'docx',
      inWrapper: true,
      ignoreWidth: false,
      ignoreHeight: false,
      breakPages: true,
      trimXmlDeclaration: true,
      experimental: false, // Better accuracy with false
      renderChanges: false,
      renderHeaders: true,
      renderFooters: true,
      renderFootnotes: true,
      renderEndnotes: true,
      useBase64URL: false,
      debug: false
    };

    renderAsync(this.docBlob, this.container.nativeElement, undefined, options)
      .then(() => {
        console.log('Document rendered successfully');
        this.hasError = false;
      })
      .catch(error => {
        console.error('Error rendering document:', error);
        this.hasError = true;
      })
      .finally(() => {
        this.isLoading = false;
      });
  }

  onPrint(): void {
    if (this.isLoading || this.hasError) {
      return;
    }

    // Add print mode class to body
    this.document.body.classList.add('print-mode-docx');

    // Trigger print dialog
    window.print();

    // Remove print mode class after print dialog closes
    setTimeout(() => {
      this.document.body.classList.remove('print-mode-docx');
    }, 500);
  }

  onDownload(): void {
    if (this.isLoading || this.hasError) {
      return;
    }

    try {
      saveAs(this.docBlob, this.fileName);
    } catch (error) {
      console.error('Error downloading file:', error);
    }
  }

  close(): void {
    this.modalRef.close();
  }
}