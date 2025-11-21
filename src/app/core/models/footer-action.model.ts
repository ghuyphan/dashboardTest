export interface FooterAction {
  label: string;
  icon?: string;
  action: () => void;
  permission?: string;
  disabled?: boolean;
  className?: string;
}