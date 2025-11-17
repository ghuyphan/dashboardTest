import { ApplicationConfig, provideAppInitializer, inject, LOCALE_ID } from '@angular/core';
// --- 1. IMPORT RouteReuseStrategy ---
import { provideRouter, RouteReuseStrategy } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { registerLocaleData } from '@angular/common';

import { routes } from './app.routes';
import { authInterceptor } from './interceptors/auth.interceptor';
import { idTokenInterceptor } from './interceptors/id-token.interceptor';
import { AuthService } from './services/auth.service';
import localeVi from '@angular/common/locales/vi';

import { CustomRouteReuseStrategy } from './custom-route-reuse-strategy'; 

registerLocaleData(localeVi);

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes),
    
    provideHttpClient(withInterceptors([
      authInterceptor,
      idTokenInterceptor 
    ])),

    { provide: LOCALE_ID, useValue: 'vi' },

    // --- 3. PROVIDE our new strategy ---
    { provide: RouteReuseStrategy, useClass: CustomRouteReuseStrategy },

    provideAppInitializer(() => {
      const authService = inject(AuthService); 
      return authService.init();
    })
  ]
};