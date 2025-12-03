import { Component } from '@angular/core';
import { TestBed, ComponentFixture } from '@angular/core/testing';
import { TooltipDirective } from './tooltip.directive';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';

@Component({
  template: `<div [appTooltip]="'Test Tooltip'"></div>`,
  standalone: true,
  imports: [TooltipDirective]
})
class TestHostComponent { }

describe('TooltipDirective', () => {
  let fixture: ComponentFixture<TestHostComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TestHostComponent, TooltipDirective],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([])
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(TestHostComponent);
    fixture.detectChanges();
  });

  it('should create an instance', () => {
    const directiveEl = fixture.nativeElement.querySelector('div');
    expect(directiveEl).toBeTruthy();
  });
});
