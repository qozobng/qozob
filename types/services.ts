import type { VehicleTier } from '@/lib/vehicles';

export type ServiceCategory = 
  | 'papers_renewal' 
  | 'new_registration' 
  | 'auto_insurance' 
  | 'gps_tracker' 
  | 'fleet_solution';

export type ServiceStatus = 
  | 'pending' 
  | 'contacted' 
  | 'quoted' 
  | 'in_progress' 
  | 'completed' 
  | 'cancelled';

export type PaymentStatus = 
  | 'unpaid' 
  | 'partially_paid' 
  | 'paid' 
  | 'voucher_used';

export type TierPriceEntry = {
  private?: number | null;
  commercial?: number | null;
};

export type TierPriceMap = Partial<Record<VehicleTier, TierPriceEntry>>;

export interface ServiceRequest {
  id: string;
  user_id?: string | null;
  service_category: ServiceCategory;
  service_name: string;
  full_name: string;
  phone: string;
  email: string;
  state?: string | null;
  lga?: string | null;
  delivery_address?: string | null;
  vehicle_make?: string | null;
  vehicle_model?: string | null;
  vehicle_year?: string | null;
  plate_number?: string | null;
  chassis_number?: string | null;
  details?: Record<string, unknown>;
  status: ServiceStatus;
  estimated_price?: number | null;
  quoted_price?: number | null;
  paid_price?: number | null;
  payment_status: PaymentStatus;
  voucher_code?: string | null;
  admin_notes?: string | null;
  assigned_to?: string | null;
  /** Partner company handling it (20261106) */
  partner_id?: string | null;
  partner_assigned_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface UserVehicle {
  id: string;
  user_id: string;
  plate_number: string;
  vehicle_make?: string | null;
  vehicle_model?: string | null;
  vehicle_year?: string | null;
  color?: string | null;
  /** 20261107: body type, engine/body pricing tier, and private/commercial use */
  vehicle_type?: string | null;
  vehicle_tier?: VehicleTier | null;
  vehicle_usage?: 'private' | 'commercial' | null;
  insurance_type?: 'third_party' | 'comprehensive' | 'none';
  insurance_expiry?: string | null;
  license_expiry?: string | null;
  roadworthiness_expiry?: string | null;
  poc_expiry?: string | null;
  hackney_expiry?: string | null;
  reminder_enabled?: boolean;
  last_reminder_sent_at?: string | null;
  last_reminder_milestone?: string | null;
  has_tracker: boolean;
  tracker_installed_at?: string | null;
  notes?: string | null;
  created_at: string;
  updated_at: string;
}

export type DocumentType =
  | 'insurance'
  | 'vehicle_license'
  | 'roadworthiness'
  | 'proof_of_ownership'
  | 'hackney_permit'
  | 'cmris'
  | 'custom_plate'
  | 'drivers_license'
  | 'learners_permit'
  | 'tinted_permit'
  | 'haulage_permit'
  | 'other';

export const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  insurance: 'Auto Insurance Certificate (NIID)',
  vehicle_license: 'Vehicle License',
  roadworthiness: 'Roadworthiness Certificate',
  proof_of_ownership: 'Proof of Ownership (POC)',
  hackney_permit: 'Hackney / LG Permit',
  haulage_permit: 'Heavy-Duty / Haulage Permit',
  cmris: 'Police CMRIS Certificate',
  tinted_permit: 'NPF Tinted Glass Permit',
  drivers_license: 'Driver’s License',
  learners_permit: 'FRSC Learner’s Permit',
  custom_plate: 'Plate Allocation Certificate',
  other: 'Other Vehicle Document',
};

export interface VehicleDocument {
  id: string;
  user_id: string;
  vehicle_id?: string | null;
  service_request_id?: string | null;
  doc_type: DocumentType;
  title: string;
  file_url: string;
  reference_number?: string | null;
  issued_date?: string | null;
  expiry_date?: string | null;
  uploaded_by_role: 'user' | 'admin' | 'partner';
  created_at: string;
}

export type FuelLogType = 'vehicle' | 'generator';
export type FuelType = 'pms' | 'ago' | 'dpk' | 'cng' | 'lpg';

export interface FuelLog {
  id: string;
  user_id: string;
  vehicle_id?: string | null;
  log_type: FuelLogType;
  label?: string | null;
  fuel_type: FuelType;
  station_id?: string | null;
  station_name?: string | null;
  price_per_litre: number;
  litres_bought: number;
  total_amount: number;
  odometer_km?: number | null;
  engine_hours?: number | null;
  receipt_url?: string | null;
  notes?: string | null;
  logged_at: string;
  created_at: string;
}

export interface ServicePriceItem {
  id: string;
  title: string;
  category: ServiceCategory;
  privatePrice: number;
  commercialPrice?: number;
  tierPrices?: TierPriceMap;
  ratePercent?: number | null;
  minPrice?: number | null;
  description: string;
  statutory: boolean;
  turnaroundDays: string;
}

export const AUTO_SERVICE_CATALOG: ServicePriceItem[] = [
  {
    id: 'insurance_3rd_party',
    title: 'Third-Party Auto Insurance (NIID Validated)',
    category: 'auto_insurance',
    privatePrice: 15000,
    commercialPrice: 25000,
    tierPrices: {
      saloon_small: { private: 15000, commercial: 20000 },
      saloon_large: { private: 15000, commercial: 20000 },
      suv_pickup: { private: 15000, commercial: 25000 },
      bus: { private: 20000, commercial: 25000 },
      truck: { private: 100000, commercial: 100000 },
      motorcycle: { private: 3000, commercial: 5000 },
    },
    description: 'Mandatory statutory cover registered directly on the Nigerian Insurance Industry Database (NIID). Immediate digital certificate + police proof.',
    statutory: true,
    turnaroundDays: 'Instant (15 mins)'
  },
  {
    id: 'comprehensive_insurance',
    title: 'Comprehensive Auto Insurance (Full Cover + Flood, Fire & Theft)',
    category: 'auto_insurance',
    privatePrice: 45000,
    commercialPrice: 65000,
    ratePercent: 3.5,
    minPrice: 45000,
    description: 'Full-value NAICOM/NIID-registered motor insurance covering accidental collision damage, vehicle theft, fire, flood extension, and up to ₦3,000,000 third-party liability.',
    statutory: false,
    turnaroundDays: '24 hours'
  },
  {
    id: 'vehicle_license',
    title: 'Vehicle License Renewal',
    category: 'papers_renewal',
    privatePrice: 4500,
    commercialPrice: 6500,
    tierPrices: {
      saloon_small: { private: 4500, commercial: 6500 },
      saloon_large: { private: 5500, commercial: 7500 },
      suv_pickup: { private: 6500, commercial: 9000 },
      bus: { private: 8500, commercial: 11500 },
      truck: { private: 18000, commercial: 25000 },
      motorcycle: { private: 2500, commercial: 3500 },
    },
    description: 'Official annual State Vehicle License paper renewal with barcode verification (tiered by engine capacity / body type).',
    statutory: true,
    turnaroundDays: '24–48 hours'
  },
  {
    id: 'proof_of_ownership',
    title: 'Annual Proof of Ownership Certificate (POC) Renewal',
    category: 'papers_renewal',
    privatePrice: 3000,
    commercialPrice: 3500,
    tierPrices: {
      saloon_small: { private: 3000, commercial: 3500 },
      saloon_large: { private: 3000, commercial: 3500 },
      suv_pickup: { private: 3000, commercial: 4000 },
      bus: { private: 3500, commercial: 4500 },
      truck: { private: 5000, commercial: 6000 },
      motorcycle: { private: 2000, commercial: 2500 },
    },
    description: 'Mandatory Joint Tax Board (JTB) annual Proof of Ownership Certificate renewal verifying legal title on the national database.',
    statutory: true,
    turnaroundDays: '24–48 hours'
  },
  {
    id: 'roadworthiness',
    title: 'Roadworthiness Certificate (LACVIS / State)',
    category: 'papers_renewal',
    privatePrice: 6500,
    commercialPrice: 8500,
    tierPrices: {
      saloon_small: { private: 6500, commercial: 8500 },
      saloon_large: { private: 7500, commercial: 9500 },
      suv_pickup: { private: 8500, commercial: 11000 },
      bus: { private: 10500, commercial: 14000 },
      truck: { private: 22000, commercial: 28000 },
      motorcycle: { private: 3000, commercial: 4000 },
    },
    description: 'State computerised inspection & roadworthiness compliance certificate.',
    statutory: true,
    turnaroundDays: '24–48 hours'
  },
  {
    id: 'hackney_permit',
    title: 'Hackney Permit / Local Government Emblem',
    category: 'papers_renewal',
    privatePrice: 0,
    commercialPrice: 6000,
    tierPrices: {
      saloon_small: { private: 0, commercial: 6000 },
      saloon_large: { private: 0, commercial: 6000 },
      suv_pickup: { private: 0, commercial: 7500 },
      bus: { private: 0, commercial: 9500 },
      truck: { private: 0, commercial: 18000 },
      motorcycle: { private: 0, commercial: 3500 },
    },
    description: 'Statutory commercial transit and local government carriage sticker for business vehicles.',
    statutory: true,
    turnaroundDays: '24–48 hours'
  },
  {
    id: 'heavy_duty_haulage_permit',
    title: 'Commercial Haulage & Heavy-Duty Vehicle Permit',
    category: 'papers_renewal',
    privatePrice: 0,
    commercialPrice: 25000,
    tierPrices: {
      saloon_small: { private: 0, commercial: 12000 },
      saloon_large: { private: 0, commercial: 12000 },
      suv_pickup: { private: 0, commercial: 18000 },
      bus: { private: 18000, commercial: 22000 },
      truck: { private: 35000, commercial: 45000 },
      motorcycle: { private: 0, commercial: 8000 },
    },
    description: 'Unified state haulage, heavy-duty carriage, environmental mobile emission & inter-state transit permit for buses, coasters, trucks, and tankers.',
    statutory: true,
    turnaroundDays: '24–48 hours'
  },
  {
    id: 'dispatch_rider_permit',
    title: 'Dispatch Rider Card & Commercial Motorcycle Permit',
    category: 'papers_renewal',
    privatePrice: 15000,
    commercialPrice: 15000,
    tierPrices: {
      motorcycle: { private: 15000, commercial: 15000 },
    },
    description: 'Statutory State Rider’s Card, MOT / courier carriage emblem, and local government permit for dispatch bikes and commercial tricycles (Keke).',
    statutory: true,
    turnaroundDays: '48–72 hours'
  },
  {
    id: 'cmris_police',
    title: 'Police CMRIS Digital Registration',
    category: 'papers_renewal',
    privatePrice: 7500,
    commercialPrice: 7500,
    description: 'Official Nigeria Police Force Central Motor Registry Information System registration.',
    statutory: true,
    turnaroundDays: '24 hours'
  },
  {
    id: 'tinted_glass_permit',
    title: 'Police Tinted Glass Permit (NPF Digital Biometric)',
    category: 'papers_renewal',
    privatePrice: 35000,
    commercialPrice: 35000,
    description: 'Official Nigeria Police Force (NPF POSSAP) tinted-window permit processing with QR verification slip.',
    statutory: true,
    turnaroundDays: '3–5 working days'
  },
  {
    id: 'learners_permit',
    title: 'FRSC Learner’s Permit (3 Months + Official L-Plate)',
    category: 'papers_renewal',
    privatePrice: 6500,
    commercialPrice: 6500,
    description: 'Official Federal Road Safety Corps (FRSC) 3-month learner’s driving permit and highway code pack for new drivers.',
    statutory: true,
    turnaroundDays: '24–48 hours'
  },
  {
    id: 'drivers_license_renewal',
    title: 'Nigerian Driver’s License Renewal / Re-issue (3 or 5 Years)',
    category: 'papers_renewal',
    privatePrice: 28000,
    commercialPrice: 28000,
    description: 'Fast-track FRSC Driver’s License renewal or lost/damaged license replacement with instant temporary slip and DLC capture support.',
    statutory: true,
    turnaroundDays: '3–7 working days'
  },
  {
    id: 'change_ownership',
    title: 'Change of Vehicle Ownership',
    category: 'new_registration',
    privatePrice: 25000,
    commercialPrice: 30000,
    description: 'Complete transfer of title, police report, court affidavit, and updated Proof of Ownership Certificate.',
    statutory: true,
    turnaroundDays: '3–5 working days'
  },
  {
    id: 'new_plate_number',
    title: 'New Vehicle Registration & Plate Numbers',
    category: 'new_registration',
    privatePrice: 48000,
    commercialPrice: 58000,
    tierPrices: {
      saloon_small: { private: 48000, commercial: 58000 },
      saloon_large: { private: 52000, commercial: 62000 },
      suv_pickup: { private: 56000, commercial: 66000 },
      bus: { private: 65000, commercial: 75000 },
      truck: { private: 95000, commercial: 115000 },
      motorcycle: { private: 28000, commercial: 32000 },
    },
    description: 'Brand new state plate number allocation, vehicle license, proof of ownership, and roadworthiness pack.',
    statutory: true,
    turnaroundDays: '3–5 working days'
  },
  {
    id: 'custom_plate_number',
    title: 'Customised / Fancy Plate Number (JTB / FRSC Official)',
    category: 'new_registration',
    privatePrice: 250000,
    commercialPrice: 250000,
    description: 'Personalised Joint Tax Board (JTB) & FRSC custom vehicle number plate (up to 8 characters, e.g. ODOGWU-1) with Proof of Ownership and allocation certificate.',
    statutory: false,
    turnaroundDays: '2–4 weeks'
  },
  {
    id: 'plate_replacement',
    title: 'Lost or Damaged Number Plate Replacement',
    category: 'new_registration',
    privatePrice: 38000,
    commercialPrice: 42000,
    description: 'Official FRSC replacement of lost, stolen, or defaced vehicle number plates, including police extract and court affidavit processing.',
    statutory: true,
    turnaroundDays: '5–10 working days'
  },
  {
    id: 'gps_tracker_4g',
    title: '4G Live GPS Tracker & Remote Engine Immobilizer',
    category: 'gps_tracker',
    privatePrice: 55000,
    commercialPrice: 55000,
    description: 'Live mobile phone GPS tracking, remote SMS/App fuel pump shut-off, anti-theft SOS alerts, 1-year data SIM included, plus doorstep technician installation.',
    statutory: false,
    turnaroundDays: 'Same-day or next-day install'
  }
];
