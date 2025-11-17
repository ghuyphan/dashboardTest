import { TestBed } from '@angular/core/testing';

import { WordExportService } from './word-export.service';

describe('WordExportService', () => {
  let service: WordExportService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(WordExportService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
