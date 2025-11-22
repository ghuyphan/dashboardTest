import { ComponentFixture, TestBed } from '@angular/core/testing';

import { MedicalRecordsStatusComponent } from './medical-records-status.component';

describe('MedicalRecordsStatusComponent', () => {
  let component: MedicalRecordsStatusComponent;
  let fixture: ComponentFixture<MedicalRecordsStatusComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MedicalRecordsStatusComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(MedicalRecordsStatusComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
