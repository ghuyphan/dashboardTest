import { ApplicationConfig } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';

import { routes } from './app.routes';
import { authInterceptor } from './interceptors/auth.interceptor';
import { MockAuthInterceptor } from './interceptors/mock-auth.interceptor';

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes),
    
    // 2. ADD 'MockAuthInterceptor' *BEFORE* 'authInterceptor'
    provideHttpClient(withInterceptors([
      MockAuthInterceptor, // The mock runs first
      authInterceptor 
    ]))
  ]
};