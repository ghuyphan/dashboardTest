import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';

import { EmergencyAdmissionComparisonComponent } from './emergency-admission-comparison.component';

describe('EmergencyAdmissionComparisonComponent', () => {
  let component: EmergencyAdmissionComparisonComponent;
  let fixture: ComponentFixture<EmergencyAdmissionComparisonComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [EmergencyAdmissionComparisonComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([])
      ]
    })
      .compileComponents();

    fixture = TestBed.createComponent(EmergencyAdmissionComparisonComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
