import { LoginResponse, ApiPermissionNode } from './mock-interfaces';

// 1. Mock a successful Login Response
export const mockLoginResponse: LoginResponse = {
  MaKetQua: 200,
  TenKetQua: 'Đăng nhập thành công (MOCK DATA)',
  APIKey: {
    access_token: 'mock-access-token-this-is-fake-123456',
    id_token: 'mock-id-token',
  },
  UserInfo: {
    id_user: 'mock-user-id-99',
    user_name: 'mock.user',
    ten_nhan_vien: 'Mock User Name',
    nhom_chuc_danh: 'SuperAdmin' // This will be your "Role"
  }
};

// 2. Mock the Permission/Navigation API Response
// (I am using the exact data you provided earlier)
export const mockPermissionResponse: ApiPermissionNode[] = [
  {
    "ID": "100",
    "PARENT_ID": "0",
    "LABEL": "Trang chủ (Mock)", // Added (Mock) to make it obvious
    "LINK": "/app/home",
    "ICON": "fas fa-home",
    "PERMISSION": "dashboard.view",
    "PERMISSIONS": [
      "dashboard.view"
    ],
    "ORDER": 1
  },
  {
    "ID": "200",
    "PARENT_ID": "0",
    "LABEL": "Báo Cáo (Mock)",
    "LINK": null,
    "ICON": "fas fa-chart-bar",
    "PERMISSION": "report.view",
    "PERMISSIONS": [
      "report.view",
      "report.disease_status.view", // Added this so parent is visible
      "report.bed_usage.view"       // Added this so parent is visible
    ],
    "ORDER": 2
  },
  {
    "ID": "201",
    "PARENT_ID": "200",
    "LABEL": "Tình hình bệnh tật",
    "LINK": "/app/reports/disease-status",
    "ICON": "fas fa-procedures",
    "PERMISSION": "report.disease_status.view",
    "PERMISSIONS": [
      "report.disease_status.view",
      "report.disease_status.export",
      "report.disease_status.print"
    ],
    "ORDER": 1
  },
  {
    "ID": "202",
    "PARENT_ID": "200",
    "LABEL": "Sử dụng giường bệnh",
    "LINK": "/app/reports/bed-usage",
    "ICON": "fas fa-bed",
    "PERMISSION": "report.bed_usage.view",
    "PERMISSIONS": [
      "report.bed_usage.view",
      "report.bed_usage.export",
      "report.bed_usage.print"
    ],
    "ORDER": 2
  },
  {
    "ID": "300",
    "PARENT_ID": "0",
    "LABEL": "Quản lý Thiết bị (Mock)",
    "LINK": null,
    "ICON": "fas fa-toolbox",
    "PERMISSION": "equipment.view",
    "PERMISSIONS": [
      "equipment.view",
      "equipment.catalog.view" // Added this so parent is visible
    ],
    "ORDER": 3
  },
  {
    "ID": "301",
    "PARENT_ID": "300",
    "LABEL": "Danh mục thiết bị",
    "LINK": "/app/equipment/catalog",
    "ICON": "fas fa-list-ol",
    "PERMISSION": "equipment.catalog.view",
    "PERMISSIONS": [
      "equipment.catalog.view",
      "equipment.catalog.create",
      "equipment.catalog.update",
      "equipment.catalog.delete"
    ],
    "ORDER": 1
  }
];