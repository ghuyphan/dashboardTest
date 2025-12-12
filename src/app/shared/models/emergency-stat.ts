export interface EmergencyStat {
  NGAY_TIEP_NHAN: string; // ISO Date String
  THU_TUAN?: string;
  TUAN_NAM?: number;
  THANG?: number;
  NAM?: number;
  QUY?: number;

  // Metrics
  LUOT_CC: number; // Total Emergency Visits
  BENH_CU: number; // Old Patients
  BENH_MOI: number; // New Patients
  BHYT: number; // Insurance
  VIEN_PHI: number; // Service/Fee
  CHUYEN_VIEN: number; // Transfers (Image 2 reference)
  NHAP_VIEN: number; // Admissions (Image 3 reference)

  // Optional UI helper
  NGAY_TIEP_NHAN_DISPLAY?: string;
}
