// src/app/services/dropdown-data.service.spec.ts
import { TestBed } from '@angular/core/testing';
import { DropdownDataService } from './dropdown-data.service';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';

describe('DropdownDataService', () => {
  let service: DropdownDataService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(), // Add provideHttpClient
        provideHttpClientTesting() // Add provideHttpClientTesting
      ]
    });
    service = TestBed.inject(DropdownDataService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});