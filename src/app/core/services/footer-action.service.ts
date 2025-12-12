import { Injectable, signal } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { FooterAction } from '../models/footer-action.model';

@Injectable({
  providedIn: 'root',
})
export class FooterActionService {
  private _actions = signal<FooterAction[] | null>(null);

  public actions = this._actions.asReadonly();

  public actions$ = toObservable(this._actions);

  constructor() {}

  /**
   * Sets the actions to be displayed in the footer.
   * @param actions An array of actions, or null to hide the footer.
   */
  setActions(actions: FooterAction[] | null): void {
    this._actions.set(actions);
  }

  /**
   * Clears all actions and hides the footer.
   */
  clearActions(): void {
    this._actions.set(null);
  }
}
