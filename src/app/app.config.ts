import { ApplicationConfig, provideAppInitializer, inject, LOCALE_ID } from '@angular/core';
import {
  provideRouter,
  RouteReuseStrategy,
  withPreloading,
  PreloadAllModules,
  withViewTransitions,
} from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { registerLocaleData } from '@angular/common';

import { routes } from './app.routes';
import { authInterceptor } from './core/interceptors/auth.interceptor';
import { idTokenInterceptor } from './core/interceptors/id-token.interceptor';
import { AuthService } from './core/services/auth.service';
import localeVi from '@angular/common/locales/vi';

import { CustomRouteReuseStrategy } from './core/strategies/custom-route-reuse-strategy';

registerLocaleData(localeVi);

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(
      routes,
      withPreloading(PreloadAllModules),
      withViewTransitions()
    ),

    provideHttpClient(
      withInterceptors([authInterceptor, idTokenInterceptor])
    ),

    { provide: LOCALE_ID, useValue: 'vi' },
    { provide: RouteReuseStrategy, useClass: CustomRouteReuseStrategy },

    provideAppInitializer(() => {
      const authService = inject(AuthService);
      return authService.init();
    }),
  ],
};