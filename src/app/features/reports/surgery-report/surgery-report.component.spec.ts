import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SurgeryReportComponent } from './surgery-report.component';

describe('SurgeryReportComponent', () => {
  let component: SurgeryReportComponent;
  let fixture: ComponentFixture<SurgeryReportComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SurgeryReportComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(SurgeryReportComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
