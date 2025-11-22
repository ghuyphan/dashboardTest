import { Routes } from '@angular/router';
import { AuthLayoutComponent } from './layouts/auth-layout/auth-layout.component'; // Import new layout
import { authGuard } from './core/guards/auth.guard';
import { permissionGuard } from './core/guards/permission.guard';
import { MainLayoutComponent } from './layouts/main-layout/main-layout.component';

export const routes: Routes = [
{
    path: '',
    component: AuthLayoutComponent,
    children: [
      { path: 'login', loadComponent: () => import('./features/auth/login/login.component').then(m => m.LoginComponent) },
      { path: 'forgot-password', loadComponent: () => import('./features/auth/forgot-password/forgot-password.component').then(m => m.ForgotPasswordComponent) },
      { path: '', redirectTo: 'login', pathMatch: 'full' }
    ]
  },

  {
    path: 'app',
    component: MainLayoutComponent,
    canActivate: [authGuard],
    children: [
      {
        path: 'home',
        loadComponent: () => 
          import('./features/dashboard/home/home.component').then(m => m.HomeComponent),
        data: { title: 'Trang chủ' }
      },
      {
        path: 'profile/change-password',
        loadComponent: () => 
          import('./features/profile/change-password/change-password.component')
            .then(m => m.ChangePasswordComponent),
        data: { title: 'Đổi mật khẩu' }
      },

      {
        path: 'equipment/catalog',
        loadComponent: () => 
          import('./features/equipment/device-list/device-list.component').then(m => m.DeviceListComponent),
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
          import('./features/equipment/device-detail/device-detail.component').then(m => m.DeviceDetailComponent),
        canActivate: [permissionGuard],
        data: {
          permission: 'QLThietBi.DMThietBi', 
          title: 'Thông tin thiết bị',
          showSearchBar: false,
          showBackButton: true
        }
      },
            {
        path: 'equipment/dashboard',
        loadComponent: () => 
          import('./features/equipment/device-dashboard/device-dashboard.component').then(m => m.DeviceDashboardComponent),
        canActivate: [permissionGuard],
        data: {
          permission: 'QLThietBi.TQThietBi', 
          title: 'Tổng quan thiết bị',
          showSearchBar: false,
          showBackButton: false
        }
      },
      {
        path: 'reports/bed-usage',
        loadComponent: () => 
          import('./features/reports/bed-usage/bed-usage.component').then(m => m.BedUsageComponent),
        canActivate: [permissionGuard],
        data: {
          permission: 'BaoCao.CongSuatGiuongBenh',
          title: 'Công suất giường bệnh',
          showSearchBar: false
        }
      },

      {
        path: 'reports/examination-overview',
        loadComponent: () => 
          import('./features/examination-overview/examination-overview.component').then(m => m.ExaminationOverviewComponent),
        canActivate: [permissionGuard],
        data: {
          permission: 'BaoCao.TongQuanKCB',
          title: 'Tổng quan khám chữa bệnh',
          showSearchBar: false
        }
      },

      { path: '', redirectTo: 'home', pathMatch: 'full' }
    ]
  },
  { path: '', redirectTo: '/login', pathMatch: 'full' },

];