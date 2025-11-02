// These are copies from auth.service.ts
export interface LoginResponse {
  MaKetQua: number;
  TenKetQua?: string;
  ErrorMessage?: string;
  APIKey: {
    access_token: string;
    id_token?: string;
    date_token?: string;
    expires_in?: string;
    token_type?: string;
  };
  UserInfo: {
    id_user: string;
    user_name: string;
    ten_nhan_vien: string;
    nhom_chuc_danh: string;
  };
}

export interface ApiPermissionNode {
  ID: string;
  PARENT_ID: string;
  LABEL: string;
  LINK: string | null;
  ICON: string;
  PERMISSION: string;
  PERMISSIONS: string[];
  ORDER: number;
}