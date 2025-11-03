import { TestBed } from '@angular/core/testing';

import { FooterActionService } from './footer-action.service';

describe('FooterActionService', () => {
  let service: FooterActionService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(FooterActionService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
