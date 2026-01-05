// Base interface for CLS statistics (shared between Level 3 and Level 6)
export interface ClsStat {
  NGAY_TH: string;
  NHOM_DICH_VU: string;
  PHONG_BAN_TH: string;
  SO_LUONG: number;
  SO_LUONG_NV: number;
  KHAM_CLS: number;
  // Display fields added during processing
  NGAY_TH_DISPLAY?: string;
  TYPE_LABEL?: string;
}

// Keep these as type aliases for backwards compatibility
export type ClsLevel3Stat = ClsStat;
export type ClsLevel6Stat = ClsStat;
export type ClsLevel12Stat = ClsStat;
export type ClsLevelB1Stat = ClsStat;
