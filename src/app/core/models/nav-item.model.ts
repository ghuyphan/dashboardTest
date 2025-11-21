export interface NavItem {
  label: string;
  icon: string;
  link?: string | null; // Allow null links for parent items
  permissions: string[];
  children?: NavItem[];
  isOpen?: boolean;
}