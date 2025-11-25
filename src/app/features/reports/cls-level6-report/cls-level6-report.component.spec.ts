import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ClsLevel6ReportComponent } from './cls-level6-report.component';

describe('ClsLevel6ReportComponent', () => {
  let component: ClsLevel6ReportComponent;
  let fixture: ComponentFixture<ClsLevel6ReportComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ClsLevel6ReportComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ClsLevel6ReportComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
