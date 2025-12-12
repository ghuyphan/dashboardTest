import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';

import { ClsLevel3ReportComponent } from './cls-level3-report.component';

describe('ClsLevel3ReportComponent', () => {
  let component: ClsLevel3ReportComponent;
  let fixture: ComponentFixture<ClsLevel3ReportComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ClsLevel3ReportComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ClsLevel3ReportComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
