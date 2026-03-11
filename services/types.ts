export type VehicleType = 'Car' | 'Bike' | 'Bus' | 'Train' | 'Walking' | 'Custom';
export type FuelType = 'electric' | 'hybrid' | 'gas' | 'diesel' | 'cng' | 'lpg';
export type VehicleCondition = 'Good' | 'Average' | 'Poor';
export type DrivingStyle = 'Normal' | 'Aggressive' | 'Eco';

export interface CustomVehicle {
  name: string;
  factor: number;
  category?: 'electric' | 'hybrid' | 'gas' | 'public' | 'personal';
  vehicleType?: string;
  fuelType?: FuelType;
  vehicleCondition?: VehicleCondition;
  drivingStyle?: DrivingStyle;
  odometerKm?: number;
  addedDate?: string;
}

export interface Trip {
  id: string;
  vehicle: VehicleType;
  customVehicleName?: string;
  distance: number;
  date: string;
  co2: number;
  vehicleType?: string;
  fuelType?: FuelType;
  vehicleCondition?: VehicleCondition;
  drivingStyle?: DrivingStyle;
  odometerKm?: number;
  isAutomatic?: boolean;
  confidence?: number;
}

export interface UtilityBill {
  id: string;
  month: string;
  year: number;
  units: number;
  co2: number;
  date: string;
  isAnomalous?: boolean;
  confidence?: number;
}

// ─── Milestone / Achievement System ──────────────────────────────────────────

export interface MilestoneTier {
  /** Threshold value to unlock this tier */
  threshold: number;
  /** Label shown when unlocked, e.g. "7-Day Streak" */
  label: string;
  /** FontAwesome icon class for this tier */
  icon: string;
}

export interface AchievementDef {
  id: string;
  title: string;
  description: string;
  /** Base icon class (FontAwesome) */
  icon: string;
  tiers: MilestoneTier[];
  unit: string;
}

export interface MilestoneAchievement {
  id: string;
  title: string;
  description: string;
  icon: string;
  currentValue: number;
  nextMilestone: number;
  /** Index of the highest tier that has been unlocked (0-based, -1 = none) */
  unlockedTierIndex: number;
  /** All tiers for this achievement */
  allTiers: MilestoneTier[];
  level: number;
  unit: string;
}

export interface LeaderboardEntry {
  name: string;
  points: number;
  rank: number;
  avatar: string;
  isUser?: boolean;
}

export interface UserProfile {
  name: string;
  avatarId: string;
  points: number;
  level: string;
  dailyGoal: number;
  /** Weekly CO₂ budget in kg — user-configurable */
  weeklyGoal?: number;
  rank: number;
  streak: number;
  darkMode: boolean;
  customVehicles?: CustomVehicle[];
  availableVehicles?: VehicleType[];
  /** ISO date strings of all days where the user logged at least one trip */
  loggedDays?: string[];
  /** Used to detect newly-unlocked milestones across sessions */
  lastSeenMilestones?: Record<string, number>;
  /** Whether daily reminder notifications are enabled */
  notificationsEnabled?: boolean;
}

// ─── Social Challenges ────────────────────────────────────────────────────────

export type ChallengeType = 'zero_car_week' | 'low_carbon_day' | 'public_transit' | 'custom';

export interface Challenge {
  id: string;
  title: string;
  description: string;
  type: ChallengeType;
  /** Target: e.g. max kg CO₂ for the challenge period */
  goalValue: number;
  unit: string;
  /** ISO date string */
  startsAt: string;
  endsAt: string;
  createdBy: string;
  participantCount?: number;
  /** Only set when fetched for the current user */
  userProgress?: number;
  userJoined?: boolean;
}

export interface AIInsight {
  forecast: number;
  optimizedForecast?: number;
  risk: 'Low' | 'Moderate' | 'High';
  message: string;
  recommendations: string[];
  breakdown: {
    travel: number;
    energy: number;
  };
  dailyForecast: { day: string; value: number }[];
  patterns?: {
    peakTravelDays: string[];
    averageDailyDistance: number;
    mostUsedVehicle: string;
    carbonTrend: 'increasing' | 'stable' | 'decreasing';
  };
  mlConfidence?: number;
}

export interface TransportSuggestion {
  mode: string;
  description: string;
  co2PerKm: number;   // kg CO2/km
  savingVsCarPct: number;  // % saving vs petrol car baseline
  icon: string;       // FontAwesome class
  link?: string;      // optional info/booking URL
}

export interface EmissionFactor {
  vehicle: string;
  factor: number;
  unit: string;
  source: string;
}
