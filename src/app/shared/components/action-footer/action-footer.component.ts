import { Component, OnInit, inject, DestroyRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Observable } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FooterActionService } from '../../../core/services/footer-action.service';
import { FooterAction } from '../../../core/models/footer-action.model';
import { HasPermissionDirective } from '../../directives/has-permission.directive';
import { KeyboardShortcutService } from '../../../core/services/keyboard-shortcut.service';

@Component({
  selector: 'app-action-footer',
  standalone: true,
  imports: [
    CommonModule,
    HasPermissionDirective
  ],
  templateUrl: './action-footer.component.html',
  styleUrls: ['./action-footer.component.scss']
})
export class ActionFooterComponent implements OnInit {

  public actions$: Observable<FooterAction[] | null>;

  private footerService = inject(FooterActionService);
  private shortcutService = inject(KeyboardShortcutService);
  private destroyRef = inject(DestroyRef);

  constructor() {
    this.actions$ = this.footerService.actions$;
  }

  ngOnInit(): void {
    // Listen for Ctrl+Enter or Ctrl+S to trigger the primary action
    this.shortcutService.listen({ key: 'Enter', ctrlKey: true }, true)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((e) => {
        this.triggerPrimaryAction(e.event);
      });

    this.shortcutService.listen({ key: 's', ctrlKey: true }, true)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((e) => {
        this.triggerPrimaryAction(e.event);
      });
  }

  private triggerPrimaryAction(event: KeyboardEvent): void {
    const actions = this.footerService.actions(); // Use signal accessor if possible, or subscribe.
    // actions$ is observable. Let's subscribe or check signal?
    // footerService has `actions` signal exposed as readonly.
    const currentActions = this.footerService.actions();

    if (currentActions && currentActions.length > 0) {
      // Find the primary action. Usually it's the last one or one with 'btn-primary' class, 
      // or we just take the last one as convention for "Confirm/Save".
      // Let's look for one with 'btn-primary' class.
      const primary = currentActions.find(a => a.className?.includes('btn-primary')) || currentActions[currentActions.length - 1];

      if (primary && !primary.disabled && primary.action) {
        event.preventDefault();
        primary.action();
      }
    }
  }

  executeAction(action: FooterAction): void {
    if (action.action) {
      action.action();
    }
  }
}