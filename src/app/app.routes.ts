import { Routes } from '@angular/router';
import { LoginComponent } from './login/login.component';
import { ForgotPasswordComponent } from './forgot-password/forgot-password.component';
import { authGuard } from './guards/auth.guard';

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
    canActivate: [authGuard],
    children: [
      { path: 'home', component: HomeComponent },
      
      // --- Add your future child routes here ---
      // { path: 'users', component: UserManagementComponent },
      // { path: 'reports', component: ReportsComponent },
      
      // If the user goes to /app, redirect them to /app/home
      { path: '', redirectTo: 'home', pathMatch: 'full' }
    ]
  },

  // Redirect the root path to login
  { path: '', redirectTo: '/login', pathMatch: 'full' },

];