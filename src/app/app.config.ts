// src/app/app.config.ts
import { ApplicationConfig, provideAppInitializer, inject } from '@angular/core'; // <-- 1. IMPORT
import { provideRouter } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
// Removed 'Observable' as it's no longer needed here

import { routes } from './app.routes';
import { authInterceptor } from './interceptors/auth.interceptor';
import { MockAuthInterceptor } from './interceptors/mock-auth.interceptor';
import { AuthService } from './services/auth.service'; // <-- Import AuthService

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes),
    
    provideHttpClient(withInterceptors([
      MockAuthInterceptor, // The mock runs first
      authInterceptor 
    ])),

    // --- START OF FIX ---
    // Replace the old { provide: APP_INITIALIZER, ... } object
    // with the new provideAppInitializer function.
    provideAppInitializer(() => {
      // We use inject() here to get the service
      const authService = inject(AuthService); 
      // Return the init() function call
      return authService.init();
    })
    // --- END OF FIX ---
  ]
};