import { ShortcutInput } from '../services/keyboard-shortcut.service';

/**
 * Centralized keyboard shortcuts configuration.
 * Edit this file to manage all application shortcuts in one place.
 */

// =============================================================================
// GLOBAL SHORTCUTS (MainLayout)
// =============================================================================
export const GLOBAL_SHORTCUTS = {
  /** Toggle sidebar: Ctrl + . */
  TOGGLE_SIDEBAR: { key: '.', ctrlKey: true } as ShortcutInput,

  /** Global search focus: Ctrl + K */
  SEARCH: { key: 'k', ctrlKey: true } as ShortcutInput,

  /** Toggle AI Chat: Ctrl + / */
  AI_CHAT: { key: '/', ctrlKey: true } as ShortcutInput,

  /** Navigate to Settings: Alt + S */
  SETTINGS: { key: 's', altKey: true } as ShortcutInput,

  /** Logout: Ctrl + Alt + L */
  LOGOUT: { key: 'l', ctrlKey: true, altKey: true } as ShortcutInput,

  /** Close/Cancel: Escape */
  ESCAPE: { key: 'Escape' } as ShortcutInput,
};

// =============================================================================
// ACTION FOOTER DEFAULT SHORTCUTS
// =============================================================================
export const ACTION_FOOTER_SHORTCUTS = {
  /** Primary action (save/submit): Ctrl + Enter */
  PRIMARY_ENTER: { key: 'Enter', ctrlKey: true } as ShortcutInput,

  /** Primary action (save): Ctrl + S */
  PRIMARY_SAVE: { key: 's', ctrlKey: true } as ShortcutInput,
};

// =============================================================================
// DEVICE LIST SCREEN SHORTCUTS
// =============================================================================
export const DEVICE_LIST_SHORTCUTS = {
  /** Create new device: Alt + C (Note: Alt+N is captured by browser) */
  CREATE: { key: 'c', altKey: true } as ShortcutInput,

  /** Edit selected device: Alt + E */
  EDIT: { key: 'e', altKey: true } as ShortcutInput,

  /** Delete selected device: Delete */
  DELETE: { key: 'Delete' } as ShortcutInput,

  /** View device details: Alt + V */
  VIEW: { key: 'v', altKey: true } as ShortcutInput,
};

// =============================================================================
// DATE FILTER SHORTCUTS
// =============================================================================
export const DATE_FILTER_SHORTCUTS = {
  /** Open date picker: Alt + F */
  OPEN_PICKER: { key: 'f', altKey: true } as ShortcutInput,

  /** Apply filter: Alt + Enter */
  APPLY: { key: 'Enter', altKey: true } as ShortcutInput,

  /** Quick range - Today: Alt + 1 */
  QUICK_TODAY: { key: '1', altKey: true } as ShortcutInput,

  /** Quick range - This Week: Alt + 2 */
  QUICK_THIS_WEEK: { key: '2', altKey: true } as ShortcutInput,

  /** Quick range - This Month: Alt + 3 */
  QUICK_THIS_MONTH: { key: '3', altKey: true } as ShortcutInput,

  /** Quick range - This Quarter: Alt + 4 */
  QUICK_THIS_QUARTER: { key: '4', altKey: true } as ShortcutInput,

  /** Quick range - This Year: Alt + 5 */
  QUICK_THIS_YEAR: { key: '5', altKey: true } as ShortcutInput,
};

// =============================================================================
// HELPER: Get display string for a shortcut
// =============================================================================
export function getShortcutDisplayString(
  shortcut: ShortcutInput,
  isApplePlatform: boolean = false
): string {
  const parts: string[] = [];

  // On Apple platforms, show ⌘ (Command) instead of Ctrl
  if (shortcut.ctrlKey) {
    parts.push(isApplePlatform ? '⌘' : 'Ctrl');
  }
  if (shortcut.altKey) {
    // Alt is called Option (⌥) on Mac, but Alt is still commonly understood
    parts.push(isApplePlatform ? '⌥' : 'Alt');
  }
  if (shortcut.shiftKey) parts.push('Shift');
  if (shortcut.metaKey) parts.push(isApplePlatform ? '⌘' : 'Meta');

  // Format key nicely
  let keyDisplay = shortcut.key;
  if (keyDisplay === 'Enter') keyDisplay = 'Enter';
  else if (keyDisplay === 'Delete') keyDisplay = 'Del';
  else if (keyDisplay === 'Escape') keyDisplay = 'Esc';
  else if (keyDisplay === ' ') keyDisplay = 'Space';
  else keyDisplay = keyDisplay.toUpperCase();

  parts.push(keyDisplay);
  return parts.join(' + ');
}
