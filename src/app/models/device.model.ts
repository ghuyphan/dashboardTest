// src/app/models/device.model.ts
export interface Device {
  Id: number;
  Ma: string;
  Ten: string;
  SerialNumber?: string | null;
  Model?: string | null;
  LoaiThietBi_Id: number;       // Mapped from CategoryID
  TrangThai_Id: number;         // Mapped from TrangThai
  ViTri?: string | null;
  NgayMua?: string | null;      // ISO 8601 format (e.g., "2023-11-15T00:00:00")
  GiaMua?: number | null;
  NgayHetHanBH?: string | null; // ISO 8601 format
  MoTa?: string | null;
  DeviceName?: string | null;
  
  // Optional audit fields (if needed)
  DATE_?: string;
  USER_?: number;
  HL?: number;
}