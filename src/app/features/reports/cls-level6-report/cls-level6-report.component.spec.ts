import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';

import { ClsLevel6ReportComponent } from './cls-level6-report.component';

describe('ClsLevel6ReportComponent', () => {
  let component: ClsLevel6ReportComponent;
  let fixture: ComponentFixture<ClsLevel6ReportComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ClsLevel6ReportComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ClsLevel6ReportComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
