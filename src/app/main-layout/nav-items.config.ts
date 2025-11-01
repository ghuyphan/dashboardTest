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
    label: 'Trang chủ', // Changed from 'Home' for consistency
    icon: 'fas fa-home',
    link: '/app/home', 
    permissions: [] // Empty array = visible to all logged-in users
  },
  {
    label: 'Báo Cáo',
    icon: 'fas fa-chart-bar', // Icon for reports
    // Parent is visible if user has AT LEAST ONE of the child permissions
    permissions: [
      'BaoCao_TinhHinhBenhTat_RVIEW',
      'BaoCao_TinhHinhSuDungGiuongBenh_RVIEW'
    ], 
    isOpen: false,
    children: [
      {
        label: 'Tình hình bệnh tật',
        icon: 'fas fa-procedures', // Example icon
        link: '/app/reports/disease-status', // *** UPDATE THIS LINK ***
        permissions: ['BaoCao_TinhHinhBenhTat_RVIEW']
      },
      {
        label: 'Sử dụng giường bệnh',
        icon: 'fas fa-bed', // Example icon
        link: '/app/reports/bed-usage', // *** UPDATE THIS LINK ***
        permissions: ['BaoCao_TinhHinhSuDungGiuongBenh_RVIEW']
      }
    ]
  },
  {
    label: 'Quản lý Thiết bị',
    icon: 'fas fa-toolbox', // Icon for equipment/tools
    // Parent is visible if user has AT LEAST ONE of the child permissions
    permissions: [
      'QuanLyThietBi_DanhMucThietBi_RVIEW_RCREATE_RMODIFY_RSAVE_RFORGET_RPREVIEW_RPRINT_RREFRESH',
      'QuanLyThietBi_QuanLyThietBiChiTiet_RVIEW_RCREATE_RMODIFY_RSAVE_RDELETE_RFORGET_RPREVIEW_RPRINT_RREFRESH',
      'QuanLyThietBi_LichSuSuaChuaBaoTri_RVIEW_RCREATE_RMODIFY_RFORGET_RPREVIEW_RPRINT_RREFRESH'
    ],
    isOpen: false,
    children: [
      {
        label: 'Danh mục thiết bị',
        icon: 'fas fa-list-ol',
        link: '/app/equipment/catalog', // *** UPDATE THIS LINK ***
        permissions: ['QuanLyThietBi_DanhMucThietBi_RVIEW_RCREATE_RMODIFY_RSAVE_RFORGET_RPREVIEW_RPRINT_RREFRESH']
      },
      {
        label: 'Quản lý chi tiết TBi',
        icon: 'fas fa-tasks',
        link: '/app/equipment/details', // *** UPDATE THIS LINK ***
        permissions: ['QuanLyThietBi_QuanLyThietBiChiTiet_RVIEW_RCREATE_RMODIFY_RSAVE_RDELETE_RFORGET_RPREVIEW_RPRINT_RREFRESH']
      },
      {
        label: 'Lịch sử sửa chữa',
        icon: 'fas fa-history',
        link: '/app/equipment/history', // *** UPDATE THIS LINK ***
        permissions: ['QuanLyThietBi_LichSuSuaChuaBaoTri_RVIEW_RCREATE_RMODIFY_RFORGET_RPREVIEW_RPRINT_RREFRESH']
      }
    ]
  },
  {
    label: 'Hồ sơ', // Changed from 'Profile'
    icon: 'fas fa-user',
    link: '/app/profile', // *** UPDATE THIS LINK ***
    permissions: [] // Visible to all
  }
];