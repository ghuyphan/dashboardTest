export interface NavItem {
  label: string;
  icon: string;
  link?: string;
  permissions: string[];
  children?: NavItem[];
  isOpen?: boolean;
}

// Define and export the navigation items array
export const navItems: NavItem[] = [
  {
    label: 'Home',
    icon: 'fas fa-home',
    link: '/app/home', // Note: Make sure links align with app.routes.ts ('/app/home')
    permissions: [] // Empty array = visible to all logged-in users
  },
  {
    label: 'Management',
    icon: 'fas fa-cogs',
    // Parent is visible if user has AT LEAST ONE of the child permissions
    permissions: ['CAN_MANAGE_USERS', 'CAN_VIEW_SETTINGS'], 
    isOpen: false,
    children: [
      {
        label: 'User Admin',
        icon: 'fas fa-users-cog',
        link: '/app/users', // Example link
        permissions: ['CAN_MANAGE_USERS'] // Specific permission
      },
      {
        label: 'System Settings',
        icon: 'fas fa-tools',
        link: '/app/settings', // Example link
        permissions: ['CAN_VIEW_SETTINGS'] // Specific permission
      }
    ]
  },
  {
    label: 'Profile',
    icon: 'fas fa-user',
    link: '/app/profile', // Example link
    permissions: [] // Visible to all
  }
];