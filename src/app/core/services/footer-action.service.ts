import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { FooterAction } from '../models/footer-action.model';

@Injectable({
  providedIn: 'root'
})
export class FooterActionService {

  // null = footer is hidden. An array = footer is visible.
  public actions$ = new BehaviorSubject<FooterAction[] | null>(null);

  constructor() { }

  /**
   * Sets the actions to be displayed in the footer.
   * @param actions An array of actions, or null to hide the footer.
   */
  setActions(actions: FooterAction[] | null): void {
    this.actions$.next(actions);
  }

  /**
   * Clears all actions and hides the footer.
   */
  clearActions(): void {
    this.actions$.next(null);
  }
}