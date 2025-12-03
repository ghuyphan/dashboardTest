import { TemplateRef, ViewContainerRef } from '@angular/core';
import { HasPermissionDirective } from './has-permission.directive';
import { AuthService } from '../../core/services/auth.service';
import { of } from 'rxjs';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';

describe('HasPermissionDirective', () => {
  it('should create an instance', () => {
    const templateRef = jasmine.createSpyObj('TemplateRef', ['elementRef', 'createEmbeddedView']);
    const viewContainer = jasmine.createSpyObj('ViewContainerRef', ['createEmbeddedView', 'clear']);
    const authService = jasmine.createSpyObj('AuthService', ['getUserPermissions'], {
      currentUser$: of(null)
    });

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([])
      ]
    });

    const directive = new HasPermissionDirective(templateRef, viewContainer, authService);

    expect(directive).toBeTruthy();
  });
});