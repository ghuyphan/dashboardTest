import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';

import { EmergencySummaryComponent } from './emergency-summary.component';

describe('EmergencySummaryComponent', () => {
  let component: EmergencySummaryComponent;
  let fixture: ComponentFixture<EmergencySummaryComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [EmergencySummaryComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([])
      ]
    })
      .compileComponents();

    fixture = TestBed.createComponent(EmergencySummaryComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
