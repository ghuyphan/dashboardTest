import { Component, Input, ViewChild, ElementRef, AfterViewInit, inject, Inject } from '@angular/core';
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
        <div class="toolbar-hint">
          Kiểm tra nội dung trước khi in
        </div>
        <div class="actions">
          <button class="btn btn-ghost" (click)="onDownload()" title="Tải file về máy">
            <i class="fas fa-download"></i> Tải về
          </button>
          <button class="btn btn-primary" (click)="onPrint()" [disabled]="isLoading">
            <i class="fas fa-print"></i> In Ngay
          </button>
        </div>
      </div>

      <div class="viewer-body">
        <div *ngIf="isLoading" class="loading-overlay">
          <div class="spinner"></div>
          <p>Đang xử lý tài liệu...</p>
        </div>
        <div #documentContainer class="document-content"></div>
      </div>
    </div>
  `,
  styles: [`
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
    }

    .viewer-toolbar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 0.75rem 1rem;
      background: white;
      border-bottom: 1px solid #e5e7eb;
      flex-shrink: 0;
    }

    .toolbar-hint { font-size: 0.875rem; color: #6b7280; font-style: italic; }
    .actions { display: flex; gap: 0.75rem; align-items: center; }

    .btn {
      display: inline-flex; align-items: center; gap: 0.5rem;
      padding: 0.5rem 1rem; border-radius: 0.375rem;
      font-weight: 500; border: 1px solid transparent;
      cursor: pointer; transition: all 0.2s; font-size: 0.875rem;
    }
    .btn:disabled { opacity: 0.6; cursor: not-allowed; }
    .btn-primary { background-color: #00839B; color: white; }
    .btn-primary:hover:not(:disabled) { background-color: #006E96; }
    .btn-ghost { background-color: transparent; color: #374151; border-color: #d1d5db; }
    .btn-ghost:hover { background-color: #f9fafb; }

    .viewer-body {
      flex: 1; overflow: auto; padding: 2rem;
      display: flex; justify-content: center; position: relative;
    }

    .document-content {
      background: white;
      box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);
      min-height: 200px;
    }

    .loading-overlay {
      position: absolute; top: 0; left: 0; width: 100%; height: 100%;
      background: rgba(255,255,255,0.8);
      display: flex; flex-direction: column;
      align-items: center; justify-content: center; z-index: 20;
      gap: 10px; color: #4b5563;
    }

    .spinner {
      width: 40px; height: 40px;
      border: 3px solid #e5e7eb; border-top-color: #00839B;
      border-radius: 50%; animation: spin 1s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }

    /* *** CRITICAL FIX ***
       Print Styles specifically for this component.
       These only trigger when body has 'print-mode-docx' class OR generally inside the modal.
       Using :host-context ensures we override parent styles.
    */
    @media print {
      :host {
        display: block !important;
        position: fixed !important;
        top: 0 !important; left: 0 !important;
        width: 100% !important; height: 100% !important;
        z-index: 99999 !important;
        background: white !important;
      }

      .viewer-container, .viewer-body {
        display: block !important; height: auto !important;
        overflow: visible !important; padding: 0 !important; margin: 0 !important;
        background: white !important;
      }

      .document-content {
        box-shadow: none !important; margin: 0 !important;
        width: 100% !important;
      }

      /* Hide UI */
      .viewer-toolbar, .loading-overlay { display: none !important; }

      /* Force Docx Preview internals to be visible */
      ::ng-deep .docx-wrapper { background: white !important; padding: 0 !important; }
      ::ng-deep .docx-wrapper > section.docx { 
        margin: 0 !important; padding: 0 !important; box-shadow: none !important; 
      }

      /* Hide everything else in the body (global override) */
      ::ng-deep body > *:not(app-root) { display: none !important; }
    }
  `]
})
export class DocxPrintViewerComponent implements AfterViewInit {
  @Input() docBlob!: Blob;
  @Input() fileName: string = 'document.docx';
  
  @ViewChild('documentContainer') container!: ElementRef<HTMLDivElement>;
  
  public modalRef = inject(ModalRef);
  public isLoading = true;
  
  constructor(@Inject(DOCUMENT) private document: Document) {}

  ngAfterViewInit() {
    if (this.docBlob) {
      this.renderDoc();
    } else {
      this.isLoading = false;
    }
  }

  private renderDoc() {
    const options = {
      className: 'docx', 
      inWrapper: true, 
      ignoreWidth: false, 
      breakPages: true, 
      trimXmlDeclaration: true,
      experimental: true,
      renderChanges: false 
    };

    renderAsync(this.docBlob, this.container.nativeElement, undefined, options)
      .then(() => {})
      .catch(err => console.error('Error rendering docx:', err))
      .finally(() => { this.isLoading = false; });
  }

  onPrint() {
    // 1. Add class to body to ensure other components (like DeviceDetail) hide their print stuff
    this.document.body.classList.add('print-mode-docx');
    
    // 2. Print
    window.print();

    // 3. Cleanup
    setTimeout(() => {
      this.document.body.classList.remove('print-mode-docx');
    }, 500);
  }

  onDownload() {
    saveAs(this.docBlob, this.fileName);
  }

  close() {
    this.modalRef.close();
  }
}