import { ComponentFixture, TestBed } from '@angular/core/testing';

import { EmergencyAdmissionComparisonComponent } from './emergency-admission-comparison.component';

describe('EmergencyAdmissionComparisonComponent', () => {
  let component: EmergencyAdmissionComparisonComponent;
  let fixture: ComponentFixture<EmergencyAdmissionComparisonComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [EmergencyAdmissionComparisonComponent]
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
