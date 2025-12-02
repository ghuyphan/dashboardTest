import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { LlmService } from './llm.service';
import { AuthService } from './auth.service';
import { ThemeService } from './theme.service';
import { Router } from '@angular/router';
import { environment } from '../../../environments/environment.development';

describe('LlmService', () => {
  let service: LlmService;
  let httpMock: HttpTestingController;

  const mockAuthService = {
    isLoggedIn: () => true,
    getAccessToken: () => 'token',
    currentUser: () => ({ permissions: [] })
  };

  const mockThemeService = {
    isDarkTheme: () => false,
    toggleTheme: () => { }
  };

  const mockRouter = {
    url: '/home',
    navigateByUrl: jasmine.createSpy('navigateByUrl').and.returnValue(Promise.resolve(true)),
    config: []
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [
        LlmService,
        { provide: AuthService, useValue: mockAuthService },
        { provide: ThemeService, useValue: mockThemeService },
        { provide: Router, useValue: mockRouter }
      ]
    });
    service = TestBed.inject(LlmService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should update itHotline from health check config', fakeAsync(() => {
    const mockConfig = {
      status: 'ok',
      config: {
        hotline: '9999'
      }
    };

    // Trigger loadModel which calls checkHealth
    service.loadModel();

    const healthUrl = environment.llmUrl.replace('/api/llm', '/health');
    const req = httpMock.expectOne(healthUrl);
    expect(req.request.method).toBe('GET');
    req.flush(mockConfig);

    // Advance time to handle minDelay (1000ms) and promise resolution
    tick(1000);

    expect(service.itHotline()).toBe('9999');
  }));
});
