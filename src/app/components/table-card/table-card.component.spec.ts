import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute } from '@angular/router';
import { TableCardComponent } from './table-card.component';

describe('TableCardComponent', () => {
  interface TestItem { id: number; name: string; }
  let component: TableCardComponent<TestItem>;
  let fixture: ComponentFixture<TableCardComponent<TestItem>>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TableCardComponent],
      providers: [
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: { get: () => '1' } } } }
      ]
    })
      .compileComponents();

    fixture = TestBed.createComponent<TableCardComponent<TestItem>>(TableCardComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('title', 'Test Title');
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
