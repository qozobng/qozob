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
  details?: Record<string, any>;
  status: ServiceStatus;
  estimated_price?: number | null;
  quoted_price?: number | null;
  paid_price?: number | null;
  payment_status: PaymentStatus;
  voucher_code?: string | null;
  admin_notes?: string | null;
  assigned_to?: string | null;
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
  insurance_type?: 'third_party' | 'comprehensive' | 'none';
  insurance_expiry?: string | null;
  license_expiry?: string | null;
  roadworthiness_expiry?: string | null;
  has_tracker: boolean;
  tracker_installed_at?: string | null;
  notes?: string | null;
  created_at: string;
  updated_at: string;
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
    description: 'Mandatory statutory cover registered directly on the Nigerian Insurance Industry Database (NIID). Immediate digital certificate + police proof.',
    statutory: true,
    turnaroundDays: 'Instant (15 mins)'
  },
  {
    id: 'vehicle_license',
    title: 'Vehicle License Renewal',
    category: 'papers_renewal',
    privatePrice: 4500,
    commercialPrice: 6500,
    description: 'Official annual State Vehicle License paper renewal with barcode verification.',
    statutory: true,
    turnaroundDays: '24–48 hours'
  },
  {
    id: 'roadworthiness',
    title: 'Roadworthiness Certificate (LACVIS / State)',
    category: 'papers_renewal',
    privatePrice: 6500,
    commercialPrice: 8500,
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
    description: 'Statutory commercial transit and local government carriage sticker for business vehicles.',
    statutory: true,
    turnaroundDays: '24–48 hours'
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
    description: 'Brand new state plate number allocation, vehicle license, proof of ownership, and roadworthiness pack.',
    statutory: true,
    turnaroundDays: '3–5 working days'
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

