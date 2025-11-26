import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ClsLevel3ReportComponent } from './cls-level3-report.component';

describe('ClsLevel3ReportComponent', () => {
  let component: ClsLevel3ReportComponent;
  let fixture: ComponentFixture<ClsLevel3ReportComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ClsLevel3ReportComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ClsLevel3ReportComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
