import { ComponentFixture, TestBed } from '@angular/core/testing';

import { BedUsageComponent } from './bed-usage.component';

describe('BedUsageComponent', () => {
  let component: BedUsageComponent;
  let fixture: ComponentFixture<BedUsageComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BedUsageComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(BedUsageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
