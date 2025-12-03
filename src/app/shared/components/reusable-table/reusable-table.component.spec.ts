import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ReusableTableComponent } from './reusable-table.component';

describe('ReusableTableComponent', () => {
  interface TestItem { id: number; name: string; }
  let component: ReusableTableComponent<TestItem>;
  let fixture: ComponentFixture<ReusableTableComponent<TestItem>>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ReusableTableComponent]
    })
      .compileComponents();

    fixture = TestBed.createComponent<ReusableTableComponent<TestItem>>(ReusableTableComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
