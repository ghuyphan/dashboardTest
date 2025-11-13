export interface Device {
  Id?: number;
  Ma: string;
  Ten: string;
  SerialNumber?: string | null;
  Model?: string | null;
  LoaiThietBi_Id: number;       
  TrangThai_Id: number;       
  ViTri?: string | null;
  NgayMua?: string | null;     
  GiaMua?: number | null;
  NgayHetHanBH?: string | null; 
  MoTa?: string | null;
  DeviceName?: string | null;

  TenLoaiThietBi?: string | null;
  TrangThai_Ten?: string | null;
  NguoiTao?: string | null;   
  NgayTao?: string | null;   

  // Optional audit fields (if needed)
  DATE_?: string;
  USER_?: number;
  HL?: number;
}