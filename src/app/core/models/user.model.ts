/**
 * Represents the application user object
 */
export interface User {
  id: string;
  username: string;
  roles: string[];
  permissions: string[];
  fullName?: string;
}