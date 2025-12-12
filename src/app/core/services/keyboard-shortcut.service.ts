import { Injectable, NgZone, OnDestroy, signal } from '@angular/core';
import { fromEvent, Observable, Subject, Subscription } from 'rxjs';
import { filter, map, share, takeUntil, tap } from 'rxjs/operators';

export interface ShortcutInput {
  key: string; // e.g., 'a', 'Escape', 'Enter'
  ctrlKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
  metaKey?: boolean; // Windows key (Command on Mac)
}

export interface ShortcutEvent {
  event: KeyboardEvent;
  combo: string; // informative string representation like "Ctrl+Alt+S"
}

@Injectable({
  providedIn: 'root',
})
export class KeyboardShortcutService implements OnDestroy {
  private _keyDown$ = new Subject<KeyboardEvent>();
  private _isApplePlatform: boolean;
  private _hasKeyboard = signal(false);

  /**
   * Returns true if running on macOS, iOS, or iPadOS.
   * On Apple platforms, Cmd (⌘) is used instead of Ctrl.
   */
  get isApplePlatform(): boolean {
    return this._isApplePlatform;
  }

  /**
   * Signal that indicates if a physical keyboard has been detected.
   * Updates when the user presses any key, useful for showing/hiding
   * keyboard shortcuts UI on mobile devices.
   */
  readonly hasKeyboard = this._hasKeyboard.asReadonly();

  private _subscriptions: Subscription[] = [];

  // Observable for all keydown events, filtered to exclude inputs by default
  public keyDown$: Observable<KeyboardEvent>;

  constructor(private ngZone: NgZone) {
    // Detect Apple platform (macOS, iOS, iPadOS)
    this._isApplePlatform = this.detectApplePlatform();

    // Run outside Angular zone to avoid excessive change detection on every keypress
    this.ngZone.runOutsideAngular(() => {
      const sub = fromEvent<KeyboardEvent>(window, 'keydown').subscribe(
        event => {
          // Detect keyboard connection on first keydown (for mobile devices)
          if (!this._hasKeyboard()) {
            this.ngZone.run(() => this._hasKeyboard.set(true));
          }

          // We only want to re-enter the zone if we are actually handling a shortcut
          // But for generic emission, we might want to stay outside.
          // Consumers can decide to re-enter zone if they update UI.
          this._keyDown$.next(event);
        }
      );
      this._subscriptions.push(sub);
    });

    this.keyDown$ = this._keyDown$.asObservable().pipe(share());
  }

  /**
   * Register a shortcut to listen for.
   * @param input Definition of the shortcut keys
   * @param allowInInputs If true, triggers even when user is typing in an input/textarea
   */
  listen(
    input: ShortcutInput,
    allowInInputs: boolean = false,
    ignoreModalCheck: boolean = false
  ): Observable<ShortcutEvent> {
    return this.keyDown$.pipe(
      filter(event => {
        // IMPORTANT: Ignore key repeat events to prevent infinite triggering
        if (event.repeat) {
          return false;
        }

        // Block shortcuts when a modal is open (check for CDK overlay), unless explicitly ignored
        if (!ignoreModalCheck && this.isModalOpen()) {
          return false;
        }

        // 1. Check if we should ignore input fields
        if (!allowInInputs && this.isInputActive(event)) {
          return false;
        }

        // 2. Check modifiers
        const ctrl = input.ctrlKey ?? false;
        const alt = input.altKey ?? false;
        const shift = input.shiftKey ?? false;
        const meta = input.metaKey ?? false;

        // Cross-platform support: On Apple platforms, accept Cmd (metaKey)
        // as an alternative to Ctrl for shortcuts that specify ctrlKey
        if (ctrl && !meta) {
          // Shortcut requires Ctrl (but not Meta)
          // Accept either Ctrl OR Cmd on Apple platforms
          const hasModifier = this._isApplePlatform
            ? event.ctrlKey || event.metaKey
            : event.ctrlKey;
          if (!hasModifier) return false;
          // Ensure the "other" meta modifier isn't unexpectedly pressed
          if (!this._isApplePlatform && event.metaKey) return false;
        } else {
          // Standard exact matching for other cases
          if (event.ctrlKey !== ctrl) return false;
          if (event.metaKey !== meta) return false;
        }

        if (event.altKey !== alt) return false;
        if (event.shiftKey !== shift) return false;

        // 3. Check key - use both event.key and event.code for better compatibility
        // On Windows, Alt+letter may not report the letter in event.key
        // event.code gives the physical key (e.g., "KeyN" for N key)
        const inputKeyLower = input.key.toLowerCase();
        const eventKeyLower = event.key.toLowerCase();

        // Direct key match
        if (eventKeyLower === inputKeyLower) {
          return true;
        }

        // Fallback: Check event.code for single letter keys (e.g., "KeyN" -> "n")
        // This handles cases where Alt+key doesn't report the letter in event.key
        if (input.key.length === 1 && event.code) {
          const codeKeyMatch = event.code.toLowerCase();
          // event.code for letters is like "KeyA", "KeyN", etc.
          if (codeKeyMatch === `key${inputKeyLower}`) {
            return true;
          }
          // event.code for digits is like "Digit1", "Digit2", etc.
          if (codeKeyMatch === `digit${inputKeyLower}`) {
            return true;
          }
        }

        return false;
      }),
      map(event => ({
        event,
        combo: this.getComboString(event),
      })),
      // Helpers to prevent default easily
      tap(({ event }) => {
        // We don't auto-preventDefault. Consumer should do it if needed.
        // But we DO re-enter ngZone here because if a shortcut matches,
        // the consumer likely wants to update UI.
        this.ngZone.run(() => {}); // Minimal re-entry or let consumer handle it?
        // Better to let consumer handle implicit zone entry?
        // Actually, 'fromEvent' usually patches into Zone.
        // But we explicitly ran outside default zone in constructor.
        // So we MUST re-enter zone if we want standard Angular binding updates to work.
      }),
      // We pipe through ngZone.run to ensure subscription callbacks run in Angular Zone
      source =>
        new Observable(observer => {
          return source.subscribe({
            next: x => this.ngZone.run(() => observer.next(x)),
            error: err => this.ngZone.run(() => observer.error(err)),
            complete: () => this.ngZone.run(() => observer.complete()),
          });
        })
    );
  }

  private isInputActive(event: KeyboardEvent): boolean {
    const target = event.target as HTMLElement;
    if (!target) return false;

    const tagName = target.tagName.toLowerCase();
    const isEditable = target.isContentEditable;

    return (
      tagName === 'input' ||
      tagName === 'textarea' ||
      tagName === 'select' ||
      isEditable
    );
  }

  /**
   * Check if a modal overlay is currently open.
   * This prevents shortcuts from triggering when modals are displayed.
   */
  private isModalOpen(): boolean {
    // Check for CDK overlay backdrop (used by Angular Material and our modal service)
    const modalBackdrop = document.querySelector(
      '.app-modal-backdrop, .cdk-overlay-backdrop'
    );
    return !!modalBackdrop;
  }

  /**
   * Detects if running on an Apple platform (macOS, iOS, iPadOS).
   * Uses multiple detection methods for reliability.
   */
  private detectApplePlatform(): boolean {
    if (typeof navigator === 'undefined') return false;

    // Modern API (navigator.userAgentData) - preferred when available
    const uaData = (navigator as any).userAgentData;
    if (uaData?.platform) {
      const platform = uaData.platform.toLowerCase();
      return platform === 'macos' || platform === 'ios';
    }

    // Fallback: Check navigator.platform (deprecated but widely supported)
    const platform = navigator.platform?.toLowerCase() || '';
    if (
      platform.includes('mac') ||
      platform.includes('iphone') ||
      platform.includes('ipad') ||
      platform.includes('ipod')
    ) {
      return true;
    }

    // Additional fallback: Check userAgent for iOS (iPad in desktop mode)
    const ua = navigator.userAgent?.toLowerCase() || '';
    if (ua.includes('macintosh') && 'ontouchend' in document) {
      // iPad in desktop mode reports as Macintosh but has touch
      return true;
    }

    return (
      ua.includes('mac os') ||
      ua.includes('iphone') ||
      ua.includes('ipad') ||
      ua.includes('ipod')
    );
  }

  private getComboString(event: KeyboardEvent): string {
    const parts = [];
    if (event.ctrlKey) parts.push('Ctrl');
    if (event.altKey) parts.push('Alt');
    if (event.shiftKey) parts.push('Shift');
    if (event.metaKey) parts.push('Meta');
    parts.push(event.key);
    return parts.join('+');
  }

  ngOnDestroy() {
    this._subscriptions.forEach(sub => sub.unsubscribe());
  }
}
