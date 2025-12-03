import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';

import { DropdownDataService } from './dropdown-data.service';

describe('DropdownDataService', () => {
  let service: DropdownDataService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([])
      ]
    });
    service = TestBed.inject(DropdownDataService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});