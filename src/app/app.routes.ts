import { Routes } from '@angular/router';
import { LoginComponent } from './login/login.component';
import { ForgotPasswordComponent } from './forgot-password/forgot-password.component';
import { authGuard } from './guards/auth.guard';
import { permissionGuard } from './guards/permission.guard'; // NEW: Import the new guard

// --- IMPORT YOUR NEW AND RENAMED COMPONENTS ---
import { MainLayoutComponent } from './main-layout/main-layout.component';
import { HomeComponent } from './home/home.component';
// Import other components as you create them
// import { UserManagementComponent } from './user-management/user-management.component';

export const routes: Routes = [
  // Routes without the layout
  { path: 'login', component: LoginComponent },
  { path: 'forgot-password', component: ForgotPasswordComponent },

  // --- NEW Application Layout Route ---
  // This parent route loads the MainLayoutComponent.
  // All child routes will be rendered inside its <router-outlet>
  {
    path: 'app', // The new URL prefix (e.g., /app/home)
    component: MainLayoutComponent,
    canActivate: [authGuard], // This guard checks if the user is LOGGED IN
    children: [
      { path: 'home', component: HomeComponent },
      
      // --- Add your future child routes here ---
      
      // EXAMPLE 1: A route for managing users
      // This route can only be activated if the user is:
      // 1. Logged in (checked by authGuard on parent)
      // 2. Has the 'CAN_MANAGE_USERS' permission (checked by permissionGuard)
      /*
      { 
        path: 'users', 
        component: UserManagementComponent,
        canActivate: [permissionGuard], // NEW: Add the permission guard
        data: {
          permission: 'CAN_MANAGE_USERS' // NEW: Define the required permission
        }
      },
      */

      // EXAMPLE 2: A route for viewing reports
      /*
      { 
        path: 'reports', 
        component: ReportsComponent,
        canActivate: [permissionGuard],
        data: {
          permission: 'CAN_VIEW_REPORTS'
        }
      },
      */
      
      // If the user goes to /app, redirect them to /app/home
      { path: '', redirectTo: 'home', pathMatch: 'full' }
    ]
  },

  // Redirect the root path to login
  { path: '', redirectTo: '/login', pathMatch: 'full' },

];