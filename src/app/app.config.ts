import { ApplicationConfig, provideAppInitializer, inject } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { routes } from './app.routes';
import { authInterceptor } from './interceptors/auth.interceptor';
import { MockAuthInterceptor } from './interceptors/mock-auth.interceptor';
import { idTokenInterceptor } from './interceptors/id-token.interceptor';
import { AuthService } from './services/auth.service'; // <-- Import AuthService

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes),
    
    provideHttpClient(withInterceptors([
      MockAuthInterceptor, 
      authInterceptor,
      idTokenInterceptor 
    ])),

    provideAppInitializer(() => {
      // We use inject() here to get the service
      const authService = inject(AuthService); 
      // Return the init() function call
      return authService.init();
    })
    // --- END OF FIX ---
  ]
};