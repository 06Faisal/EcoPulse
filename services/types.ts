export type VehicleType = 'Car' | 'Bike' | 'Bus' | 'Train' | 'Walking' | 'Custom';

export interface CustomVehicle {
  name: string;
  factor: number;
  category?: 'electric' | 'hybrid' | 'gas' | 'public' | 'personal';
  addedDate?: string;
}

export interface Trip {
  id: string;
  vehicle: VehicleType;
  customVehicleName?: string;
  distance: number;
  date: string;
  co2: number;
  isAutomatic?: boolean;
  confidence?: number; // ML confidence score
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

export interface MilestoneAchievement {
  id: string;
  title: string;
  description: string;
  icon: string;
  currentValue: number;
  nextMilestone: number;
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
  rank: number;
  streak: number;
  darkMode: boolean;
  customVehicles?: CustomVehicle[];
  availableVehicles?: VehicleType[];
}

export interface AIInsight {
  forecast: number;
  optimizedForecast?: number; // ADD THIS LINE - For showing optimized target
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

export interface EmissionFactor {
  vehicle: string;
  factor: number;
  unit: string;
  source: string;
}
