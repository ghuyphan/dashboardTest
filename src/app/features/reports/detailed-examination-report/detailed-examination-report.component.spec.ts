import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DetailedExaminationReportComponent } from './detailed-examination-report.component';

describe('DetailedExaminationReportComponent', () => {
  let component: DetailedExaminationReportComponent;
  let fixture: ComponentFixture<DetailedExaminationReportComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DetailedExaminationReportComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(DetailedExaminationReportComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
