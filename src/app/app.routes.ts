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
      {
        path: 'login',
        loadComponent: () =>
          import('./features/auth/login/login.component').then(
            (m) => m.LoginComponent
          ),
      },
      {
        path: 'forgot-password',
        loadComponent: () =>
          import(
            './features/auth/forgot-password/forgot-password.component'
          ).then((m) => m.ForgotPasswordComponent),
      },
      { path: '', redirectTo: 'login', pathMatch: 'full' },
    ],
  },

  {
    path: 'app',
    component: MainLayoutComponent,
    canActivate: [authGuard],
    children: [
      {
        path: 'home',
        loadComponent: () =>
          import('./features/dashboard/home/home.component').then(
            (m) => m.HomeComponent
          ),
        data: { title: 'Trang chủ' },
      },
      {
        path: 'settings',
        loadComponent: () =>
          import('./features/settings/settings.component').then(
            (m) => m.SettingsComponent
          ),
        data: {
          title: 'Cài đặt tài khoản',
          showBackButton: true,
        },
      },

      {
        path: 'equipment/catalog',
        loadComponent: () =>
          import('./features/equipment/device-list/device-list.component').then(
            (m) => m.DeviceListComponent
          ),
        canActivate: [permissionGuard],
        data: {
          permission: 'QLThietBi.DMThietBi',
          title: 'Danh mục thiết bị',
          showSearchBar: true,
        },
      },
      {
        path: 'equipment/catalog/:id',
        loadComponent: () =>
          import(
            './features/equipment/device-detail/device-detail.component'
          ).then((m) => m.DeviceDetailComponent),
        canActivate: [permissionGuard],
        data: {
          permission: 'QLThietBi.DMThietBi',
          title: 'Thông tin thiết bị',
          showSearchBar: false,
          showBackButton: true,
        },
      },
      {
        path: 'equipment/dashboard',
        loadComponent: () =>
          import(
            './features/equipment/device-dashboard/device-dashboard.component'
          ).then((m) => m.DeviceDashboardComponent),
        canActivate: [permissionGuard],
        data: {
          permission: 'QLThietBi.TQThietBi',
          title: 'Tổng quan thiết bị',
          showSearchBar: false,
          showBackButton: false,
        },
      },
      {
        path: 'reports/bed-usage',
        loadComponent: () =>
          import('./features/reports/bed-usage/bed-usage.component').then(
            (m) => m.BedUsageComponent
          ),
        canActivate: [permissionGuard],
        data: {
          permission: 'BaoCao.CongSuatGiuongBenh',
          title: 'Công suất giường bệnh',
          showSearchBar: false,
        },
      },

      {
        path: 'reports/examination-overview',
        loadComponent: () =>
          import(
            './features/examination-overview/examination-overview.component'
          ).then((m) => m.ExaminationOverviewComponent),
        canActivate: [permissionGuard],
        data: {
          permission: 'BaoCao.TongQuanKCB',
          title: 'Tổng quan khám chữa bệnh',
          showSearchBar: false,
        },
      },

      {
        path: 'reports/missing-medical-records',
        loadComponent: () =>
          import(
            './features/reports/medical-records-status/medical-records-status.component'
          ).then((m) => m.MedicalRecordsStatusComponent),
        canActivate: [permissionGuard],
        data: {
          permission: 'KHTH.ChuaTaoHSBANgoaiTru',
          title: 'Chưa tạo HSBA (OP)',
          showSearchBar: false,
        },
      },
      {
        path: 'reports/cls-level3',
        loadComponent: () =>
          import(
            './features/reports/cls-level3-report/cls-level3-report.component'
          ).then((m) => m.ClsLevel3ReportComponent),
        canActivate: [permissionGuard],
        data: {
          permission: 'BaoCao.KhamCLST3', // Update this permission key
          title: 'Tầng 3 Khám và CLS',
          showSearchBar: false,
        },
      },
      {
        path: 'reports/cls-level6',
        loadComponent: () =>
          import(
            './features/reports/cls-level6-report/cls-level6-report.component'
          ).then((m) => m.ClsLevel6ReportComponent),
        canActivate: [permissionGuard],
        data: {
          permission: 'BaoCao.KhamCLST6', // Update this permission key
          title: 'Tầng 6 Khám và CLS',
          showSearchBar: false,
        },
      },
      {
        path: 'reports/specialty-cls',
        loadComponent: () =>
          import(
            './features/reports/specialty-cls-report/specialty-cls-report.component'
          ).then((m) => m.SpecialtyClsReportComponent),
        canActivate: [permissionGuard],
        data: {
          permission: 'BaoCao.KhamCLSTheoCK',
          title: 'Khám CLS theo chuyên khoa',
          showSearchBar: false,
        },
      },
      {
        path: 'reports/emergency-summary',
        loadComponent: () =>
          import(
            './features/reports/emergency-summary/emergency-summary.component'
          ).then((m) => m.EmergencySummaryComponent),
        canActivate: [permissionGuard],
        data: {
          permission: 'CapCuu.CapCuu01', 
          title: 'Cấp cứu tỉ lệ',
          showSearchBar: false,
        },
      },

      { path: '', redirectTo: 'home', pathMatch: 'full' },
    ],
  },
  { path: '', redirectTo: '/login', pathMatch: 'full' },
];
