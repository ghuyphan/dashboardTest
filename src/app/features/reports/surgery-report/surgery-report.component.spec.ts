import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';

import { SurgeryReportComponent } from './surgery-report.component';

describe('SurgeryReportComponent', () => {
  let component: SurgeryReportComponent;
  let fixture: ComponentFixture<SurgeryReportComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SurgeryReportComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([])
      ]
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
