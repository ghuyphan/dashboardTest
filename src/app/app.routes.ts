import { Routes } from '@angular/router';
import { LoginComponent } from './login/login.component';
import { ForgotPasswordComponent } from './forgot-password/forgot-password.component';
import { authGuard } from './guards/auth.guard';
import { permissionGuard } from './guards/permission.guard'; 

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
  {
    path: 'app', 
    component: MainLayoutComponent,
    canActivate: [authGuard], 
    children: [
      { 
        path: 'home', 
        component: HomeComponent,
        // *** THIS IS THE FIX ***
        // Changed 'Dashboard' back to 'Trang chủ'
        data: { title: 'Trang chủ' } 
      },
      
      // EXAMPLE 1: A route for managing users
      /*
      { 
        path: 'users', 
        component: UserManagementComponent,
        canActivate: [permissionGuard], 
        data: {
          permission: 'CAN_MANAGE_USERS', 
          title: 'Quản lý người dùng' 
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
          permission: 'CAN_VIEW_REPORTS',
          title: 'Báo cáo' 
        }
      },
      */
      
      { path: '', redirectTo: 'home', pathMatch: 'full' }
    ]
  },

  // Redirect the root path to login
  { path: '', redirectTo: '/login', pathMatch: 'full' },

];