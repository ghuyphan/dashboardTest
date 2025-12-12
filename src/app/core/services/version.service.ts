import { Injectable, signal, inject, PLATFORM_ID, effect } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { APP_VERSION, GIT_HASH } from '../../../environments/version';

@Injectable({
  providedIn: 'root',
})
export class VersionService {
  private platformId = inject(PLATFORM_ID);

  // Combine Semantic Version and Git Hash
  public appVersion = signal<string>(
    GIT_HASH ? `${APP_VERSION} (${GIT_HASH})` : APP_VERSION
  );

  public isDevMode = signal<boolean>(false);

  constructor() {
    // 1. Initialize state from LocalStorage (Browser only)
    if (isPlatformBrowser(this.platformId)) {
      const storedState = localStorage.getItem('dev_mode');
      if (storedState === 'true') {
        this.isDevMode.set(true);
      }
    }

    // 2. Reactively persist state and update DOM body class
    effect(() => {
      const devMode = this.isDevMode();

      if (isPlatformBrowser(this.platformId)) {
        // Persist
        localStorage.setItem('dev_mode', String(devMode));

        // Update Body Class for global styling hooks
        if (devMode) {
          document.body.classList.add('dev-mode-active');
        } else {
          document.body.classList.remove('dev-mode-active');
        }
      }
    });
  }

  getVersion(): string {
    return this.appVersion();
  }
}
