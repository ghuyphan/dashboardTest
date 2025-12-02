import { Routes } from '@angular/router';
import { AuthLayoutComponent } from './layouts/auth-layout/auth-layout.component';
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
        data: {
          title: 'Trang chủ',
          keywords: ['dashboard', 'tong quan', 'main', 'home']
        },
      },
      {
        path: 'settings',
        loadComponent: () =>
          import('./features/settings/settings.component').then(
            (m) => m.SettingsComponent
          ),
        data: {
          title: 'Cài đặt tài khoản',
          keywords: ['doi mat khau', 'tai khoan', 'password', 'mk', 'change password', 'profile'],
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
          keywords: ['thiet bi', 'may moc', 'catalog', 'danh sach thiet bi'],
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
          keywords: ['thiet bi dashboard', 'bieu do thiet bi', 'equipment dashboard'],
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
          keywords: ['giuong', 'bed', 'cong suat', 'bed usage', 'giuong benh'],
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
          keywords: ['kham', 'kcb', 'bhyt', 'vien phi', 'doanh thu', 'kham benh'],
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
          keywords: ['hsba', 'ho so benh an', 'thieu hsba', 'benh an ngoai tru'],
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
          permission: 'BaoCao.KhamCLST3',
          title: 'Tầng 3 Khám và CLS',
          keywords: ['cls 3', 'tang 3', 'xet nghiem tang 3', 'can lam sang 3'],
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
          permission: 'BaoCao.KhamCLST6',
          title: 'Tầng 6 Khám và CLS',
          keywords: ['cls 6', 'tang 6', 'xet nghiem tang 6', 'can lam sang 6'],
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
          keywords: ['cls chuyen khoa', 'specialty', 'ck', 'can lam sang chuyen khoa'],
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
          keywords: ['cap cuu', 'cap cuu ti le', 'ti le cap cuu', 'emergency ratio', 'cc'],
          showSearchBar: false,
        },
      },
      {
        path: 'reports/emergency-admission-comparison',
        loadComponent: () =>
          import(
            './features/reports/emergency-admission-comparison/emergency-admission-comparison.component'
          ).then((m) => m.EmergencyAdmissionComparisonComponent),
        canActivate: [permissionGuard],
        data: {
          permission: 'CapCuu.CapCuu02',
          title: 'Cấp cứu lượt nhập viện',
          keywords: ['cap cuu', 'cap cuu nhap vien', 'luot nhap vien', 'nhap vien tu cap cuu'],
          showSearchBar: false,
        },
      },
      {
        path: 'reports/surgery',
        loadComponent: () =>
          import(
            './features/reports/surgery-report/surgery-report.component'
          ).then((m) => m.SurgeryReportComponent),
        canActivate: [permissionGuard],
        data: {
          permission: 'PTTT.PhauThuat',
          title: 'Thống kê Phẫu thuật',
          keywords: ['phau thuat', 'pttt', 'mo', 'surgery'],
          showSearchBar: false,
        },
      },
      {
        path: 'reports/detailed-examination',
        loadComponent: () =>
          import(
            './features/reports/detailed-examination-report/detailed-examination-report.component'
          ).then((m) => m.DetailedExaminationReportComponent),
        canActivate: [permissionGuard],
        data: {
          permission: 'KhamBenh.ChiTiet',
          title: 'Chi tiết khám bệnh',
          keywords: ['chi tiet kham', 'kham benh chi tiet', 'so luot kham'],
          showSearchBar: false,
        },
      },

      { path: '', redirectTo: 'home', pathMatch: 'full' },
    ],
  },
  { path: '', redirectTo: '/login', pathMatch: 'full' },
];