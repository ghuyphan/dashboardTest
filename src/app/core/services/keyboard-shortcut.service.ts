import { Injectable, NgZone, OnDestroy } from '@angular/core';
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
    providedIn: 'root'
})
export class KeyboardShortcutService implements OnDestroy {
    private _keyDown$ = new Subject<KeyboardEvent>();
    private _subscriptions: Subscription[] = [];

    // Observable for all keydown events, filtered to exclude inputs by default
    public keyDown$: Observable<KeyboardEvent>;

    constructor(private ngZone: NgZone) {
        // Run outside Angular zone to avoid excessive change detection on every keypress
        this.ngZone.runOutsideAngular(() => {
            const sub = fromEvent<KeyboardEvent>(window, 'keydown').subscribe(event => {
                // We only want to re-enter the zone if we are actually handling a shortcut
                // But for generic emission, we might want to stay outside. 
                // Consumers can decide to re-enter zone if they update UI.
                this._keyDown$.next(event);
            });
            this._subscriptions.push(sub);
        });

        this.keyDown$ = this._keyDown$.asObservable().pipe(
            share()
        );
    }

    /**
     * Register a shortcut to listen for.
     * @param input Definition of the shortcut keys
     * @param allowInInputs If true, triggers even when user is typing in an input/textarea
     */
    listen(input: ShortcutInput, allowInInputs: boolean = false): Observable<ShortcutEvent> {
        return this.keyDown$.pipe(
            filter(event => {
                // 1. Check if we should ignore input fields
                if (!allowInInputs && this.isInputActive(event)) {
                    return false;
                }

                // 2. Check modifiers
                const ctrl = input.ctrlKey ?? false;
                const alt = input.altKey ?? false;
                const shift = input.shiftKey ?? false;
                const meta = input.metaKey ?? false;

                if (event.ctrlKey !== ctrl) return false;
                if (event.altKey !== alt) return false;
                if (event.shiftKey !== shift) return false;
                if (event.metaKey !== meta) return false;

                // 3. Check key
                // event.key is case sensitive ('a' vs 'A'). 
                // We usually standardise to lowercase for comparison if we don't care about Shift,
                // but if Shift is involved, event.key changes.
                // Let's use case-insensitive compare for the key character itself if strict match fails.
                if (event.key.toLowerCase() !== input.key.toLowerCase()) {
                    return false;
                }

                return true;
            }),
            map(event => ({
                event,
                combo: this.getComboString(event)
            })),
            // Helpers to prevent default easily
            tap(({ event }) => {
                // We don't auto-preventDefault. Consumer should do it if needed.
                // But we DO re-enter ngZone here because if a shortcut matches, 
                // the consumer likely wants to update UI.
                this.ngZone.run(() => { }); // Minimal re-entry or let consumer handle it? 
                // Better to let consumer handle implicit zone entry? 
                // Actually, 'fromEvent' usually patches into Zone. 
                // But we explicitly ran outside default zone in constructor.
                // So we MUST re-enter zone if we want standard Angular binding updates to work.
            }),
            // We pipe through ngZone.run to ensure subscription callbacks run in Angular Zone
            source => new Observable(observer => {
                return source.subscribe({
                    next: (x) => this.ngZone.run(() => observer.next(x)),
                    error: (err) => this.ngZone.run(() => observer.error(err)),
                    complete: () => this.ngZone.run(() => observer.complete())
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
