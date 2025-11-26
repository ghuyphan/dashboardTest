import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SpecialtyClsReportComponent } from './specialty-cls-report.component';

describe('SpecialtyClsReportComponent', () => {
  let component: SpecialtyClsReportComponent;
  let fixture: ComponentFixture<SpecialtyClsReportComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SpecialtyClsReportComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(SpecialtyClsReportComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
