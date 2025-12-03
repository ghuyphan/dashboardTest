import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';

import { FooterActionService } from './footer-action.service';

describe('FooterActionService', () => {
  let service: FooterActionService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([])
      ]
    });
    service = TestBed.inject(FooterActionService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
