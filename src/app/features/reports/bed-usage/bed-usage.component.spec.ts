import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';

import { BedUsageComponent } from './bed-usage.component';

describe('BedUsageComponent', () => {
  let component: BedUsageComponent;
  let fixture: ComponentFixture<BedUsageComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BedUsageComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([])
      ]
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
