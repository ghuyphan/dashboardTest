import { ApplicationConfig, provideAppInitializer, inject, LOCALE_ID } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { registerLocaleData } from '@angular/common'; // Import the necessary function

import { routes } from './app.routes';
import { authInterceptor } from './interceptors/auth.interceptor';
import { MockAuthInterceptor } from './interceptors/mock-auth.interceptor';
import { idTokenInterceptor } from './interceptors/id-token.interceptor';
import { AuthService } from './services/auth.service';
import localeVi from '@angular/common/locales/vi';

// Register locale data for Vietnamese (vi)
registerLocaleData(localeVi);

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes),
    
    provideHttpClient(withInterceptors([
      MockAuthInterceptor, 
      authInterceptor,
      idTokenInterceptor 
    ])),

    // Define the locale ID for the application to enable 'vi' formatting pipes
    { provide: LOCALE_ID, useValue: 'vi' },

    provideAppInitializer(() => {
      // We use inject() here to get the service
      const authService = inject(AuthService); 
      // Return the init() function call
      return authService.init();
    })
  ]
};