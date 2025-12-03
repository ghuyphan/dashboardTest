import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';

import { WidgetCardComponent } from './widget-card.component';

describe('WidgetCardComponent', () => {
  let component: WidgetCardComponent;
  let fixture: ComponentFixture<WidgetCardComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [WidgetCardComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([])
      ]
    })
      .compileComponents();

    fixture = TestBed.createComponent(WidgetCardComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('title', 'Test Title');
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
