import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DocxPrintViewerComponent } from './docx-print-viewer.component';

describe('DocxPrintViewerComponent', () => {
  let component: DocxPrintViewerComponent;
  let fixture: ComponentFixture<DocxPrintViewerComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DocxPrintViewerComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(DocxPrintViewerComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
