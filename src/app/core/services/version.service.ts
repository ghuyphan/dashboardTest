import { Injectable, signal } from '@angular/core';
import { APP_VERSION } from '../../../environments/version';

@Injectable({
  providedIn: 'root'
})
export class VersionService {
  
  public appVersion = signal<string>(APP_VERSION);

  constructor() { }

  getVersion(): string {
    return this.appVersion();
  }
}