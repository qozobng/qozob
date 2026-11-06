// =========================================================================
// VEHICLE REFERENCE DATA
// Pick-lists for vehicle forms (garage, services, fuel logbook) so people
// choose from fixed options instead of typing: vehicle type → make → model,
// year and colour. Models carry a body type, so choosing a type narrows the
// makes and models, and choosing a model fills in the type.
// Makes and models are the ones common on Nigerian roads; anything missing
// can still be entered with "Other (not listed)".
// =========================================================================

export type VehicleType = 'saloon' | 'suv' | 'pickup' | 'minivan' | 'bus' | 'truck' | 'motorcycle' | 'tricycle';

export const VEHICLE_TYPES: { key: VehicleType; label: string }[] = [
  { key: 'saloon', label: 'Saloon / Hatchback' },
  { key: 'suv', label: 'SUV / Crossover' },
  { key: 'pickup', label: 'Pickup' },
  { key: 'minivan', label: 'Minivan / MPV' },
  { key: 'bus', label: 'Bus' },
  { key: 'truck', label: 'Truck / Lorry' },
  { key: 'motorcycle', label: 'Motorcycle' },
  { key: 'tricycle', label: 'Tricycle (Keke)' },
];

export const vehicleTypeLabel = (k: string | null | undefined) => VEHICLE_TYPES.find(t => t.key === k)?.label ?? '';

/** Value used in selects for "not in the list" (shows a short text box). */
export const OTHER = '__other__';

type M = [model: string, type: VehicleType];
const s = 'saloon', u = 'suv', p = 'pickup', v = 'minivan', b = 'bus', t = 'truck', m = 'motorcycle', k = 'tricycle';

/** Make → models (with body type). Order inside a make doesn't matter; lists are sorted for display. */
export const VEHICLE_MODELS: Record<string, M[]> = {
  Toyota: [
    ['Corolla', s], ['Camry', s], ['Avalon', s], ['Yaris', s], ['Matrix', s], ['Avensis', s], ['Solara', s],
    ['RAV4', u], ['Highlander', u], ['Venza', u], ['4Runner', u], ['Land Cruiser', u], ['Land Cruiser Prado', u],
    ['Sequoia', u], ['FJ Cruiser', u], ['Fortuner', u], ['C-HR', u], ['Sienna', v], ['Previa', v],
    ['Hilux', p], ['Tacoma', p], ['Tundra', p], ['Hiace', b], ['Coaster', b], ['Dyna', t],
  ],
  Honda: [
    ['Accord', s], ['Civic', s], ['City', s], ['Crosstour', u], ['CR-V', u], ['HR-V', u], ['Pilot', u],
    ['Passport', u], ['Element', u], ['Odyssey', v], ['Ridgeline', p],
  ],
  Lexus: [
    ['ES', s], ['IS', s], ['GS', s], ['LS', s], ['RX', u], ['GX', u], ['LX', u], ['NX', u], ['UX', u],
  ],
  Hyundai: [
    ['Elantra', s], ['Sonata', s], ['Accent', s], ['Azera', s], ['i10', s], ['i20', s],
    ['Tucson', u], ['Santa Fe', u], ['Creta', u], ['Kona', u], ['Palisade', u], ['H-1', v], ['H100', t],
  ],
  Kia: [
    ['Rio', s], ['Cerato', s], ['Optima', s], ['K5', s], ['Picanto', s], ['Soul', s],
    ['Sportage', u], ['Sorento', u], ['Seltos', u], ['Telluride', u], ['Carnival', v], ['K2700', t],
  ],
  Nissan: [
    ['Altima', s], ['Sentra', s], ['Almera', s], ['Maxima', s], ['Sunny', s],
    ['Rogue', u], ['X-Trail', u], ['Murano', u], ['Pathfinder', u], ['Armada', u], ['Patrol', u], ['Juke', u],
    ['Kicks', u], ['Qashqai', u], ['Quest', v], ['Navara', p], ['Frontier', p], ['Hardbody', p], ['Urvan', b], ['Civilian', b],
  ],
  'Mercedes-Benz': [
    ['A-Class', s], ['C-Class', s], ['E-Class', s], ['S-Class', s], ['CLA', s],
    ['GLA', u], ['GLC', u], ['GLE', u], ['GLK', u], ['ML-Class', u], ['GL-Class', u], ['GLS', u], ['G-Class', u],
    ['Sprinter', b], ['Actros', t], ['Axor', t],
  ],
  Ford: [
    ['Focus', s], ['Fusion', s], ['Fiesta', s], ['Mustang', s], ['Escape', u], ['Edge', u], ['Explorer', u],
    ['Expedition', u], ['EcoSport', u], ['Ranger', p], ['F-150', p], ['Transit', b],
  ],
  Peugeot: [
    ['301', s], ['406', s], ['407', s], ['504', s], ['508', s], ['2008', u], ['3008', u], ['5008', u],
    ['Partner', v], ['Landtrek', p], ['Boxer', b],
  ],
  Volkswagen: [
    ['Golf', s], ['Jetta', s], ['Passat', s], ['Polo', s], ['Beetle', s], ['Tiguan', u], ['Touareg', u], ['Atlas', u],
    ['Sharan', v], ['Amarok', p], ['Transporter', b],
  ],
  Mitsubishi: [
    ['Lancer', s], ['Galant', s], ['Outlander', u], ['Pajero', u], ['Montero', u], ['ASX', u], ['Eclipse Cross', u],
    ['L200', p], ['Rosa', b], ['Canter', t],
  ],
  Mazda: [
    ['Mazda3', s], ['Mazda6', s], ['626', s], ['CX-3', u], ['CX-5', u], ['CX-7', u], ['CX-9', u], ['MPV', v], ['BT-50', p],
  ],
  BMW: [
    ['3 Series', s], ['5 Series', s], ['7 Series', s], ['X1', u], ['X3', u], ['X5', u], ['X6', u], ['X7', u],
  ],
  Audi: [
    ['A3', s], ['A4', s], ['A6', s], ['A8', s], ['Q3', u], ['Q5', u], ['Q7', u], ['Q8', u],
  ],
  Acura: [
    ['TL', s], ['TLX', s], ['ILX', s], ['RL', s], ['MDX', u], ['RDX', u], ['ZDX', u],
  ],
  Infiniti: [
    ['G35', s], ['Q50', s], ['Q70', s], ['FX35', u], ['JX35', u], ['QX50', u], ['QX56', u], ['QX60', u], ['QX80', u],
  ],
  'Land Rover': [
    ['Range Rover', u], ['Range Rover Sport', u], ['Range Rover Evoque', u], ['Range Rover Velar', u],
    ['Discovery', u], ['Discovery Sport', u], ['Defender', u], ['LR4', u],
  ],
  Jeep: [
    ['Wrangler', u], ['Grand Cherokee', u], ['Cherokee', u], ['Compass', u], ['Renegade', u], ['Gladiator', p],
  ],
  Chevrolet: [
    ['Cruze', s], ['Malibu', s], ['Spark', s], ['Aveo', s], ['Captiva', u], ['Equinox', u], ['Tahoe', u],
    ['Traverse', u], ['Trailblazer', u], ['Silverado', p], ['Colorado', p], ['Express', b],
  ],
  Dodge: [
    ['Charger', s], ['Challenger', s], ['Durango', u], ['Journey', u], ['Grand Caravan', v],
  ],
  Suzuki: [
    ['Swift', s], ['Dzire', s], ['Ciaz', s], ['Alto', s], ['S-Presso', s], ['Vitara', u], ['Grand Vitara', u], ['Jimny', u],
    ['Ertiga', v], ['Carry', t],
  ],
  Volvo: [
    ['S60', s], ['S80', s], ['XC60', u], ['XC90', u], ['FH', t], ['FM', t],
  ],
  Porsche: [['Panamera', s], ['Cayenne', u], ['Macan', u]],
  Opel: [['Astra', s], ['Vectra', s], ['Corsa', s]],
  Renault: [['Logan', s], ['Duster', u], ['Koleos', u], ['Master', b]],
  Isuzu: [['MU-X', u], ['Trooper', u], ['D-Max', p], ['NPR', t], ['NQR', t]],
  'Innoson (IVM)': [['Fox', s], ['Umu', u], ['G5', u], ['G40', u], ['G80', u], ['Carrier', p], ['Connect', b]],
  GAC: [['GA4', s], ['GS3', u], ['GS4', u], ['GS8', u]],
  Geely: [['Emgrand', s], ['Coolray', u], ['Azkarra', u], ['Okavango', u]],
  Changan: [['Alsvin', s], ['Eado', s], ['CS35', u], ['CS55', u], ['CS75', u], ['CS95', u], ['Hunter', p]],
  Chery: [['Arrizo', s], ['Tiggo 2', u], ['Tiggo 4', u], ['Tiggo 7', u], ['Tiggo 8', u]],
  JAC: [['J7', s], ['S2', u], ['S3', u], ['T6', p], ['T8', p], ['Sunray', b]],
  Foton: [['Tunland', p], ['View', b], ['Auman', t]],
  Iveco: [['Daily', b], ['Trakker', t]],
  Sinotruk: [['Howo', t]],
  MAN: [['TGA', t], ['TGS', t]],
  DAF: [['CF', t], ['XF', t]],
  'Mack': [['Granite', t]],
  Bajaj: [['Boxer', m], ['Pulsar', m], ['Discover', m], ['RE (Keke)', k]],
  TVS: [['Apache', m], ['HLX', m], ['Star', m], ['King (Keke)', k]],
  Yamaha: [['Crypton', m], ['YBR 125', m], ['Fazer', m]],
  Piaggio: [['Ape', k]],
};

/** Most-chosen makes first in lists. */
export const POPULAR_MAKES = ['Toyota', 'Honda', 'Lexus', 'Hyundai', 'Kia', 'Nissan', 'Mercedes-Benz', 'Ford'];

export const VEHICLE_MAKES = Object.keys(VEHICLE_MODELS).sort((a, b) => a.localeCompare(b));

export const isKnownMake = (make: string) => Object.prototype.hasOwnProperty.call(VEHICLE_MODELS, make);

/** Makes that build at least one model of this type (all makes when no type). */
export function makesFor(type: VehicleType | '' | null | undefined): string[] {
  if (!type) return VEHICLE_MAKES;
  return VEHICLE_MAKES.filter(mk => VEHICLE_MODELS[mk].some(([, ty]) => ty === type));
}

/** Models of a make, narrowed to a type when given, A→Z. */
export function modelsFor(make: string, type?: VehicleType | '' | null): string[] {
  const list = VEHICLE_MODELS[make] ?? [];
  return list.filter(([, ty]) => !type || ty === type).map(([md]) => md).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

/** Body type of a known make + model (null when unknown). */
export function typeOfModel(make: string, model: string): VehicleType | null {
  return VEHICLE_MODELS[make]?.find(([md]) => md === model)?.[1] ?? null;
}

/** Years from next year back to 1980 (newest first). */
export function vehicleYears(from = 1980): string[] {
  const top = new Date().getFullYear() + 1;
  const out: string[] = [];
  for (let y = top; y >= from; y--) out.push(String(y));
  return out;
}

export const VEHICLE_COLOURS = [
  'Black', 'White', 'Silver', 'Grey', 'Blue', 'Red', 'Green', 'Gold', 'Beige', 'Brown', 'Wine / Maroon',
  'Orange', 'Yellow', 'Purple', 'Other',
] as const;

/** Nigerian plate: three letters, 3 digits, two letters (e.g. ABC-123-XY). Old/custom plates are still allowed. */
export function formatPlate(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 12);
}

// =========================================================================
// ENGINE-CAPACITY / BODY-TYPE PRICING TIERS (CarPaddy+ statutory bands)
// =========================================================================
export type VehicleTier =
  | 'saloon_small'
  | 'saloon_large'
  | 'suv_pickup'
  | 'bus'
  | 'truck'
  | 'motorcycle';

export const VEHICLE_TIERS: { key: VehicleTier; label: string; short: string }[] = [
  { key: 'saloon_small', label: 'Saloon / Hatchback (≤ 1.6L – 1.8L · e.g. Corolla, Yaris, Civic, Rio)', short: 'Saloon ≤ 1.8L' },
  { key: 'saloon_large', label: 'Saloon / Executive Sedan (2.0L – 3.5L+ · e.g. Camry, Accord, ES350, C-Class)', short: 'Saloon 2.0L+' },
  { key: 'suv_pickup', label: 'SUV / Jeep / Pickup / Space Bus (e.g. Highlander, RX350, Prado, Hilux, Sienna)', short: 'SUV / Pickup / MPV' },
  { key: 'bus', label: 'Mini-Bus / Coaster / Commuter Bus (e.g. Hiace, Urvan, Coaster, Sprinter)', short: 'Bus / Coaster' },
  { key: 'truck', label: 'Heavy-Duty Truck / Tanker / Lorry (e.g. Mack, Sinotruk Howo, Actros, DAF)', short: 'Heavy-Duty Truck' },
  { key: 'motorcycle', label: 'Motorcycle / Dispatch Bike / Tricycle (Keke)', short: 'Motorcycle / Keke' },
];

export const vehicleTierLabel = (k: string | null | undefined, short = false): string => {
  const found = VEHICLE_TIERS.find(t => t.key === k);
  return found ? (short ? found.short : found.label) : '';
};

const LARGE_SALOONS = new Set([
  'Camry', 'Avalon', 'Avensis', 'Solara',
  'Accord',
  'ES', 'IS', 'GS', 'LS',
  'Sonata', 'Azera',
  'Optima', 'K5',
  'Altima', 'Maxima',
  'C-Class', 'E-Class', 'S-Class', 'CLA',
  'Fusion', 'Mustang',
  '406', '407', '504', '508',
  'Passat',
  'Galant',
  'Mazda6', '626',
  '3 Series', '5 Series', '7 Series',
  'A4', 'A6', 'A8',
  'TL', 'TLX', 'RL',
  'G35', 'Q50', 'Q70',
  'Malibu',
  'Charger', 'Challenger',
  'S60', 'S80',
  'Panamera',
  'Vectra',
]);

/** Automatically determines the statutory pricing tier from the selected vehicle body type / model. */
export function inferVehicleTier(
  type?: VehicleType | '' | null,
  make?: string | null,
  model?: string | null,
): VehicleTier {
  const md = (model || '').trim();
  const mk = (make || '').trim();
  const resolvedType = type || (mk && md ? typeOfModel(mk, md) : null) || 'saloon';

  if (resolvedType === 'motorcycle' || resolvedType === 'tricycle') return 'motorcycle';
  if (resolvedType === 'truck') return 'truck';
  if (resolvedType === 'bus') return 'bus';
  if (resolvedType === 'suv' || resolvedType === 'pickup' || resolvedType === 'minivan') return 'suv_pickup';
  if (md && LARGE_SALOONS.has(md)) return 'saloon_large';
  if (['Lexus', 'Mercedes-Benz', 'BMW', 'Audi', 'Infiniti', 'Acura', 'Volvo', 'Porsche'].includes(mk)) {
    return 'saloon_large';
  }
  return 'saloon_small';
}


