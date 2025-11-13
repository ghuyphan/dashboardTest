import { Routes } from '@angular/router';
import { LoginComponent } from './login/login.component';
import { ForgotPasswordComponent } from './forgot-password/forgot-password.component';
import { authGuard } from './guards/auth.guard';
import { permissionGuard } from './guards/permission.guard';
import { MainLayoutComponent } from './main-layout/main-layout.component';

export const routes: Routes = [
  { path: 'login', component: LoginComponent },
  { path: 'forgot-password', component: ForgotPasswordComponent },

  {
    path: 'app',
    component: MainLayoutComponent,
    canActivate: [authGuard],
    children: [
      {
        path: 'home',
        loadComponent: () => 
          import('./home/home.component').then(m => m.HomeComponent),
        data: { title: 'Trang chủ' }
      },

      {
        path: 'equipment/catalog',
        loadComponent: () => 
          import('./device-list/device-list.component').then(m => m.DeviceListComponent),
        canActivate: [permissionGuard],
        data: {
          permission: 'QLThietBi.DMThietBi',
          title: 'Danh mục thiết bị',
          showSearchBar: true
        }
      },
      {
        path: 'equipment/catalog/:id',
        loadComponent: () => 
          import('./device-detail/device-detail.component').then(m => m.DeviceDetailComponent),
        canActivate: [permissionGuard],
        data: {
          permission: 'QLThietBi.DMThietBi', 
          title: 'Thông tin thiết bị',
          showSearchBar: false,
          showBackButton: true
        }
      },
      {
        path: 'reports/bed-usage',
        loadComponent: () => 
          import('./bed-usage/bed-usage.component').then(m => m.BedUsageComponent),
        canActivate: [permissionGuard],
        data: {
          permission: 'BaoCao.CongSuatGiuongBenh',
          title: 'Công suất giường bệnh',
          showSearchBar: false
        }
      },

      { path: '', redirectTo: 'home', pathMatch: 'full' }
    ]
  },

  // Redirect the root path to login
  { path: '', redirectTo: '/login', pathMatch: 'full' },

];