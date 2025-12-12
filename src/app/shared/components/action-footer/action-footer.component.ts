import { Component, OnInit, inject, DestroyRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Observable, merge } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FooterActionService } from '../../../core/services/footer-action.service';
import { FooterAction } from '../../../core/models/footer-action.model';
import { HasPermissionDirective } from '../../directives/has-permission.directive';
import { KeyboardShortcutService } from '../../../core/services/keyboard-shortcut.service';
import {
  ACTION_FOOTER_SHORTCUTS,
  getShortcutDisplayString,
} from '../../../core/config/keyboard-shortcuts.config';
import { TooltipDirective } from '../../directives/tooltip.directive';

@Component({
  selector: 'app-action-footer',
  standalone: true,
  imports: [CommonModule, HasPermissionDirective, TooltipDirective],
  templateUrl: './action-footer.component.html',
  styleUrls: ['./action-footer.component.scss'],
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
    // Dynamic shortcut handling
    this.actions$
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        switchMap((actions: FooterAction[] | null) => {
          if (!actions || actions.length === 0) {
            return new Observable<{
              action: FooterAction;
              event: KeyboardEvent;
            }>(observer => observer.complete());
          }

          const shortcutObservables: Observable<{
            action: FooterAction;
            event: KeyboardEvent;
          }>[] = [];

          // 1. Register explicit shortcuts from actions
          actions.forEach(action => {
            if (action.shortcut && !action.disabled) {
              const sub = this.shortcutService
                .listen(action.shortcut, true)
                .pipe(map(e => ({ action, event: e.event })));
              shortcutObservables.push(sub);
            }
          });

          // 2. Default Primary Action Shortcuts (Ctrl+Enter, Ctrl+S)
          const primary =
            actions.find(a => a.className?.includes('btn-primary')) ||
            actions[actions.length - 1];

          if (primary && !primary.disabled && !primary.shortcut) {
            const defaultEnter = this.shortcutService
              .listen(ACTION_FOOTER_SHORTCUTS.PRIMARY_ENTER, true)
              .pipe(map(e => ({ action: primary, event: e.event })));
            const defaultSave = this.shortcutService
              .listen(ACTION_FOOTER_SHORTCUTS.PRIMARY_SAVE, true)
              .pipe(map(e => ({ action: primary, event: e.event })));
            shortcutObservables.push(defaultEnter, defaultSave);
          }

          if (shortcutObservables.length === 0) {
            return new Observable<never>();
          }

          return merge(...shortcutObservables);
        })
      )
      .subscribe((result: { action: FooterAction; event: KeyboardEvent }) => {
        if (result && result.event) {
          result.event.preventDefault();
          result.event.stopPropagation();
        }
        if (result && result.action) {
          this.executeAction(result.action);
        }
      });
  }

  // Helper moved from triggerPrimaryAction logic, now simplified
  private triggerPrimaryAction(event: KeyboardEvent): void {
    // Deprecated in favor of dynamic stream above, but keeping if needed for edge cases or external calls?
    // Actually, with the above logic, we don't need this method anymore for the shortcuts.
    // But if we want to keep the method for potentially other usages (though none visible),
    // I'll leave it empty or remove it.
    // The instruction said "Update Action Footer component...", I will remove this legacy method
    // to avoid confusion and use the new stream.
  }

  executeAction(action: FooterAction): void {
    if (action.action) {
      action.action();
    }
  }

  getTooltip(action: FooterAction): string {
    let tooltip = action.label;
    if (action.shortcut) {
      tooltip += ` (${getShortcutDisplayString(action.shortcut)})`;
    }
    return tooltip;
  }
}
