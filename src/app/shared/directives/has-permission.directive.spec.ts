import { TemplateRef, ViewContainerRef } from '@angular/core';
import { HasPermissionDirective } from './has-permission.directive';
import { AuthService } from '../../core/services/auth.service';
import { of } from 'rxjs';

describe('HasPermissionDirective', () => {
  it('should create an instance', () => {
    const templateRef = jasmine.createSpyObj('TemplateRef', ['elementRef', 'createEmbeddedView']);
    const viewContainer = jasmine.createSpyObj('ViewContainerRef', ['createEmbeddedView', 'clear']);
    const authService = jasmine.createSpyObj('AuthService', ['getUserPermissions'], {
      currentUser$: of(null) 
    });
    const directive = new HasPermissionDirective(templateRef, viewContainer, authService);
    
    expect(directive).toBeTruthy();
  });
});