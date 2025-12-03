import { Component } from '@angular/core';
import { TestBed, ComponentFixture } from '@angular/core/testing';
import { FlyoutDirective } from './flyout.directive';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';

@Component({
  template: `<button [appFlyout]="menu" [flyoutEnabled]="true">Open</button><div #menu>Menu Content</div>`,
  standalone: true,
  imports: [FlyoutDirective]
})
class TestHostComponent { }

describe('FlyoutDirective', () => {
  let fixture: ComponentFixture<TestHostComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TestHostComponent, FlyoutDirective],
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
    const directiveEl = fixture.nativeElement.querySelector('button');
    expect(directiveEl).toBeTruthy();
  });
});
