import { ComponentFixture, TestBed } from '@angular/core/testing';

import { IcdReportComponent } from './icd-report.component';

describe('IcdReportComponent', () => {
  let component: IcdReportComponent;
  let fixture: ComponentFixture<IcdReportComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [IcdReportComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(IcdReportComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
