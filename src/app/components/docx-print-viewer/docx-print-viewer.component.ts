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
          <button class="btn btn-ghost back-btn" (click)="close()">
            <i class="fas fa-arrow-left"></i>
            <span>Quay lại</span>
          </button>
        </div>
        
        <div class="toolbar-center">
           <div class="toolbar-hint">
            <i class="fas fa-info-circle"></i>
            Kiểm tra trước khi in (Khổ A4)
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
        <div *ngIf="isLoading" class="app-loading-overlay">
          <div class="app-loading-container">
             <div class="app-loading-spinner"></div>
             <p>Đang tải tài liệu...</p>
          </div>
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
    /* Layout adjustments for the toolbar */
    .viewer-toolbar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 0.75rem 1.5rem;
      background: white;
      border-bottom: 1px solid #e5e7eb;
      flex-shrink: 0;
      z-index: 10;
    }

    .toolbar-left, .toolbar-right {
      display: flex;
      gap: 0.75rem;
      align-items: center;
    }

    .back-btn {
      color: #64748B;
      padding: 0.5rem 0.75rem;
    }
    .back-btn:hover {
      background-color: #F1F5F9;
      color: #0F172A;
    }

    .toolbar-hint { 
      color: #6b7280; 
      font-size: 0.875rem; 
      font-style: italic; 
      display: flex; 
      gap: 0.5rem; 
      align-items: center; 
    }
    .toolbar-hint i { color: #00839B; }
    
    @media (max-width: 640px) {
      .toolbar-hint { display: none; }
    }
    
    :host {
      display: flex;
      flex-direction: column;
      height: 100%;
      background-color: #525659;
      overflow: hidden;
    }
    .viewer-container { display: flex; flex-direction: column; height: 100%; width: 100%; }
    .viewer-body { flex: 1; overflow: auto; padding: 2rem; position: relative; display: flex; justify-content: center; }
    .content-wrapper { background: transparent; }
    .content-wrapper.hidden { display: none; }
    
    .btn { display: inline-flex; align-items: center; gap: 0.5rem; padding: 0.625rem 1.25rem; border-radius: 0.375rem; font-weight: 500; font-size: 0.875rem; border: 1px solid transparent; cursor: pointer; transition: all 0.2s; }
    .btn:disabled { opacity: 0.5; cursor: not-allowed; }
    .btn-primary { background-color: #00839B; color: white; }
    .btn-primary:hover:not(:disabled) { background-color: #006E96; }
    .btn-ghost { background-color: white; color: #374151; border-color: #d1d5db; }
    .btn-ghost:hover:not(:disabled) { background-color: #f9fafb; }

    /* DOCX Preview Overrides */
    ::ng-deep .docx-wrapper { background: transparent !important; padding: 0 !important; }
    ::ng-deep section.docx { width: 210mm !important; min-height: 297mm !important; background: white !important; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15) !important; margin: 0 auto 1.5rem auto !important; color: black !important; font-family: "Times New Roman", Times, serif !important; }
    ::ng-deep section.docx table td, ::ng-deep section.docx table th { border: 1px solid black !important; }

    .error-message { display: flex; flex-direction: column; align-items: center; padding: 2rem; color: #ef4444; gap: 1rem; }
    .error-message i { font-size: 2.5rem; }

    /* Print Styles */
    @media print {
      @page { size: A4 portrait; margin: 0; }
      
      :host, .viewer-container, .viewer-body, .content-wrapper { 
        display: block !important; 
        position: static !important; 
        width: 100% !important; 
        height: auto !important; 
        overflow: visible !important; 
        background: white !important; 
        margin: 0 !important; 
        padding: 0 !important; 
      }

      .viewer-toolbar, .app-loading-overlay, .error-message { 
        display: none !important; 
      }

      ::ng-deep section.docx { 
        margin: 0 !important; 
        box-shadow: none !important; 
        page-break-after: always !important; 
        /* FIXED: Force A4 width instead of 100% to prevent text reflow */
        width: 210mm !important; 
      }

      ::ng-deep app-root > *:not(app-modal), 
      ::ng-deep .modal-backdrop, 
      ::ng-deep .cdk-overlay-container > *:not(.cdk-global-overlay-wrapper) { 
        display: none !important; 
      }

      ::ng-deep .cdk-global-overlay-wrapper, 
      ::ng-deep .cdk-overlay-pane, 
      ::ng-deep .modal-content { 
        position: static !important; 
        transform: none !important; 
        width: 100% !important; 
        max-width: none !important; 
        height: auto !important; 
        border: none !important; 
        padding: 0 !important; 
        margin: 0 !important; 
        display: block !important; 
        overflow: visible !important; 
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
    }
  }

  ngOnDestroy(): void {
    this.document.body.classList.remove('print-mode-docx');
  }

  private renderDocument(): void {
    const options = {
      className: 'docx',
      inWrapper: true,
      ignoreWidth: false, // Respect Word's width settings
      ignoreHeight: false,
      breakPages: true,
      trimXmlDeclaration: true,
      useBase64URL: true,
      debug: false,
      experimental: false, // UPDATED: Improves layout accuracy
      renderChanges: false // UPDATED: Hide track changes comments if any
    };

    renderAsync(this.docBlob, this.container.nativeElement, undefined, options)
      .then(() => { this.hasError = false; })
      .catch(error => { console.error('Error rendering:', error); this.hasError = true; })
      .finally(() => { this.isLoading = false; });
  }

  onPrint(): void {
    if (this.isLoading || this.hasError) return;
    this.document.body.classList.add('print-mode-docx');
    setTimeout(() => {
      window.print();
      setTimeout(() => { this.document.body.classList.remove('print-mode-docx'); }, 1000);
    }, 100);
  }

  onDownload(): void {
    if (this.isLoading || this.hasError) return;
    saveAs(this.docBlob, this.fileName);
  }

  close(): void {
    this.modalRef.close();
  }
}