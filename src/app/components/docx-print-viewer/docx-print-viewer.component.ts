import { Component, Input, ViewChild, ElementRef, AfterViewInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { renderAsync } from 'docx-preview';
import { ModalRef } from '../../models/modal-ref.model'; // Verify this path matches your project

@Component({
  selector: 'app-docx-print-viewer',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="viewer-container">
      <div class="viewer-header">
        <div class="title-group">
          <h3>Xem trước bản in</h3>
          <p class="subtitle">Kiểm tra nội dung trước khi in</p>
        </div>
        <div class="actions">
          <button class="btn btn-secondary" (click)="close()">
            <i class="fas fa-times"></i> Đóng
          </button>
          <button class="btn btn-primary" (click)="onPrint()">
            <i class="fas fa-print"></i> In Ngay
          </button>
        </div>
      </div>

      <div class="viewer-body">
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
    }

    .viewer-container {
      display: flex;
      flex-direction: column;
      height: 100%;
      max-height: 90vh;
    }

    .viewer-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 1rem 1.5rem;
      background: white;
      border-bottom: 1px solid #e5e7eb;
      box-shadow: 0 1px 3px rgba(0,0,0,0.05);
      z-index: 10;
    }

    .title-group h3 { margin: 0; font-size: 1.125rem; color: #111827; }
    .subtitle { margin: 0; font-size: 0.875rem; color: #6b7280; }

    .actions { display: flex; gap: 0.75rem; }

    /* Reusing your button styles roughly */
    .btn {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.5rem 1rem;
      border-radius: 0.375rem;
      font-weight: 500;
      border: none;
      cursor: pointer;
      transition: all 0.2s;
    }
    .btn-primary { background-color: #00839B; color: white; }
    .btn-primary:hover { background-color: #006E96; }
    .btn-secondary { background-color: #e5e7eb; color: #374151; }
    .btn-secondary:hover { background-color: #d1d5db; }

    .viewer-body {
      flex: 1;
      overflow: auto;
      padding: 2rem;
      display: flex;
      justify-content: center;
    }

    .document-content {
      background: white;
      box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.1);
      margin-bottom: 2rem;
      /* docx-preview renders inside here */
    }

    /* --- CRITICAL PRINT STYLES --- */
    @media print {
      /* 1. Hide everything in the app (Sidebar, Header, etc) */
      body > * { display: none !important; }

      /* 2. Make the Modal/Viewer visible */
      body, html { height: auto; overflow: visible; background: white; }
      
      /* 3. Position the viewer to take up the whole page */
      app-docx-print-viewer, .viewer-container, .viewer-body, .document-content {
        display: block !important;
        position: absolute !important;
        top: 0 !important;
        left: 0 !important;
        width: 100% !important;
        height: auto !important;
        margin: 0 !important;
        padding: 0 !important;
        box-shadow: none !important;
        overflow: visible !important;
        background: white !important;
      }

      /* 4. Hide the viewer buttons */
      .viewer-header { display: none !important; }
      
      /* 5. Override docx-preview internals for clean printing */
      ::ng-deep .docx-wrapper { background: white !important; padding: 0 !important; }
      ::ng-deep .docx-wrapper > section.docx { 
        box-shadow: none !important; 
        margin: 0 !important; 
        padding: 0 !important;
      }
    }
  `]
})
export class DocxPrintViewerComponent implements AfterViewInit {
  @Input() docBlob!: Blob; // The DOCX file as a Blob
  @ViewChild('documentContainer') container!: ElementRef<HTMLDivElement>;
  
  // Inject ModalRef manually if it's not provided by the @Input
  public modalRef = inject(ModalRef); 

  ngAfterViewInit() {
    if (this.docBlob) {
      this.renderDoc();
    }
  }

  private renderDoc() {
    const options = {
      className: 'docx', 
      inWrapper: true, 
      ignoreWidth: false, 
      breakPages: true, 
      trimXmlDeclaration: true,
      experimental: true // Helps with complex layouts
    };

    renderAsync(this.docBlob, this.container.nativeElement, undefined, options)
      .then(() => console.log('Document rendered for printing'))
      .catch(err => console.error('Error rendering docx:', err));
  }

  onPrint() {
    window.print();
  }

  close() {
    this.modalRef.close();
  }
}