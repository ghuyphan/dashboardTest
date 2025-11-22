export interface MedicalRecordSummary {
  MA_BS: string;
  TEN_BS: string;
  SO_LUONG: number;
}

export interface MedicalRecordDetail {
  MAYTE: string;
  TEN_BENH_NHAN: string;
  NGAY_KHAM: string; // ISO string
  DICH_VU: string;
  CHUYEN_KHOA: string;
  MA_BS: string;
  TEN_BS: string;
  TEN_PHONG_KHAM: string;
  THOI_GIAN_KHAM: string; // ISO string
  TRANG_THAI_BA: number;
  TIEPNHAN_ID: number;
}