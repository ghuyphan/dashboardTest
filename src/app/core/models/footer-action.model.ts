import { ShortcutInput } from '../services/keyboard-shortcut.service';

export interface FooterAction {
  label: string;
  icon?: string;
  action: () => void;
  permission?: string;
  disabled?: boolean;
  className?: string;
  shortcut?: ShortcutInput;
}
