import React, { useState, useRef, useEffect } from 'react';
import { VehicleType, Trip, UtilityBill, CustomVehicle } from '../services/types';
import { predictEmissionFactor, verifyBillImage, lookupVehicleByPlate, verifyOdometerImage } from '../services/geminiService';

// Haversine formula for distance calculation
const calculateHaversineDistance = (
  coord1: { lat: number; lng: number },
  coord2: { lat: number; lng: number }
): number => {
  const R = 6371; // Earth's radius in kilometers
  const toRad = (degrees: number) => (degrees * Math.PI) / 180;
  const dLat = toRad(coord2.lat - coord1.lat);
  const dLng = toRad(coord2.lng - coord1.lng);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(coord1.lat)) *
    Math.cos(toRad(coord2.lat)) *
    Math.sin(dLng / 2) *
    Math.sin(dLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

const BASELINE_WARNING_THRESHOLD = 0.1;
const CEA_GRID_KG_CO2_PER_KWH = 0.710; // CEA CO2 Baseline Database (update annually when new version is released)
const ROUTE_MATCHING_MAX_POINTS = 100;
const ROUTE_MATCHING_MIN_STEP_METERS = 10;
const ROUTE_MATCHING_MIN_STEP_MS = 4000;
const DEFAULT_EV_KWH_PER_KM = {
  car: 0.12,
  bus: 1.2,
  scooter: 0.025,
  motorcycle: 0.03
};
// Government of India Gazette (S.O. 1072(E), 23-Apr-2015) — CAFC Phase II (FY 2022-23 onward)
// Table 1.2 gives petrol-equivalent L/100 km at W = 1145 kg: 4.7694
// Fuel consumption ↔ CO2 conversion factors and petrol-equivalent multipliers are also defined in the same notification.
const CAFC_PHASE_II_PETROL_EQ_L_PER_100KM = 4.7694;
const CAFC_CO2_TO_FC_FACTOR = {
  petrol: 0.04217,
  diesel: 0.03776,
  lpg: 0.0615,
  cng: 0.03647
} as const;
const CAFC_PETROL_EQ_MULTIPLIER = {
  petrol: 1,
  diesel: 1.1168,
  lpg: 0.6857,
  cng: 1.1563
} as const;

const cafcCo2KgPerKm = (fuel: keyof typeof CAFC_CO2_TO_FC_FACTOR) => {
  const co2GPerKm =
    CAFC_PHASE_II_PETROL_EQ_L_PER_100KM /
    (CAFC_CO2_TO_FC_FACTOR[fuel] * CAFC_PETROL_EQ_MULTIPLIER[fuel]);
  return Number((co2GPerKm / 1000).toFixed(3));
};

const CAFC_CAR_BASELINES = {
  gas: cafcCo2KgPerKm('petrol'),
  diesel: cafcCo2KgPerKm('diesel'),
  lpg: cafcCo2KgPerKm('lpg'),
  cng: cafcCo2KgPerKm('cng')
} as const;

const ESTIMATED_EV_BASELINES: Partial<Record<string, number>> = {
  car_electric: Number((CEA_GRID_KG_CO2_PER_KWH * DEFAULT_EV_KWH_PER_KM.car).toFixed(3)),
  bus_electric: Number((CEA_GRID_KG_CO2_PER_KWH * DEFAULT_EV_KWH_PER_KM.bus).toFixed(3)),
  scooter_electric: Number((CEA_GRID_KG_CO2_PER_KWH * DEFAULT_EV_KWH_PER_KM.scooter).toFixed(3)),
  motorcycle_electric: Number((CEA_GRID_KG_CO2_PER_KWH * DEFAULT_EV_KWH_PER_KM.motorcycle).toFixed(3))
};
const GOVERNMENT_BASELINES_KG_PER_KM: Partial<Record<string, number>> = {
  // India CAFC Phase II (FY 2022-23 onward) baselines derived from Govt. Gazette notification.
  // Note: CAFC is a fleet-average standard; using W=1145 kg (Table 1.2) yields a 4.7694 L/100km
  // petrol-equivalent target, converted to CO2 g/km using the official conversion factors.
  car_gas: CAFC_CAR_BASELINES.gas,
  car_diesel: CAFC_CAR_BASELINES.diesel,
  car_cng: CAFC_CAR_BASELINES.cng,
  car_lpg: CAFC_CAR_BASELINES.lpg,
  // India GHG Program: road transport (kg CO2/km or kg CO2/pax-km where noted)
  bus: 0.015161, // pax-km (intracity bus)
  scooter: 0.0368,
  motorcycle: 0.0356,
  // India GHG Program: rail passenger transport (kg CO2/pax-km)
  train: 0.00795,
  ...ESTIMATED_EV_BASELINES
};

const DEFAULT_BASELINES_KG_PER_KM: Partial<Record<string, number>> = {
  car: 0.192, // India GHG Program average 4-wheeler (0.2055 kg/km, conservative)
  bus: 0.015161,
  train: 0.00795,
  scooter: 0.0368,
  motorcycle: 0.0356,
  bicycle: 0,
  walking: 0
};

const CONDITION_MULTIPLIERS: Record<NonNullable<CustomVehicle['vehicleCondition']>, number> = {
  Good: 1,
  Average: 1.1,
  Poor: 1.25
};

const DRIVING_STYLE_MULTIPLIERS: Record<NonNullable<CustomVehicle['drivingStyle']>, number> = {
  Normal: 1,
  Aggressive: 1.2,
  Eco: 0.9
};

type TrackingPoint = { lat: number; lng: number; timestamp: number };

const normalizeKey = (value?: string) => value?.trim().toLowerCase() || '';

const normalizeFuelType = (value?: string) => {
  const key = normalizeKey(value);
  if (!key) return '';
  if (key === 'petrol' || key === 'gasoline') return 'gas';
  if (key === 'ev') return 'electric';
  return key;
};

const inferFuelTypeFromName = (name?: string) => {
  const key = normalizeKey(name);
  if (!key) return undefined;
  if (key.includes('electric') || key.includes('ev') || key.includes('e-bus') || key.includes('ebus'))
    return 'electric';
  if (key.includes('hybrid')) return 'hybrid';
  if (key.includes('diesel')) return 'diesel';
  if (key.includes('cng')) return 'cng';
  if (key.includes('lpg')) return 'lpg';
  if (key.includes('petrol') || key.includes('gasoline')) return 'gas';
  return undefined;
};

const normalizeVehicleType = (value?: string) => {
  const key = normalizeKey(value);
  if (!key) return '';
  if (
    key.includes('car') ||
    key.includes('sedan') ||
    key.includes('suv') ||
    key.includes('hatch') ||
    key.includes('coupe') ||
    key.includes('mpv') ||
    key.includes('crossover')
  )
    return 'car';
  if (key.includes('bus')) return 'bus';
  if (key.includes('train') || key.includes('rail') || key.includes('metro')) return 'train';
  if (key.includes('bicycle')) return 'bicycle';
  if (key.includes('cycle') && !key.includes('motor')) return 'bicycle';
  if (key.includes('scooter')) return 'scooter';
  if (key.includes('motor') || key.includes('bike')) return 'motorcycle';
  if (key.includes('walk')) return 'walking';
  return key;
};

const getGovernmentBaselineKgPerKm = (
  vehicleType?: string,
  fuelType?: CustomVehicle['fuelType']
) => {
  const vehicleKey = normalizeVehicleType(vehicleType);
  const fuelKey = normalizeFuelType(fuelType);
  if (!vehicleKey) return null;

  const combinedKey = fuelKey ? `${vehicleKey}_${fuelKey}` : vehicleKey;
  const baseline =
    GOVERNMENT_BASELINES_KG_PER_KM[combinedKey] ??
    GOVERNMENT_BASELINES_KG_PER_KM[vehicleKey] ??
    GOVERNMENT_BASELINES_KG_PER_KM[`${vehicleKey}_gas`] ??
    GOVERNMENT_BASELINES_KG_PER_KM[`${vehicleKey}_diesel`] ??
    GOVERNMENT_BASELINES_KG_PER_KM[`${vehicleKey}_electric`];

  if (typeof baseline !== 'number' || baseline <= 0) return null;
  return baseline;
};

const resolveTripMeta = (trip: Trip, customVehicles: CustomVehicle[]) => {
  let vehicleType = trip.vehicleType;
  let fuelType = trip.fuelType;
  let vehicleCondition = trip.vehicleCondition;
  let drivingStyle = trip.drivingStyle;
  let odometerKm = trip.odometerKm;

  if (trip.vehicle !== 'Custom') {
    vehicleType = vehicleType || trip.vehicle;
  } else {
    const match = customVehicles.find(
      (v) => v.name.toLowerCase() === (trip.customVehicleName || '').toLowerCase()
    );
    vehicleType = vehicleType || match?.vehicleType;
    fuelType = fuelType || match?.fuelType;
    vehicleCondition = vehicleCondition || match?.vehicleCondition;
    drivingStyle = drivingStyle || match?.drivingStyle;
    odometerKm = odometerKm ?? match?.odometerKm;
    if (!vehicleType && trip.customVehicleName) {
      vehicleType = trip.customVehicleName;
    }
    if (!fuelType && trip.customVehicleName) {
      fuelType = inferFuelTypeFromName(trip.customVehicleName);
    }
  }

  return { vehicleType, fuelType, vehicleCondition, drivingStyle, odometerKm };
};

const getConditionMultiplier = (condition?: CustomVehicle['vehicleCondition']) =>
  condition ? CONDITION_MULTIPLIERS[condition] : 1;

const getDrivingStyleMultiplier = (style?: CustomVehicle['drivingStyle']) =>
  style ? DRIVING_STYLE_MULTIPLIERS[style] : 1;

const getFallbackBaselineKgPerKm = (
  trip: Trip,
  customVehicles: CustomVehicle[],
  vehicleType?: string
) => {
  if (trip.vehicle === 'Custom' && trip.customVehicleName) {
    const match = customVehicles.find(
      (v) => v.name.toLowerCase() === trip.customVehicleName?.toLowerCase()
    );
    if (match?.factor) return match.factor;
  }

  const normalized = normalizeVehicleType(vehicleType || trip.vehicle || trip.customVehicleName);
  if (!normalized) return null;
  return DEFAULT_BASELINES_KG_PER_KM[normalized] ?? null;
};

const getTripBaselineStatus = (trip: Trip, customVehicles: CustomVehicle[]) => {
  if (!trip.distance || trip.distance <= 0) return null;
  const meta = resolveTripMeta(trip, customVehicles);
  const normalizedFuel = normalizeFuelType(meta.fuelType);
  const baseline = getGovernmentBaselineKgPerKm(meta.vehicleType, meta.fuelType);
  const resolvedBaseline =
    baseline ?? getFallbackBaselineKgPerKm(trip, customVehicles, meta.vehicleType);
  if (!resolvedBaseline) return null;

  const actualKgPerKm = trip.co2 / trip.distance;
  const percentOver = (actualKgPerKm - resolvedBaseline) / resolvedBaseline;
  const isGovernmentEstimated = Boolean(baseline && normalizedFuel === 'electric');

  return {
    baselineKgPerKm: resolvedBaseline,
    actualKgPerKm,
    percentOver,
    isAbove: percentOver > BASELINE_WARNING_THRESHOLD,
    isEstimated: !baseline || isGovernmentEstimated
  };
};

const getEmissionSummary = (trip: Trip, customVehicles: CustomVehicle[]) => {
  const baselineStatus = getTripBaselineStatus(trip, customVehicles);
  const meta = resolveTripMeta(trip, customVehicles);
  let statusLabel: 'Good' | 'Avg' | 'Poor' = 'Avg';
  let message = 'Baseline not configured yet.';

  if (baselineStatus) {
    if (baselineStatus.actualKgPerKm <= baselineStatus.baselineKgPerKm) {
      statusLabel = 'Good';
      message = 'Below baseline. Keep up the efficient driving.';
    } else if (baselineStatus.percentOver <= BASELINE_WARNING_THRESHOLD) {
      statusLabel = 'Avg';
      message = 'Slightly above baseline. Small tweaks can help.';
    } else {
      statusLabel = 'Poor';
      if (meta.drivingStyle === 'Aggressive') {
        message = 'Aggressive driving increases emissions. Try smoother acceleration.';
      } else if (meta.vehicleCondition === 'Poor') {
        message = 'Poor vehicle condition raises emissions. Maintenance could help.';
      } else {
        message = 'Above baseline. Consider eco-driving or maintenance.';
      }
    }
  }

  if (baselineStatus?.isEstimated) {
    message = `${message} (Baseline estimated)`;
  }

  const badgeClass =
    statusLabel === 'Good'
      ? 'bg-emerald-500/10 text-emerald-500'
      : statusLabel === 'Avg'
        ? 'bg-amber-500/10 text-amber-500'
        : 'bg-rose-500/10 text-rose-500';

  return { baselineStatus, statusLabel, message, badgeClass };
};

const vehicleIcons: Record<VehicleType, string> = {
  Car: 'fa-car-side',
  Bus: 'fa-bus',
  Train: 'fa-train',
  Bike: 'fa-bicycle',
  Walking: 'fa-person-walking',
  Custom: 'fa-car-side'
};

const inferIconFromName = (name: string) => {
  const label = name.toLowerCase();
  if (label.includes('bus')) return 'fa-bus';
  if (label.includes('train') || label.includes('metro') || label.includes('rail')) return 'fa-train';
  if (label.includes('bike') || label.includes('bicycle') || label.includes('cycle')) return 'fa-bicycle';
  if (label.includes('walk')) return 'fa-person-walking';
  if (label.includes('scooter') || label.includes('motor')) return 'fa-motorcycle';
  if (label.includes('truck')) return 'fa-truck';
  if (label.includes('van')) return 'fa-van-shuttle';
  if (label.includes('taxi')) return 'fa-taxi';
  if (label.includes('car')) return 'fa-car-side';
  return null;
};

const getCustomVehicleIcon = (name: string, category?: CustomVehicle['category']) => {
  const fromName = inferIconFromName(name);
  if (fromName) return fromName;

  if (category === 'public') return 'fa-bus';
  if (category === 'personal') return 'fa-car-side';

  return 'fa-car-side';
};

const getTripIcon = (trip: Trip, customVehicles: CustomVehicle[]) => {
  if (trip.vehicle === 'Custom') {
    const match = customVehicles.find(
      (v) => v.name.toLowerCase() === (trip.customVehicleName || '').toLowerCase()
    );
    const label = trip.customVehicleName || trip.vehicle;
    return getCustomVehicleIcon(label, match?.category);
  }
  return vehicleIcons[trip.vehicle] || 'fa-location-arrow';
};

const chunkWithOverlap = <T,>(points: T[], maxPoints: number): T[][] => {
  if (points.length <= maxPoints) return [points];
  const chunks: T[][] = [];
  let start = 0;
  while (start < points.length) {
    const end = Math.min(start + maxPoints, points.length);
    chunks.push(points.slice(start, end));
    if (end >= points.length) break;
    start = end - 1;
  }
  return chunks;
};

const computePathDistanceKm = (coords: { lat: number; lng: number }[]) => {
  let total = 0;
  for (let i = 1; i < coords.length; i++) {
    total += calculateHaversineDistance(coords[i - 1], coords[i]);
  }
  return total;
};

/**
 * OSRM Map Matching — free, open-source, no API key required.
 * Uses the public OSRM demo server (router.project-osrm.org).
 * Falls back silently to raw Haversine distance if OSRM is unreachable.
 */
const fetchOSRMMatchedDistance = async (points: TrackingPoint[]): Promise<number | null> => {
  if (points.length < 2) return null;

  // OSRM accepts max 100 coordinates per request; chunk if needed
  const MAX_OSRM_POINTS = 100;

  const processChunk = async (chunk: TrackingPoint[]): Promise<number | null> => {
    // OSRM uses lng,lat order (opposite of Google)
    const coords = chunk.map(p => `${p.lng.toFixed(6)},${p.lat.toFixed(6)}`).join(';');
    // Radius of acceptable GPS accuracy per point (meters)
    const radiuses = chunk.map(() => '30').join(';');

    const url = `https://router.project-osrm.org/match/v1/driving/${coords}` +
      `?overview=full&geometries=geojson&steps=false&radiuses=${radiuses}&gaps=split`;

    const resp = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!resp.ok) return null;

    const data = await resp.json();
    if (!data.matchings || data.matchings.length === 0) return null;

    // Sum the distance from all matched segments (OSRM returns metres)
    const totalMetres: number = data.matchings.reduce(
      (sum: number, m: any) => sum + (m.distance || 0), 0
    );
    return totalMetres / 1000; // convert to km
  };

  // Calculate how many chunks we need
  let totalKm = 0;
  for (let i = 0; i < points.length; i += MAX_OSRM_POINTS - 1) {
    const chunk = points.slice(i, i + MAX_OSRM_POINTS);
    if (chunk.length < 2) break;
    const dist = await processChunk(chunk);
    if (dist !== null) totalKm += dist;
  }

  return totalKm > 0 ? totalKm : null;
};


interface TrackerProps {
  trips: Trip[];
  bills: UtilityBill[];
  customVehicles: CustomVehicle[];
  availableVehicles?: VehicleType[]; // NEW: List of available base vehicles
  onAddTrip: (trip: Trip) => void;
  onDeleteTrip: (id: string) => void;
  onUpdateElectricity: (kwh: number, month: string) => void;
  onDeleteBill: (id: string) => void;
  onFinishDay: () => void;
  onAddCustomVehicle: (vehicle: CustomVehicle) => void;
  onDeleteCustomVehicle: (name: string) => void;
  onDeleteBaseVehicle?: (vehicleType: VehicleType) => void; // NEW: Handler for deleting base vehicles
}

const Tracker: React.FC<TrackerProps> = ({
  trips,
  bills,
  customVehicles,
  availableVehicles = [], // Base vehicles disabled; custom-only
  onAddTrip,
  onDeleteTrip,
  onUpdateElectricity,
  onDeleteBill,
  onFinishDay,
  onAddCustomVehicle,
  onDeleteCustomVehicle,
  onDeleteBaseVehicle // NEW
}) => {
  const [activeCategory, setActiveCategory] = useState<'travel' | 'electricity'>('travel');
  const [activeFeedTab, setActiveFeedTab] = useState<'trips' | 'utilities'>('trips');
  const [distance, setDistance] = useState<string>('');
  const [kwhInput, setKwhInput] = useState<string>('');
  const [selectedMonth, setSelectedMonth] = useState<string>(new Date().toLocaleString('default', { month: 'long' }));
  const [vehicle, setVehicle] = useState<VehicleType>('Car');
  const [selectedCustomVehicle, setSelectedCustomVehicle] = useState<string>('');
  const [scanning, setScanning] = useState(false);
  const [scanningOdometer, setScanningOdometer] = useState(false);

  // Tracking mode
  const [trackingMode, setTrackingMode] = useState<'manual' | 'automatic'>('manual');
  const [isTracking, setIsTracking] = useState(false);
  const [isMatchingRoute, setIsMatchingRoute] = useState(false);
  const [startLocation, setStartLocation] = useState<{ lat: number, lng: number } | null>(null);
  const [currentDistance, setCurrentDistance] = useState(0);
  const watchIdRef = useRef<number | null>(null);
  const startLocationRef = useRef<{ lat: number; lng: number } | null>(null);
  const lastPointRef = useRef<TrackingPoint | null>(null);
  const breadcrumbsRef = useRef<TrackingPoint[]>([]);
  const distanceRef = useRef(0);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const backgroundWarnedRef = useRef(false);
  const [wakeLockActive, setWakeLockActive] = useState(false);
  const roadsApiKey = ''; // Replaced by free OSRM — no API key needed


  // Custom vehicle modal - UPDATED: Predict emission factor via API
  const [showCustomVehicleModal, setShowCustomVehicleModal] = useState(false);
  const [customVehicleName, setCustomVehicleName] = useState('');
  const [customVehicleType, setCustomVehicleType] = useState('');
  const [customVehicleMake, setCustomVehicleMake] = useState('');
  const [customVehicleModel, setCustomVehicleModel] = useState('');
  const [customVehicleYear, setCustomVehicleYear] = useState('');
  const [customFuelType, setCustomFuelType] = useState('');
  const [customVehicleCondition, setCustomVehicleCondition] = useState<CustomVehicle['vehicleCondition'] | ''>('');
  const [customDrivingStyle, setCustomDrivingStyle] = useState<CustomVehicle['drivingStyle'] | ''>('');
  const [customOdometerKm, setCustomOdometerKm] = useState('');
  const [isPredictingFactor, setIsPredictingFactor] = useState(false);
  const [plateInput, setPlateInput] = useState('');
  const [isLookingUpPlate, setIsLookingUpPlate] = useState(false);
  const [plateSource, setPlateSource] = useState<'parivahan' | 'gemini' | 'not_found' | null>(null);
  const [plateError, setPlateError] = useState('');
  const [enrichedLookupData, setEnrichedLookupData] = useState<{
    vehicleAge?: number;
    emissionNorm?: string;
    colour?: string;
    bodyType?: string;
    conditionHint?: string;
  } | null>(null);

  const ML_API_URL = import.meta.env.VITE_ML_API_URL || 'http://localhost:8000/api';

  const handlePlateLookup = async () => {
    const reg = plateInput.trim();
    if (!reg || reg.length < 4) {
      setPlateError('Enter a valid registration number (e.g. MH12AB1234)');
      return;
    }
    setIsLookingUpPlate(true);
    setPlateError('');
    setPlateSource(null);
    setEnrichedLookupData(null);
    try {
      const resp = await fetch(`${ML_API_URL}/vehicle-lookup?reg=${encodeURIComponent(reg)}`);
      if (!resp.ok) {
        setPlateError('Could not reach the lookup service. Please fill in the details manually.');
        return;
      }
      const data = await resp.json();

      if (data.source === 'parivahan' && (data.make || data.model)) {
        if (data.make && data.model) {
          setCustomVehicleName(`${data.make} ${data.model}`.trim());
        } else if (data.make) {
          setCustomVehicleName(data.make);
        }
        if (data.make) setCustomVehicleMake(data.make);
        if (data.model) setCustomVehicleModel(data.model);
        if (data.year) setCustomVehicleYear(String(data.year));
        if (data.fuelType) setCustomFuelType(data.fuelType === 'petrol' ? 'gas' : data.fuelType);
        if (data.vehicleType) setCustomVehicleType(data.vehicleType);
        // Auto-fill condition from RC data hint
        if (data.conditionHint) {
          setCustomVehicleCondition(data.conditionHint as CustomVehicle['vehicleCondition']);
        }
        setEnrichedLookupData({
          vehicleAge: data.vehicleAge,
          emissionNorm: data.emissionNorm,
          colour: data.colour,
          bodyType: data.bodyType,
          conditionHint: data.conditionHint,
        });
        setPlateSource('parivahan');
      } else if (data.source === 'not_found') {
        setPlateSource('not_found');
        setPlateError('Plate not found in Parivahan database. Please fill in the details manually.');
      } else {
        setPlateError('No data found for this plate. The government database may be temporarily unavailable.');
      }
    } catch {
      setPlateError('Could not reach the lookup service. Please fill in the details manually.');
    } finally {
      setIsLookingUpPlate(false);
    }
  };

  const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

  // Build vehicle chips from BOTH base vehicles and custom vehicles
  const baseVehicleChips = (availableVehicles || []).map((v) => ({
    kind: 'base' as const,
    key: `base-${v}`,
    label: v,
    icon: vehicleIcons[v] || 'fa-car-side',
    vehicleType: v
  }));

  const customVehicleChips = customVehicles.map((cv) => ({
    kind: 'custom' as const,
    key: `custom-${cv.name}`,
    label: cv.name,
    icon: getCustomVehicleIcon(cv.name, cv.category),
    customName: cv.name
  }));

  const allVehicleChips = [...baseVehicleChips, ...customVehicleChips];


  const handleSaveCustomVehicle = async () => {
    if (!customVehicleName.trim()) {
      alert('Please enter a vehicle name');
      return;
    }

    setIsPredictingFactor(true);

    try {
      const vehicleDescriptor = [
        customVehicleMake,
        customVehicleModel,
        customVehicleYear
      ].filter(Boolean).join(' ').trim();

      const queryName = vehicleDescriptor || customVehicleName.trim();
      const prediction = await predictEmissionFactor(
        queryName,
        customVehicleType || undefined,
        customFuelType || undefined
      );

      const parsedOdometer = customOdometerKm.trim() ? Number(customOdometerKm) : NaN;
      const odometerKm = Number.isFinite(parsedOdometer) && parsedOdometer >= 0 ? parsedOdometer : undefined;

      const inferredVehicleType =
        customVehicleType || (normalizeVehicleType(customVehicleName.trim()) || undefined);
      const inferredFuelType = customFuelType || inferFuelTypeFromName(customVehicleName.trim());

      const newVehicle: CustomVehicle = {
        name: customVehicleName.trim(),
        factor: prediction.factor,
        category: (prediction.category as any) || (customFuelType as any) || 'gas',
        vehicleType: inferredVehicleType,
        fuelType: inferredFuelType || undefined,
        vehicleCondition: customVehicleCondition || undefined,
        drivingStyle: customDrivingStyle || undefined,
        odometerKm
      };

      onAddCustomVehicle(newVehicle);

      // Reset form
      setCustomVehicleName('');
      setCustomVehicleType('');
      setCustomVehicleMake('');
      setCustomVehicleModel('');
      setCustomVehicleYear('');
      setCustomFuelType('');
      setCustomVehicleCondition('');
      setCustomDrivingStyle('');
      setCustomOdometerKm('');
      setPlateInput('');
      setPlateSource(null);
      setPlateError('');
      setEnrichedLookupData(null);
      setShowCustomVehicleModal(false);
    } catch (error) {
      console.error('Failed to predict emission factor:', error);
      alert('Unable to estimate emission factor. Please try again.');
    } finally {
      setIsPredictingFactor(false);
    }
  };

  const getEmissionFactor = (vehicleType: VehicleType, customVehicleName?: string): number => {
    if (vehicleType === 'Custom' && customVehicleName) {
      const custom = customVehicles.find(v => v.name === customVehicleName);
      const baseFactor = custom?.factor || 0.15;
      const inferredFuel = custom?.fuelType || inferFuelTypeFromName(custom?.name);
      const inferredVehicle = custom?.vehicleType || normalizeVehicleType(custom?.name);
      const baseline =
        getGovernmentBaselineKgPerKm(inferredVehicle, inferredFuel as CustomVehicle['fuelType']) ??
        DEFAULT_BASELINES_KG_PER_KM[normalizeVehicleType(inferredVehicle)] ??
        null;

      if (inferredFuel === 'electric' && baseline && baseFactor < baseline) {
        return baseline;
      }

      return baseFactor;
    }

    const factors: Record<string, number> = {
      'Car': 0.192, // India GHG Program average 4-wheeler
      'Bus': 0.08,
      'Train': 0.04,
      'Bike': 0.01,
      'Walking': 0
    };

    return factors[vehicleType] || 0.15;
  };

  const getSelectedCustomVehicle = (name?: string) => {
    if (!name) return undefined;
    return customVehicles.find(v => v.name.toLowerCase() === name.toLowerCase());
  };

  const buildTripMeta = (selectedVehicle: CustomVehicle | undefined, vehicleType: VehicleType) => ({
    vehicleType: vehicleType === 'Custom' ? selectedVehicle?.vehicleType : vehicleType,
    fuelType: vehicleType === 'Custom' ? selectedVehicle?.fuelType : undefined,
    vehicleCondition: vehicleType === 'Custom' ? selectedVehicle?.vehicleCondition : undefined,
    drivingStyle: vehicleType === 'Custom' ? selectedVehicle?.drivingStyle : undefined,
    odometerKm: vehicleType === 'Custom' ? selectedVehicle?.odometerKm : undefined
  });

  const warnIfAboveBaseline = (trip: Trip) => {
    const status = getTripBaselineStatus(trip, customVehicles);
    if (!status || !status.isAbove) return;
    const percent = Math.max(0, Math.round(status.percentOver * 100));
    alert(
      `Warning: Estimated emissions are ${percent}% above the government baseline (${status.baselineKgPerKm.toFixed(
        2
      )} kg CO2/km).`
    );
  };

  const handleOdometerUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setScanningOdometer(true);
    const reader = new FileReader();
    reader.onloadend = async () => {
      const result = await verifyOdometerImage(reader.result as string);
      if (result && result.odometer > 0) {
        let calculated = "";
        const isCustom = vehicle === 'Custom';
        const customName = isCustom ? selectedCustomVehicle : undefined;
        const vehicleTrips = trips.filter(t => t.vehicle === vehicle && t.customVehicleName === customName && t.odometerKm !== undefined && t.odometerKm !== null);
        const lastTrip = vehicleTrips.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];

        if (lastTrip && lastTrip.odometerKm) {
          const diff = result.odometer - lastTrip.odometerKm;
          if (diff > 0 && diff < 2000) {
            setDistance(diff.toString());
            calculated = `\n\nDistance since last trip (${diff} km) has been automatically filled!`;
          } else {
            calculated = `\n\nDistance could not be calculated (difference from last trip: ${diff} km).`;
          }
        } else {
          calculated = `\n\nOdometer recorded: ${result.odometer} km. Log more trips to enable auto-distance calculation.`;
        }

        alert(`Extracted Odometer: ${result.odometer} km\nConfidence: ${result.confidence}%\nReasoning: ${result.reasoning || 'None'}${calculated}`);
      } else {
        alert("Failed to extract a valid reading. Please try a clearer photo of the dashboard.");
      }
      setScanningOdometer(false);
    };
    reader.readAsDataURL(file);
    e.target.value = ''; // reset input
  };

  const handleAddTrip = () => {
    const d = parseFloat(distance);
    if (isNaN(d) || d <= 0) return;

    const isCustom = vehicle === 'Custom';
    const customName = isCustom ? selectedCustomVehicle : undefined;
    if (isCustom && !customName) {
      alert('Please select a custom vehicle first.');
      return;
    }
    const factor = getEmissionFactor(vehicle, customName);
    const selectedVehicle = getSelectedCustomVehicle(customName);
    const tripMeta = buildTripMeta(selectedVehicle, vehicle);
    const conditionMultiplier = getConditionMultiplier(tripMeta.vehicleCondition);
    const drivingMultiplier = getDrivingStyleMultiplier(tripMeta.drivingStyle);
    const baseCo2 = d * factor;
    const adjustedCo2 = baseCo2 * conditionMultiplier * drivingMultiplier;

    const newTrip: Trip = {
      id: Date.now().toString(),
      vehicle,
      customVehicleName: customName,
      distance: d,
      date: new Date().toISOString(),
      co2: Number(adjustedCo2.toFixed(2)),
      ...tripMeta
    };

    onAddTrip(newTrip);
    warnIfAboveBaseline(newTrip);

    setDistance('');
  };

  // Start automatic tracking
  const startAutoTracking = () => {
    if (!navigator.geolocation) {
      alert('Geolocation is not supported by your browser');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const startPoint = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          timestamp: position.timestamp || Date.now()
        };
        startLocationRef.current = { lat: startPoint.lat, lng: startPoint.lng };
        setStartLocation({ lat: startPoint.lat, lng: startPoint.lng });
        distanceRef.current = 0;
        setCurrentDistance(0);
        lastPointRef.current = startPoint;
        breadcrumbsRef.current = [startPoint];
        backgroundWarnedRef.current = false; // reset for new session
        setIsTracking(true);
        setIsMatchingRoute(false);
        acquireWakeLock(); // keep screen on while tracking

        // Watch position changes
        const watchId = navigator.geolocation.watchPosition(
          (pos) => {
            const point: TrackingPoint = {
              lat: pos.coords.latitude,
              lng: pos.coords.longitude,
              timestamp: pos.timestamp || Date.now()
            };

            // Filter out inaccurate GPS fixes (> 50 m accuracy radius)
            if (pos.coords.accuracy > 50) return;

            const lastPoint = lastPointRef.current;
            if (!lastPoint) {
              lastPointRef.current = point;
              breadcrumbsRef.current = [point];
              return;
            }

            const deltaKm = calculateHaversineDistance(
              { lat: lastPoint.lat, lng: lastPoint.lng },
              { lat: point.lat, lng: point.lng }
            );
            const deltaMeters = deltaKm * 1000;
            const deltaTime = point.timestamp - lastPoint.timestamp;

            // Speed sanity check: reject points implying > 200 km/h (GPS glitch)
            const speedKmH = deltaTime > 0 ? (deltaKm / (deltaTime / 3600000)) : 0;
            if (speedKmH > 200) return;

            if (deltaMeters < ROUTE_MATCHING_MIN_STEP_METERS && deltaTime < ROUTE_MATCHING_MIN_STEP_MS) {
              return;
            }

            distanceRef.current += deltaKm;
            setCurrentDistance(Number(distanceRef.current.toFixed(2)));
            lastPointRef.current = point;
            breadcrumbsRef.current.push(point);
          },
          (error) => console.error('Tracking error:', error),
          { enableHighAccuracy: true, maximumAge: 10000, timeout: 5000 }
        );

        watchIdRef.current = watchId;
      },
      (error) => {
        alert('Unable to get your location. Please enable location services.');
        console.error('Location error:', error);
      }
    );
  };

  // Stop automatic tracking and log trip
  const stopAutoTracking = async () => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }

    setIsTracking(false);
    releaseWakeLock(); // allow screen to sleep again

    const trackedPoints = breadcrumbsRef.current;
    // Use OSRM map matching when we have enough points (free, no API key needed)
    const shouldMatchRoute = trackedPoints.length >= 4;
    setIsMatchingRoute(shouldMatchRoute);
    let distanceKm = distanceRef.current;

    const resetTrackingState = () => {
      setStartLocation(null);
      setCurrentDistance(0);
      setIsMatchingRoute(false);
      startLocationRef.current = null;
      lastPointRef.current = null;
      breadcrumbsRef.current = [];
      distanceRef.current = 0;
    };

    if (shouldMatchRoute) {
      try {
        const matchedDistance = await fetchOSRMMatchedDistance(trackedPoints);
        if (matchedDistance && matchedDistance > 0) {
          distanceKm = matchedDistance;
        }
      } catch (error) {
        console.warn('OSRM route matching unavailable, using raw GPS distance', error);
      }
    }

    if (distanceKm > 0.1) { // Minimum 100m
      const isCustom = vehicle === 'Custom';
      const customName = isCustom ? selectedCustomVehicle : undefined;
      if (isCustom && !customName) {
        alert('Please select a custom vehicle first.');
        resetTrackingState();
        return;
      }
      const factor = getEmissionFactor(vehicle, customName);
      const selectedVehicle = getSelectedCustomVehicle(customName);
      const tripMeta = buildTripMeta(selectedVehicle, vehicle);
      const conditionMultiplier = getConditionMultiplier(tripMeta.vehicleCondition);
      const drivingMultiplier = getDrivingStyleMultiplier(tripMeta.drivingStyle);
      const baseCo2 = distanceKm * factor;
      const adjustedCo2 = baseCo2 * conditionMultiplier * drivingMultiplier;

      const newTrip: Trip = {
        id: Date.now().toString(),
        vehicle,
        customVehicleName: customName,
        distance: Number(distanceKm.toFixed(2)),
        date: new Date().toISOString(),
        co2: Number(adjustedCo2.toFixed(2)),
        ...tripMeta
      };

      onAddTrip(newTrip);
      warnIfAboveBaseline(newTrip);
    }

    resetTrackingState();
  };

  // Wake lock: prevent screen from sleeping while tracking
  const acquireWakeLock = async () => {
    try {
      if ('wakeLock' in navigator) {
        wakeLockRef.current = await (navigator as any).wakeLock.request('screen');
        wakeLockRef.current.addEventListener('release', () => setWakeLockActive(false));
        setWakeLockActive(true);
      }
    } catch {
      // Wake lock not supported or permission denied — silently ignore
    }
  };

  const releaseWakeLock = () => {
    if (wakeLockRef.current) {
      wakeLockRef.current.release().catch(() => undefined);
      wakeLockRef.current = null;
      setWakeLockActive(false);
    }
  };

  // Warn user if they background the app while tracking
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!isTracking) return;
      if (document.hidden && !backgroundWarnedRef.current) {
        backgroundWarnedRef.current = true;
        // We can't show a real notification, so set a state flag
        // The UI shows a persistent warning banner instead
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [isTracking]);

  // Cleanup on unmount: clear GPS watch and release wake lock
  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
      releaseWakeLock();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleAddBill = () => {
    const k = parseFloat(kwhInput);
    if (isNaN(k) || k <= 0) return;
    onUpdateElectricity(k, selectedMonth);
    setKwhInput('');
  };

  const handleKeyDown = (e: React.KeyboardEvent, action: () => void) => {
    if (e.key === 'Enter') action();
  };

  const handleBillUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setScanning(true);
    const reader = new FileReader();
    reader.onloadend = async () => {
      const result = await verifyBillImage(reader.result as string);
      if (result && result.units > 0) {
        if (result.isAnomalous) {
          alert(`Warning: Anomaly detected. ${result.reasoning || 'Please verify manually.'}`);
        }
        onUpdateElectricity(Number(result.units), selectedMonth);
      }
      setScanning(false);
    };
    reader.readAsDataURL(file);
  };

  return (
    <>
      <div className="space-y-6 pb-24 pt-4">
        {/* Top Toggle */}
        <div className="flex bg-white dark:bg-slate-900 p-1.5 rounded-3xl shadow-lg border border-slate-100 dark:border-slate-800 animate-fade-in-up opacity-0" style={{ animationDelay: '0ms' }}>
          <button
            onClick={() => setActiveCategory('travel')}
            className={`flex-1 py-3.5 rounded-2xl font-black text-xs uppercase tracking-widest transition-all duration-300 ease-[cubic-bezier(0.175,0.885,0.32,1.275)] ${activeCategory === 'travel' ? 'bg-slate-900 dark:bg-emerald-500 text-white shadow-lg scale-100' : 'text-slate-400 scale-95 hover:scale-100 hover:text-slate-600 dark:hover:text-slate-300'}`}
          >
            <i className="fa-solid fa-car-side mr-2"></i> Travel
          </button>
          <button
            onClick={() => setActiveCategory('electricity')}
            className={`flex-1 py-3.5 rounded-2xl font-black text-xs uppercase tracking-widest transition-all duration-300 ease-[cubic-bezier(0.175,0.885,0.32,1.275)] ${activeCategory === 'electricity' ? 'bg-slate-900 dark:bg-emerald-500 text-white shadow-lg scale-100' : 'text-slate-400 scale-95 hover:scale-100 hover:text-slate-600 dark:hover:text-slate-300'}`}
          >
            <i className="fa-solid fa-bolt mr-2"></i> Energy
          </button>
        </div>

        {activeCategory === 'travel' ? (
          <div className="glass p-6 rounded-[2.5rem] shadow-xl space-y-6 bg-white dark:bg-slate-900/40 border-white/5 animate-fade-in-up opacity-0" style={{ animationDelay: '100ms' }}>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-[11px] font-black text-slate-400 uppercase tracking-[0.16em]">Select Transport</h3>
              <button
                onClick={() => setShowCustomVehicleModal(true)}
                className="text-[10px] font-black text-emerald-500 uppercase tracking-widest flex items-center gap-1 hover:text-emerald-600 transition-colors"
              >
                <i className="fa-solid fa-plus"></i> Add Custom
              </button>
            </div>

            {/* TRACKING MODE SELECTION */}
            <div className="flex bg-slate-100 dark:bg-slate-800 p-1.5 rounded-2xl gap-2">
              <button
                onClick={() => {
                  setTrackingMode('manual');
                  if (isTracking) stopAutoTracking();
                }}
                className={`flex-1 py-3 rounded-xl font-black text-xs uppercase tracking-widest transition-all flex items-center justify-center gap-2 ${trackingMode === 'manual'
                  ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-lg'
                  : 'text-slate-400'
                  }`}
              >
                <i className="fa-solid fa-keyboard"></i>
                Manual
              </button>
              <button
                onClick={() => setTrackingMode('automatic')}
                className={`flex-1 py-3 rounded-xl font-black text-xs uppercase tracking-widest transition-all flex items-center justify-center gap-2 ${trackingMode === 'automatic'
                  ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-lg'
                  : 'text-slate-400'
                  }`}
              >
                <i className="fa-solid fa-location-crosshairs"></i>
                Automatic
              </button>
            </div>

            {/* VEHICLE CHIPS (BASE + CUSTOM) */}
            <div className="flex gap-2 overflow-x-auto overflow-y-visible pb-2 no-scrollbar">
              {allVehicleChips.length === 0 && (
                <div className="w-full">
                  <div className="flex items-center justify-between gap-3 p-4 bg-slate-50 dark:bg-slate-800/60 rounded-2xl border border-slate-200 dark:border-slate-700">
                    <div>
                      <div className="text-[11px] font-black text-slate-400 uppercase tracking-[0.16em]">No Vehicles Yet</div>
                      <div className="text-xs text-slate-600 dark:text-slate-300 font-medium mt-1">
                        Add your first custom vehicle to start logging trips.
                      </div>
                    </div>
                    <button
                      onClick={() => setShowCustomVehicleModal(true)}
                      className="px-4 py-2 bg-emerald-500 text-white text-[10px] font-black uppercase tracking-[0.12em] rounded-xl shadow-lg hover:bg-emerald-400 hover:scale-105 active:scale-95 transition-all duration-300"
                    >
                      Add
                    </button>
                  </div>
                </div>
              )}
              {baseVehicleChips.map((chip) => (
                <div key={chip.key} className="relative flex-shrink-0 group">
                  <button
                    onClick={() => {
                      setVehicle(chip.vehicleType);
                      setSelectedCustomVehicle('');
                    }}
                    className={`px-5 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2 ${vehicle === chip.vehicleType && selectedCustomVehicle === ''
                      ? 'bg-emerald-600 text-white shadow-lg'
                      : 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                      }`}
                  >
                    <i className={`fa-solid ${chip.icon}`}></i> {chip.label}
                  </button>
                </div>
              ))}
              {customVehicleChips.map((chip) => (
                <div key={chip.key} className="relative flex-shrink-0 group">
                  <button
                    onClick={() => {
                      setVehicle('Custom');
                      setSelectedCustomVehicle(chip.customName);
                    }}
                    className={`px-5 py-3 pr-10 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2 ${vehicle === 'Custom' && selectedCustomVehicle === chip.customName
                      ? 'bg-emerald-600 text-white shadow-lg'
                      : 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                      }`}
                  >
                    <i className={`fa-solid ${chip.icon}`}></i> {chip.label}
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (confirm(`Delete ${chip.label}?`)) {
                        onDeleteCustomVehicle(chip.customName);
                        if (selectedCustomVehicle === chip.customName) {
                          setSelectedCustomVehicle('');
                          setVehicle('Custom');
                        }
                      }
                    }}
                    className={`absolute right-2 top-1/2 -translate-y-1/2 w-5 h-5 bg-white text-rose-500 rounded-md flex items-center justify-center shadow-md border border-rose-100 transition-opacity ${vehicle === 'Custom' && selectedCustomVehicle === chip.customName
                      ? 'opacity-100'
                      : 'opacity-0 pointer-events-none'
                      }`}
                    title={`Delete ${chip.label}`}
                  >
                    <i className="fa-solid fa-trash fa-xs"></i>
                  </button>
                </div>
              ))}
            </div>

            {/* DISTANCE INPUT - Different for Manual vs Automatic */}
            {trackingMode === 'manual' ? (
              <div className="relative">
                <input
                  type="number"
                  value={distance}
                  onChange={(e) => setDistance(e.target.value)}
                  onKeyDown={(e) => handleKeyDown(e, handleAddTrip)}
                  placeholder="Distance (km)"
                  className="w-full bg-slate-50 dark:bg-slate-800 rounded-2xl p-6 text-2xl sm:text-3xl font-black text-center text-slate-800 dark:text-white outline-none focus:ring-4 focus:ring-emerald-500/10"
                />
                <div className="absolute left-6 top-1/2 -translate-y-1/2 flex items-center gap-3" title="Auto-fill by uploading photo of Odometer">
                  <label className={`cursor-pointer w-10 h-10 rounded-full flex items-center justify-center transition-all shadow-md ${scanningOdometer ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-500 animate-pulse' : 'bg-slate-200 dark:bg-slate-700 hover:bg-emerald-500 hover:text-white text-slate-500 dark:text-slate-400'}`}>
                    {scanningOdometer ? <i className="fa-solid fa-spinner animate-spin fa-lg"></i> : <i className="fa-solid fa-camera fa-lg"></i>}
                    <input type="file" accept="image/*" capture="environment" className="hidden" onChange={handleOdometerUpload} disabled={scanningOdometer} />
                  </label>
                </div>
                <div className="absolute right-6 top-1/2 -translate-y-1/2 text-slate-400 font-black text-xs uppercase">km</div>
              </div>
            ) : (
              <div className="space-y-4">
                {!isTracking ? (
                  isMatchingRoute ? (
                    <div className="p-6 bg-amber-50 dark:bg-amber-500/10 rounded-2xl border-2 border-dashed border-amber-300 dark:border-amber-500/30 text-center">
                      <div className="w-16 h-16 bg-amber-500 rounded-2xl flex items-center justify-center text-white mx-auto mb-4 shadow-lg">
                        <i className="fa-solid fa-route text-2xl"></i>
                      </div>
                      <h4 className="text-sm font-black text-slate-800 dark:text-white mb-2">Matching Route</h4>
                      <p className="text-[11px] text-slate-500 dark:text-slate-300 font-medium">
                        Snapping your GPS points to roads...
                      </p>
                    </div>
                  ) : (
                    <div className="p-6 bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-500/10 dark:to-teal-500/10 rounded-2xl border-2 border-dashed border-emerald-300 dark:border-emerald-500/30 text-center">
                      <div className="w-16 h-16 bg-emerald-500 rounded-2xl flex items-center justify-center text-white mx-auto mb-4 shadow-lg">
                        <i className="fa-solid fa-route text-2xl"></i>
                      </div>
                      <h4 className="text-sm font-black text-slate-800 dark:text-white mb-2">Ready to Track</h4>
                      <p className="text-[11px] text-slate-500 dark:text-slate-300 font-medium">
                        GPS will calculate distance automatically
                      </p>
                    </div>
                  )
                ) : (
                  <div className="p-6 bg-slate-900 dark:bg-emerald-500 text-white rounded-2xl text-center animate-in zoom-in-95">
                    <div className="text-[10px] font-black uppercase tracking-widest mb-2 opacity-80 flex items-center justify-center gap-2">
                      <i className="fa-solid fa-satellite-dish animate-pulse"></i>
                      Live Tracking
                    </div>
                    <div className="text-5xl font-black">{currentDistance.toFixed(2)}</div>
                    <div className="text-sm font-bold opacity-70 uppercase mt-1">kilometers</div>
                    <div className="mt-4 flex items-center justify-center gap-2 text-[10px] font-bold bg-white/10 px-4 py-2 rounded-full">
                      <i className="fa-solid fa-circle text-red-400 animate-pulse"></i>
                      Recording with {vehicle === 'Custom' ? selectedCustomVehicle : vehicle}
                    </div>
                  </div>
                )}
              </div>
            )}

            {vehicle === 'Custom' && selectedCustomVehicle && null}


            {/* ACTION BUTTON */}
            {trackingMode === 'manual' ? (
              <button
                onClick={handleAddTrip}
                className="w-full bg-slate-900 dark:bg-emerald-500 text-white py-4 px-5 rounded-2xl font-black uppercase tracking-[0.18em] shadow-xl active:scale-95 transition-transform"
              >
                Log Trip
              </button>
            ) : (
              !isTracking ? (
                <button
                  onClick={startAutoTracking}
                  disabled={isMatchingRoute}
                  className={`w-full bg-emerald-500 text-white py-4 px-5 rounded-2xl font-black uppercase tracking-[0.18em] shadow-xl active:scale-95 transition-transform flex items-center justify-center gap-3 ${isMatchingRoute ? 'opacity-60 cursor-not-allowed' : ''
                    }`}
                >
                  <i className="fa-solid fa-play"></i>
                  Start Tracking
                </button>
              ) : (
                <button
                  onClick={stopAutoTracking}
                  className="w-full bg-rose-500 text-white py-4 px-5 rounded-2xl font-black uppercase tracking-[0.18em] shadow-xl active:scale-95 transition-transform flex items-center justify-center gap-3"
                >
                  <i className="fa-solid fa-stop"></i>
                  Stop & Log Trip
                </button>
              )
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="glass p-6 rounded-[2.5rem] space-y-5 bg-white dark:bg-slate-900/40 border-white/5 animate-fade-in-up opacity-0" style={{ animationDelay: '100ms' }}>
              <div className="flex gap-2 mb-2">
                <select
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(e.target.value)}
                  className="flex-1 bg-slate-50 dark:bg-slate-800 p-4 rounded-xl text-xs font-black uppercase tracking-widest outline-none border-none text-slate-500 dark:text-slate-400"
                >
                  {months.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
              <div className="relative">
                <input
                  type="number"
                  value={kwhInput}
                  onChange={(e) => setKwhInput(e.target.value)}
                  onKeyDown={(e) => handleKeyDown(e, handleAddBill)}
                  placeholder="Consumption"
                  className="w-full bg-slate-50 dark:bg-slate-800 p-6 rounded-2xl text-2xl font-black text-center text-slate-800 dark:text-white outline-none"
                />
                <div className="absolute right-6 top-1/2 -translate-y-1/2 text-slate-400 font-black text-xs uppercase">kWh</div>
              </div>
              <button
                onClick={handleAddBill}
                className="w-full bg-slate-900 dark:bg-emerald-500 text-white py-4 px-5 rounded-2xl font-black uppercase tracking-[0.18em] shadow-lg"
              >
                Save Manually
              </button>
            </div>

            <div className="glass p-10 rounded-[2.5rem] border-2 border-dashed border-slate-200 dark:border-slate-800 flex flex-col items-center justify-center bg-white/30 dark:bg-slate-900/20 animate-fade-in-up opacity-0 interactive" style={{ animationDelay: '200ms' }}>
              {scanning ? (
                <div className="flex flex-col items-center gap-2">
                  <div className="w-10 h-10 border-4 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin"></div>
                  <span className="text-[10px] font-black text-emerald-500 uppercase">AI Regional Sync...</span>
                </div>
              ) : (
                <label className="flex flex-col items-center cursor-pointer text-center">
                  <div className="w-16 h-16 bg-white dark:bg-slate-800 rounded-full flex items-center justify-center text-slate-400 mb-4 shadow-lg">
                    <i className="fa-solid fa-camera text-2xl"></i>
                  </div>
                  <span className="text-[11px] font-black text-slate-500 uppercase tracking-[0.16em]">Scan Utility Bill</span>
                  <input type="file" accept="image/*" className="hidden" onChange={handleBillUpload} />
                </label>
              )}
            </div>
          </div>
        )}

        <div className="space-y-4 animate-fade-in-up opacity-0" style={{ animationDelay: '200ms' }}>
          <div className="flex items-center justify-between ml-1">
            <h3 className="text-[11px] font-black text-slate-400 uppercase tracking-[0.16em]">Vault Activity</h3>
            <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-lg">
              <button
                onClick={() => setActiveFeedTab('trips')}
                className={`px-3 py-1 text-[10px] font-black rounded-md uppercase transition-all ${activeFeedTab === 'trips' ? 'bg-white dark:bg-slate-700 text-slate-800 dark:text-white' : 'text-slate-400'}`}
              >
                Trips
              </button>
              <button
                onClick={() => setActiveFeedTab('utilities')}
                className={`px-3 py-1 text-[10px] font-black rounded-md uppercase transition-all ${activeFeedTab === 'utilities' ? 'bg-white dark:bg-slate-700 text-slate-800 dark:text-white' : 'text-slate-400'}`}
              >
                Bills
              </button>
            </div>
          </div>

          {activeFeedTab === 'trips' ? (
            trips.filter(t => {
              const tripDate = new Date(t.date).toISOString().split('T')[0];
              const today = new Date().toISOString().split('T')[0];
              return tripDate === today;
            }).length === 0 ? <div className="p-8 text-center text-[11px] font-bold text-slate-400 uppercase">No Trips Today</div> :
              <div className="space-y-3">
                {trips.filter(t => {
                  const tripDate = new Date(t.date).toISOString().split('T')[0];
                  const today = new Date().toISOString().split('T')[0];
                  return tripDate === today;
                }).slice(0, 10).map(t => {
                  // Get the appropriate icon for the vehicle
                  const vehicleIcon = getTripIcon(t, customVehicles);
                  const { baselineStatus, statusLabel, message, badgeClass } = getEmissionSummary(
                    t,
                    customVehicles
                  );
                  const baselineMax = baselineStatus
                    ? Math.max(baselineStatus.actualKgPerKm, baselineStatus.baselineKgPerKm)
                    : 0;

                  return (
                    <div key={t.id} className="glass p-4 rounded-2xl flex items-center justify-between group bg-white dark:bg-slate-900/40">
                      <div className="flex items-center gap-4">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${t.vehicle === 'Custom' ? 'bg-amber-500/10 text-amber-500' : 'bg-emerald-500/10 text-emerald-500'}`}>
                          <i className={`fa-solid ${vehicleIcon}`}></i>
                        </div>
                        <div>
                          <h4 className="font-black text-slate-800 dark:text-white text-xs">
                            {t.vehicle === 'Custom' ? t.customVehicleName : t.vehicle} Trip
                            {t.vehicle === 'Custom' && (
                              <i className="fa-solid fa-star text-amber-500 text-[8px] ml-1"></i>
                            )}
                          </h4>
                          <p className="text-[10px] sm:text-[11px] font-bold text-slate-400 uppercase flex flex-wrap gap-x-2">
                            <span>{t.distance} km</span>
                            <span className="opacity-30">|</span>
                            <span>{t.co2.toFixed(2)} kg CO2</span>
                            <span className="opacity-30">|</span>
                            <span>{new Date(t.date).toLocaleDateString()}</span>
                            {baselineStatus?.isAbove && (
                              <span className="text-rose-500 font-black">
                                (+{Math.max(0, Math.round(baselineStatus.percentOver * 100))}%)
                              </span>
                            )}
                          </p>
                          <div className="mt-2 flex items-center gap-2">
                            <span className={`px-2 py-1 rounded-full text-[10px] font-black uppercase ${badgeClass}`}>
                              {statusLabel}
                            </span>
                            <span className="text-[11px] text-slate-500 dark:text-slate-300 font-semibold">
                              Emission: {t.co2.toFixed(2)} kg CO2
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-500 dark:text-slate-300 font-medium mt-1">
                            {message}
                          </p>
                          {baselineStatus ? (
                            <div className="mt-2 space-y-1">
                              <div className="flex items-center gap-2">
                                <span className="w-14 text-[10px] font-black uppercase text-slate-400">
                                  {baselineStatus.isEstimated ? 'Baseline*' : 'Baseline'}
                                </span>
                                <div className="flex-1 bg-slate-100 dark:bg-slate-800 rounded-full h-2">
                                  <div
                                    className="h-2 rounded-full bg-slate-400"
                                    style={{
                                      width: `${baselineMax > 0 ? (baselineStatus.baselineKgPerKm / baselineMax) * 100 : 0}%`
                                    }}
                                  ></div>
                                </div>
                                <span className="w-10 text-[10px] font-black text-slate-400">
                                  {baselineStatus.baselineKgPerKm.toFixed(2)}
                                </span>
                              </div>
                              {baselineStatus.isEstimated && (
                                <div className="text-[9px] font-black uppercase text-slate-400">
                                  *Estimated baseline
                                </div>
                              )}
                              <div className="flex items-center gap-2">
                                <span className="w-14 text-[10px] font-black uppercase text-slate-400">Actual</span>
                                <div className="flex-1 bg-slate-100 dark:bg-slate-800 rounded-full h-2">
                                  <div
                                    className={`h-2 rounded-full ${baselineStatus.isAbove ? 'bg-rose-500' : 'bg-emerald-500'
                                      }`}
                                    style={{
                                      width: `${baselineMax > 0 ? (baselineStatus.actualKgPerKm / baselineMax) * 100 : 0}%`
                                    }}
                                  ></div>
                                </div>
                                <span className="w-10 text-[10px] font-black text-slate-400">
                                  {baselineStatus.actualKgPerKm.toFixed(2)}
                                </span>
                              </div>
                            </div>
                          ) : (
                            <div className="mt-2 text-[10px] font-black uppercase text-slate-400">
                              Baseline not configured
                            </div>
                          )}
                        </div>
                      </div>
                      <button
                        onClick={() => onDeleteTrip(t.id)}
                        className="text-rose-500 p-2 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <i className="fa-solid fa-trash"></i>
                      </button>
                    </div>
                  )
                })}
              </div>
          ) : (
            bills.length === 0 ? <div className="p-8 text-center text-[11px] font-bold text-slate-400 uppercase">No Bills</div> :
              <div className="space-y-3">
                {bills.map(b => (
                  <div key={b.id} className="glass p-4 rounded-2xl flex items-center justify-between group bg-white dark:bg-slate-900/40 border-l-4 border-l-blue-500">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-500">
                        <i className="fa-solid fa-bolt"></i>
                      </div>
                      <div>
                        <h4 className="font-black text-slate-800 dark:text-white text-xs">
                          {b.month} Bill
                          {b.isAnomalous && (
                            <i className="fa-solid fa-exclamation-triangle text-amber-500 text-[8px] ml-1"></i>
                          )}
                        </h4>
                        <p className="text-[11px] font-bold text-slate-400 uppercase">{b.units} kWh</p>
                      </div>
                    </div>
                    <button
                      onClick={() => onDeleteBill(b.id)}
                      className="text-rose-500 p-2 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <i className="fa-solid fa-trash"></i>
                    </button>
                  </div>
                ))}
              </div>
          )}
        </div>

        <button
          onClick={onFinishDay}
          className="w-full bg-emerald-500 text-white py-4 px-5 rounded-[2rem] font-black text-sm uppercase tracking-[0.18em] shadow-xl flex items-center justify-center gap-4 active:scale-95 transition-transform mt-4"
        >
          ML Analysis <i className="fa-solid fa-magnifying-glass-chart"></i>
        </button>
      </div>

      {/* Custom Vehicle Modal - UPDATED: AI-predicted emission factor */}
      {showCustomVehicleModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white dark:bg-slate-900 rounded-[2rem] p-6 max-w-md w-full shadow-xl animate-in zoom-in-95 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-black text-slate-800 dark:text-white">Add Custom Vehicle</h2>
              <button
                onClick={() => {
                  setShowCustomVehicleModal(false);
                  setCustomVehicleName('');
                  setCustomVehicleType('');
                  setCustomVehicleMake('');
                  setCustomVehicleModel('');
                  setCustomVehicleYear('');
                  setCustomFuelType('');
                  setCustomVehicleCondition('');
                  setCustomDrivingStyle('');
                  setCustomOdometerKm('');
                  setIsPredictingFactor(false);
                  setPlateInput('');
                  setPlateSource(null);
                  setPlateError('');
                }}
                className="w-8 h-8 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-400 flex items-center justify-center"
              >
                <i className="fa-solid fa-times"></i>
              </button>
            </div>

            <div className="space-y-4">
              {/* PLATE LOOKUP */}
              <div className="bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/30 rounded-2xl p-4">
                <label className="text-[11px] font-black text-emerald-700 dark:text-emerald-400 uppercase tracking-[0.16em] mb-2 block flex items-center gap-1">
                  <i className="fa-solid fa-magnifying-glass"></i> Auto-fill by Plate Number
                </label>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="text"
                    value={plateInput}
                    onChange={(e) => { setPlateInput(e.target.value.toUpperCase()); setPlateError(''); setPlateSource(null); }}
                    onKeyDown={(e) => e.key === 'Enter' && handlePlateLookup()}
                    placeholder="e.g. MH12AB1234"
                    maxLength={12}
                    className="flex-1 bg-white dark:bg-slate-800 border border-emerald-200 dark:border-emerald-500/30 p-3 rounded-xl font-bold text-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500 text-sm uppercase tracking-widest min-w-0"
                  />
                  <button
                    onClick={handlePlateLookup}
                    disabled={isLookingUpPlate}
                    className="px-4 py-3 bg-emerald-500 text-white rounded-xl font-black text-[10px] sm:text-xs uppercase tracking-widest disabled:opacity-60 flex items-center justify-center gap-2 whitespace-nowrap"
                  >
                    {isLookingUpPlate
                      ? <><i className="fa-solid fa-spinner animate-spin"></i> Loading</>
                      : <><i className="fa-solid fa-search"></i> Lookup</>}
                  </button>
                </div>
                {plateSource === 'parivahan' && (
                  <div className="mt-2 text-[10px] font-black uppercase tracking-widest flex items-center gap-1 text-emerald-600">
                    <i className="fa-solid fa-satellite-dish" /> Parivahan data — fields auto-filled
                  </div>
                )}
                {plateSource === 'not_found' && (
                  <div className="mt-2 text-[10px] font-black uppercase tracking-widest flex items-center gap-1 text-amber-500">
                    <i className="fa-solid fa-triangle-exclamation" /> Not in database — please fill manually
                  </div>
                )}
                {plateError && (
                  <div className="mt-2 text-[10px] font-black text-rose-500 uppercase tracking-widest">{plateError}</div>
                )}
                {/* Enriched RC data pills */}
                {enrichedLookupData && plateSource === 'parivahan' && (
                  <div className="mt-3 flex flex-wrap gap-2 text-[9px] sm:text-[10px]">
                    {enrichedLookupData.vehicleAge !== undefined && enrichedLookupData.vehicleAge !== null && (
                      <span className="px-2 py-1 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-[10px] font-black rounded-lg flex items-center gap-1">
                        <i className="fa-solid fa-calendar text-slate-400" /> {enrichedLookupData.vehicleAge} yr{enrichedLookupData.vehicleAge !== 1 ? 's' : ''} old
                      </span>
                    )}
                    {enrichedLookupData.emissionNorm && (
                      <span className="px-2 py-1 bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 text-[10px] font-black rounded-lg flex items-center gap-1">
                        <i className="fa-solid fa-leaf" /> {enrichedLookupData.emissionNorm.toUpperCase()}
                      </span>
                    )}
                    {enrichedLookupData.conditionHint && (
                      <span className={`px-2 py-1 text-[10px] font-black rounded-lg flex items-center gap-1 ${enrichedLookupData.conditionHint === 'Good' ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' :
                        enrichedLookupData.conditionHint === 'Average' ? 'bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400' :
                          'bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400'
                        }`}>
                        <i className="fa-solid fa-gauge" /> {enrichedLookupData.conditionHint} Condition
                      </span>
                    )}
                    {enrichedLookupData.colour && (
                      <span className="px-2 py-1 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-[10px] font-black rounded-lg flex items-center gap-1">
                        <i className="fa-solid fa-palette text-slate-400" /> {enrichedLookupData.colour}
                      </span>
                    )}
                  </div>
                )}
              </div>

              <div>
                <label className="text-[11px] font-black text-slate-400 uppercase tracking-[0.16em] mb-2 block">
                  Vehicle Name *
                </label>
                <input
                  type="text"
                  value={customVehicleName}
                  onChange={(e) => setCustomVehicleName(e.target.value)}
                  placeholder="e.g., My Tesla Model 3, Honda Civic 2020"
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-3 rounded-xl font-bold text-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-black text-slate-400 uppercase tracking-[0.16em] mb-2 block">
                    Make (Optional)
                  </label>
                  <input
                    type="text"
                    value={customVehicleMake}
                    onChange={(e) => setCustomVehicleMake(e.target.value)}
                    placeholder="e.g., Honda"
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-3 rounded-xl font-bold text-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-black text-slate-400 uppercase tracking-[0.16em] mb-2 block">
                    Model (Optional)
                  </label>
                  <input
                    type="text"
                    value={customVehicleModel}
                    onChange={(e) => setCustomVehicleModel(e.target.value)}
                    placeholder="e.g., Civic"
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-3 rounded-xl font-bold text-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-black text-slate-400 uppercase tracking-[0.16em] mb-2 block">
                    Year (Optional)
                  </label>
                  <input
                    type="text"
                    value={customVehicleYear}
                    onChange={(e) => setCustomVehicleYear(e.target.value)}
                    placeholder="e.g., 2020"
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-3 rounded-xl font-bold text-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-black text-slate-400 uppercase tracking-[0.16em] mb-2 block">
                    Vehicle Type
                  </label>
                  <select
                    value={customVehicleType}
                    onChange={(e) => setCustomVehicleType(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-3 rounded-xl font-bold text-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="">Select</option>
                    <option value="car">Car</option>
                    <option value="suv">SUV</option>
                    <option value="truck">Truck</option>
                    <option value="motorcycle">Motorcycle</option>
                    <option value="scooter">Scooter</option>
                    <option value="van">Van</option>
                    <option value="other">Other</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-[11px] font-black text-slate-400 uppercase tracking-[0.16em] mb-2 block">
                  Fuel Type
                </label>
                <select
                  value={customFuelType}
                  onChange={(e) => setCustomFuelType(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-4 rounded-xl font-bold text-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="">Select fuel type</option>
                  <option value="electric">Electric</option>
                  <option value="hybrid">Hybrid</option>
                  <option value="gas">Gasoline</option>
                  <option value="diesel">Diesel</option>
                  <option value="cng">CNG</option>
                  <option value="lpg">LPG</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-black text-slate-400 uppercase tracking-[0.16em] mb-2 block">
                    Vehicle Condition
                  </label>
                  <select
                    value={customVehicleCondition}
                    onChange={(e) => setCustomVehicleCondition(e.target.value as CustomVehicle['vehicleCondition'] | '')}
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-4 rounded-xl font-bold text-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="">Select</option>
                    <option value="Good">Good</option>
                    <option value="Average">Average</option>
                    <option value="Poor">Poor</option>
                  </select>
                </div>

                <div>
                  <label className="text-[11px] font-black text-slate-400 uppercase tracking-[0.16em] mb-2 block">
                    Driving Style
                  </label>
                  <select
                    value={customDrivingStyle}
                    onChange={(e) => setCustomDrivingStyle(e.target.value as CustomVehicle['drivingStyle'] | '')}
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-4 rounded-xl font-bold text-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="">Select</option>
                    <option value="Normal">Normal</option>
                    <option value="Aggressive">Aggressive</option>
                    <option value="Eco">Eco</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-[11px] font-black text-slate-400 uppercase tracking-[0.16em] mb-2 block">
                  Odometer (km)
                </label>
                <input
                  type="number"
                  value={customOdometerKm}
                  onChange={(e) => setCustomOdometerKm(e.target.value)}
                  placeholder="e.g., 45200"
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-4 rounded-xl font-bold text-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              {isPredictingFactor && (
                <div className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-[0.16em] text-center">
                  Estimating emissions from API...
                </div>
              )}

              <button
                onClick={handleSaveCustomVehicle}
                disabled={!customVehicleName.trim() || isPredictingFactor}
                className="w-full bg-emerald-500 text-white py-4 px-5 rounded-xl font-black uppercase tracking-[0.16em] disabled:opacity-50 disabled:cursor-not-allowed shadow-lg active:scale-95 transition-transform"
              >
                <i className={`fa-solid ${isPredictingFactor ? 'fa-spinner animate-spin' : 'fa-check'} mr-2`}></i>
                {isPredictingFactor ? 'Estimating Emissions...' : 'Save Vehicle'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default Tracker;
