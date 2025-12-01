import { ComponentFixture, TestBed } from '@angular/core/testing';

import { EmergencySummaryComponent } from './emergency-summary.component';

describe('EmergencySummaryComponent', () => {
  let component: EmergencySummaryComponent;
  let fixture: ComponentFixture<EmergencySummaryComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [EmergencySummaryComponent]
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
