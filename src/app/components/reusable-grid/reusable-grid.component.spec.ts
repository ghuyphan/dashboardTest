import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ReusableGridComponent } from './reusable-grid.component';

describe('ReusableGridComponent', () => {
  let component: ReusableGridComponent;
  let fixture: ComponentFixture<ReusableGridComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ReusableGridComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ReusableGridComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
