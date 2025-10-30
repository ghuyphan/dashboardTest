/**
 * Represents the application user object
 */
export interface User {
  username: string;
  roles: string[];
  
  // You can add more properties here later if your API provides them,
  // e.g., email?: string, id?: string
}