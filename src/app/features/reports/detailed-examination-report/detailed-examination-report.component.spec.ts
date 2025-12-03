import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';

import { DetailedExaminationReportComponent } from './detailed-examination-report.component';

describe('DetailedExaminationReportComponent', () => {
  let component: DetailedExaminationReportComponent;
  let fixture: ComponentFixture<DetailedExaminationReportComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DetailedExaminationReportComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([])
      ]
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
