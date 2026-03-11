import { GoogleGenAI, Type } from "@google/genai";
import { Trip, AIInsight, UtilityBill, TransportSuggestion } from "./types";

const apiKey = import.meta.env.VITE_GEMINI_API_KEY || "";

if (!apiKey) {
  console.warn("VITE_GEMINI_API_KEY not found");
}

const ai = new GoogleGenAI({ apiKey });

// ─── Prediction Cache (in-memory + localStorage) ────────────────────────────

const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const LOCATION_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const RECOMMENDATION_CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

function cacheKey(parts: string[]): string {
  return `ecopulse_cache_${parts.map(p => (p || "").toLowerCase().trim()).join("_")}`;
}

function readCache<T>(key: string, ttlMs: number): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const { ts, value } = JSON.parse(raw);
    if (Date.now() - ts > ttlMs) {
      localStorage.removeItem(key);
      return null;
    }
    return value as T;
  } catch {
    return null;
  }
}

function writeCache<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify({ ts: Date.now(), value }));
  } catch {
    // localStorage might be full — silently ignore
  }
}

// ─── ML / Statistical Helpers ────────────────────────────────────────────────

type MlOverrides = {
  forecast7Day?: number;
  clusterLabel?: string;
  method?: string;
};

type AnalyticsOptions = {
  skipRemote?: boolean;
};

function calculateEWMA(data: number[], alpha: number = 0.3): number {
  if (data.length === 0) return 0;
  let ewma = data[0];
  for (let i = 1; i < data.length; i++) {
    ewma = alpha * data[i] + (1 - alpha) * ewma;
  }
  return ewma;
}

function detectTrend(data: number[]): {
  slope: number;
  direction: "increasing" | "stable" | "decreasing";
} {
  const n = data.length;
  if (n < 3) return { slope: 0, direction: "stable" };

  let sumX = 0,
    sumY = 0,
    sumXY = 0,
    sumX2 = 0;
  for (let i = 0; i < n; i++) {
    sumX += i;
    sumY += data[i];
    sumXY += i * data[i];
    sumX2 += i * i;
  }

  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);

  let direction: "increasing" | "stable" | "decreasing";
  if (slope > 0.1) direction = "increasing";
  else if (slope < -0.1) direction = "decreasing";
  else direction = "stable";

  return { slope, direction };
}

function analyzeSeasonalPattern(trips: Trip[]): {
  weekdayAvg: number;
  weekendAvg: number;
  hasPattern: boolean;
} {
  const weekdayEmissions: number[] = [];
  const weekendEmissions: number[] = [];

  trips.forEach((trip) => {
    const dayOfWeek = new Date(trip.date).getDay();
    const co2 = trip.co2 || 0;

    if (dayOfWeek === 0 || dayOfWeek === 6) {
      weekendEmissions.push(co2);
    } else {
      weekdayEmissions.push(co2);
    }
  });

  const weekdayAvg =
    weekdayEmissions.length > 0
      ? weekdayEmissions.reduce((a, b) => a + b, 0) / weekdayEmissions.length
      : 0;

  const weekendAvg =
    weekendEmissions.length > 0
      ? weekendEmissions.reduce((a, b) => a + b, 0) / weekendEmissions.length
      : 0;

  const hasPattern =
    Math.abs(weekdayAvg - weekendAvg) / Math.max(weekdayAvg, 1) > 0.2;

  return { weekdayAvg, weekendAvg, hasPattern };
}

const clusters = [
  { name: "Eco Elite", avgTravel: 1.0, avgEnergy: 1.5 },
  { name: "Green Commuter", avgTravel: 2.0, avgEnergy: 2.5 },
  { name: "Sustainable Standard", avgTravel: 3.0, avgEnergy: 2.5 },
  { name: "Heavy Traveler", avgTravel: 5.0, avgEnergy: 2.5 },
  { name: "Energy Intensive", avgTravel: 2.0, avgEnergy: 5.0 },
  { name: "High Impact", avgTravel: 5.0, avgEnergy: 4.0 },
];

function assignCluster(avgTravel: number, avgEnergy: number): string {
  let minDistance = Infinity;
  let closestCluster = clusters[0].name;

  for (const cluster of clusters) {
    const distance = Math.sqrt(
      Math.pow(avgTravel - cluster.avgTravel, 2) +
      Math.pow(avgEnergy - cluster.avgEnergy, 2)
    );

    if (distance < minDistance) {
      minDistance = distance;
      closestCluster = cluster.name;
    }
  }

  return closestCluster;
}

function minePatterns(trips: Trip[]): {
  peakDays: string[];
  vehicleFrequency: Record<string, number>;
} {
  const dayCount: Record<string, number> = {};
  const vehicleCount: Record<string, number> = {};

  trips.forEach((trip) => {
    const date = new Date(trip.date);
    const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const dayName = dayNames[date.getDay()];
    dayCount[dayName] = (dayCount[dayName] || 0) + 1;

    const vehicle =
      trip.vehicle === "Custom" ? trip.customVehicleName || "Custom" : trip.vehicle;
    vehicleCount[vehicle] = (vehicleCount[vehicle] || 0) + 1;
  });

  const peakDays = Object.entries(dayCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map((entry) => entry[0]);

  return { peakDays, vehicleFrequency: vehicleCount };
}

function detectAnomalies(
  avgTravel: number,
  avgEnergy: number,
  trend: "increasing" | "stable" | "decreasing"
): string[] {
  const anomalies: string[] = [];

  const ratio = avgEnergy / Math.max(avgTravel, 0.1);
  if (ratio > 2) {
    anomalies.push("energy_dominates");
  } else if (ratio < 0.5) {
    anomalies.push("travel_dominates");
  }

  if (trend === "increasing") {
    anomalies.push("emissions_increasing");
  }

  return anomalies;
}

// ─── Emission Factor Prediction (cached) ─────────────────────────────────────

export const predictEmissionFactor = async (
  vehicleName: string,
  vehicleType?: string,
  fuelType?: string
): Promise<{ factor: number; confidence: number; category: string }> => {

  // Check cache first to avoid API quota burn
  const key = cacheKey(["factor", vehicleName, vehicleType || "", fuelType || ""]);
  const cached = readCache<{ factor: number; confidence: number; category: string }>(key, CACHE_TTL_MS);
  if (cached) {
    return cached;
  }

  if (!apiKey) {
    return { factor: 0.15, confidence: 30, category: "gas" };
  }

  const prompt = `Predict CO2 emission factor (kg CO2/km) for: ${vehicleName}, Type: ${vehicleType || "unknown"
    }, Fuel: ${fuelType || "unknown"}.

Reference ranges:
- Electric: 0.04-0.08
- Hybrid: 0.10-0.15
- Gasoline: 0.15-0.25
- Diesel: 0.17-0.22

CRITICAL: Factor MUST be 0.01-0.50 (NO negatives). Return JSON with factor, confidence (0-100), category, reasoning.`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.0-flash",   // cheaper model for emission prediction
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            factor: { type: Type.NUMBER },
            confidence: { type: Type.NUMBER },
            category: { type: Type.STRING },
            reasoning: { type: Type.STRING },
          },
          required: ["factor", "confidence", "category"],
        },
        temperature: 0.2,
      },
    });

    const result = JSON.parse(response.text || "{}");

    let validFactor = result.factor || 0.15;
    if (validFactor <= 0 || validFactor > 0.5) {
      console.warn(`Invalid factor ${validFactor}, using 0.15`);
      validFactor = 0.15;
    }

    const output = {
      factor: Number(validFactor.toFixed(3)),
      confidence: Math.round(Math.max(0, Math.min(100, result.confidence || 50))),
      category: result.category || "gas",
    };

    // Cache the result
    writeCache(key, output);
    return output;
  } catch (error) {
    console.error("Prediction error:", error);
    return { factor: 0.15, confidence: 30, category: "gas" };
  }
};

// ─── AI Analytics ─────────────────────────────────────────────────────────────

export const getAIAnalytics = async (
  trips: Trip[],
  bills: UtilityBill[],
  overrides?: MlOverrides,
  options?: AnalyticsOptions
): Promise<AIInsight> => {
  const now = new Date();
  const last30Days = trips.filter((t) => {
    const tripDate = new Date(t.date);
    const diffDays = Math.ceil(
      Math.abs(now.getTime() - tripDate.getTime()) / (1000 * 60 * 60 * 24)
    );
    return diffDays <= 30;
  });

  const dailyEmissions = new Map<string, number>();
  last30Days.forEach((trip) => {
    const date = trip.date.split("T")[0];
    const current = dailyEmissions.get(date) || 0;
    dailyEmissions.set(date, current + (trip.co2 || 0));
  });

  const timeSeriesData = Array.from(dailyEmissions.values());

  const ewmaTravel = calculateEWMA(timeSeriesData, 0.3);
  const trend = detectTrend(timeSeriesData);
  const seasonal = analyzeSeasonalPattern(last30Days);

  const latestBill = bills.length > 0 ? bills[0].units : 0;
  const dailyEnergy = (latestBill * 0.45) / 30;

  let travelForecast: number;
  let method: string;

  if (seasonal.hasPattern && timeSeriesData.length > 7) {
    travelForecast = seasonal.weekdayAvg * 5 + seasonal.weekendAvg * 2;
    method = "Seasonal Decomposition";
  } else {
    const trendAdjustment = trend.slope * 7;
    travelForecast = (ewmaTravel + trendAdjustment) * 7;
    method = "Smart Trend Forecast";
  }

  const energyForecast = dailyEnergy * 7;
  const totalForecast = overrides?.forecast7Day ?? (travelForecast + energyForecast);
  const optimizedWeekly = totalForecast * 0.8;

  const avgDailyTravel = travelForecast / 7;
  const avgDailyEnergy = dailyEnergy;
  const totalDaily = avgDailyTravel + avgDailyEnergy;

  const cluster = overrides?.clusterLabel || assignCluster(avgDailyTravel, avgDailyEnergy);
  const patterns = minePatterns(trips);
  const anomalies = detectAnomalies(avgDailyTravel, avgDailyEnergy, trend.direction);

  const buildFallbackRecommendations = () => {
    const mostUsedVehicle =
      Object.entries(patterns.vehicleFrequency)
        .sort((a, b) => b[1] - a[1])[0]?.[0] || "vehicle";

    return [
      `Your daily footprint is ${totalDaily.toFixed(1)} kg CO2. ${totalDaily < 5.5
        ? "Great work — you're below the regional average of 5.5 kg/day!"
        : "Try to get below the regional average of 5.5 kg/day."
      }`,
      patterns.peakDays.length > 0
        ? `Peak travel on ${patterns.peakDays.join(
          " & "
        )} using ${mostUsedVehicle}. Focus optimizations on these high-impact days.`
        : `Log more trips (${trips.length}/10) to unlock pattern-based insights and personalized recommendations.`,
      anomalies.includes("energy_dominates")
        ? `Energy (${avgDailyEnergy.toFixed(
          1
        )} kg) dominates travel (${avgDailyTravel.toFixed(
          1
        )} kg). A smart thermostat could reduce this by 15-20%.`
        : trend.direction === "increasing"
          ? "Emissions are trending up. Lock in one eco-friendly change this week to reverse the trend."
          : trend.direction === "decreasing"
            ? "Great progress. Keep the momentum going."
            : "Stable pattern. Set a 10% reduction goal.",
    ];
  };

  let recommendations: string[] = [];
  const allowRemote = Boolean(apiKey) && !options?.skipRemote;

  // Cache recommendations for 6h — same conditions shouldn't re-burn quota
  const recCacheKey = cacheKey(['recs', cluster, trend.direction, String(Math.round(totalDaily * 2))]);
  const cachedRecs = readCache<string[]>(recCacheKey, RECOMMENDATION_CACHE_TTL_MS);

  if (cachedRecs) {
    recommendations = cachedRecs;
  } else if (allowRemote) {
    try {
      const mostUsedVehicle =
        Object.entries(patterns.vehicleFrequency)
          .sort((a, b) => b[1] - a[1])[0]?.[0] || "None";

      const aiPrompt = `You are a sustainability coach analyzing a user's carbon footprint.

ML ANALYSIS RESULTS (DO NOT CHANGE THESE NUMBERS):
- User Cluster: ${cluster} (from K-Means clustering)
- Daily Emissions: ${totalDaily.toFixed(1)} kg/day (Travel: ${avgDailyTravel.toFixed(
        1
      )} kg, Energy: ${avgDailyEnergy.toFixed(1)} kg)
- Regional Average: 5.5 kg/day
- Trend: ${trend.direction} (slope: ${trend.slope.toFixed(4)})
- Peak Travel Days: ${patterns.peakDays.join(", ") || "Not enough data yet"}
- Most Used Vehicle: ${mostUsedVehicle}
- Anomalies: ${anomalies.length > 0 ? anomalies.join(", ") : "None"}
- Weekly Forecast: ${totalForecast.toFixed(1)} kg
- Optimized Target: ${optimizedWeekly.toFixed(1)} kg (20% reduction)
- Data Points: ${trips.length} trips logged

TASK: Generate exactly 3 personalized, actionable recommendations.

REQUIREMENTS:
1. Use the EXACT numbers provided - do not calculate or modify them
2. Be specific and actionable ("carpool on Mondays" not "try to reduce")
3. Quantify savings when relevant ("save 2.4 kg/week")
4. Be motivating and professional in tone
5. Reference their actual patterns (peak days, vehicles, cluster)
6. Each should be 1-2 sentences
7. Match advice to cluster:
   - Eco Elite: Celebrate and maintain
   - Sustainable Standard: Show clear path to Eco Elite
   - High Impact: Focus on biggest wins
   - Green Commuter: Optimize energy
   - Energy Intensive: Focus on electricity
8. If trending up, create urgency; if down, celebrate
9. For <10 trips, encourage more logging

Return JSON with a "recommendations" array of exactly 3 strings.`;

      const aiResponse = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: aiPrompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              recommendations: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                minItems: 3,
                maxItems: 3,
              },
            },
            required: ["recommendations"],
          },
          temperature: 0.8,
        },
      });

      const aiResult = JSON.parse(aiResponse.text || "{}");

      if (aiResult.recommendations && aiResult.recommendations.length === 3) {
        recommendations = aiResult.recommendations;
        writeCache(recCacheKey, recommendations);
      } else {
        throw new Error("Invalid AI response");
      }
    } catch (error: any) {
      const isQuota = error?.message?.includes('429') || error?.message?.includes('quota') || error?.message?.includes('RESOURCE_EXHAUSTED');
      if (isQuota) {
        console.warn('Gemini quota exhausted — using fallback recommendations');
      } else {
        console.warn("AI recommendations failed, using fallback");
      }
      recommendations = buildFallbackRecommendations();
    }
  } else if (!apiKey && !options?.skipRemote) {
    recommendations = [
      `You're in the '${cluster}' cluster at ${totalDaily.toFixed(
        1
      )} kg/day. Add a Gemini API key for AI-powered insights.`,
      `Trips logged: ${trips.length}. Pattern analysis is strongest at 10+ trips.`,
      "Enable a Gemini API key for personalized recommendations based on your data.",
    ];
  } else {
    recommendations = buildFallbackRecommendations();
  }

  const uniqueDays = timeSeriesData.length;
  const totalTrips = last30Days.length;
  const latestTripTimestamp = last30Days.reduce((latest, trip) => {
    const ts = new Date(trip.date).getTime();
    return ts > latest ? ts : latest;
  }, 0);
  const daysSinceLastTrip = latestTripTimestamp
    ? Math.floor((now.getTime() - latestTripTimestamp) / (1000 * 60 * 60 * 24))
    : 30;

  const coverageScore = Math.min(uniqueDays / 30, 1);
  const volumeScore = Math.min(totalTrips / 20, 1);
  const recencyScore = Math.max(0, 1 - daysSinceLastTrip / 14);
  const stabilityScore = 1 - Math.min(Math.abs(trend.slope) / 0.5, 1);

  const mean =
    uniqueDays > 0 ? timeSeriesData.reduce((sum, value) => sum + value, 0) / uniqueDays : 0;
  const variance =
    uniqueDays > 1
      ? timeSeriesData.reduce((sum, value) => sum + Math.pow(value - mean, 2), 0) / uniqueDays
      : 0;
  const stdDev = Math.sqrt(variance);
  const variabilityScore = mean > 0 ? 1 - Math.min((stdDev / mean) / 1.5, 1) : 0;

  const seasonalStrength =
    uniqueDays > 6
      ? Math.abs(seasonal.weekdayAvg - seasonal.weekendAvg) / Math.max(seasonal.weekdayAvg, 1)
      : 0;
  const seasonalityScore = Math.min(seasonalStrength / 0.5, 1);
  const billsScore = bills.length > 0 ? 1 : 0;

  const confidenceScore =
    coverageScore * 30 +
    volumeScore * 15 +
    stabilityScore * 15 +
    variabilityScore * 15 +
    seasonalityScore * 10 +
    recencyScore * 10 +
    billsScore * 5;

  const mlConfidence = Math.round(Math.min(95, Math.max(5, confidenceScore)));

  const resolvedMethod =
    overrides?.method || (overrides?.forecast7Day != null ? 'Random Forest' : method);

  return {
    forecast: Number(totalForecast.toFixed(1)),
    optimizedForecast: Number(optimizedWeekly.toFixed(1)),
    risk: totalForecast < 15 ? "Low" : totalForecast < 30 ? "Moderate" : "High",
    message: `${trend.direction === "increasing"
      ? "Your emissions are trending up — now's a great time to make a change."
      : trend.direction === "decreasing"
        ? "Great progress! Your emissions are trending down."
        : "Your emissions are stable. Set a small reduction goal to keep improving."
      }`,
    recommendations: recommendations.slice(0, 3),
    breakdown: {
      travel: Number(avgDailyTravel.toFixed(2)),
      energy: Number(avgDailyEnergy.toFixed(2)),
    },
    dailyForecast: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map(
      (day, idx) => {
        let value = totalForecast / 7;
        if (seasonal.hasPattern) {
          const isWeekend = idx >= 5;
          value = isWeekend
            ? seasonal.weekendAvg + dailyEnergy
            : seasonal.weekdayAvg + dailyEnergy;
        }
        return { day, value: Number(value.toFixed(1)) };
      }
    ),
    patterns: {
      peakTravelDays: patterns.peakDays,
      averageDailyDistance:
        trips.length > 0
          ? Number(
            (
              trips.reduce((sum, t) => sum + t.distance, 0) / trips.length
            ).toFixed(1)
          )
          : 0,
      mostUsedVehicle:
        Object.entries(patterns.vehicleFrequency || {})
          .sort((a, b) => b[1] - a[1])[0]?.[0] || "None",
      carbonTrend: trend.direction,
    },
    mlConfidence: Math.round(mlConfidence),
  };
};

// ─── Odometer Image Scan ────────────────────────────────────────────────────────

export const verifyOdometerImage = async (
  base64Image: string
): Promise<{
  odometer: number;
  confidence: number;
  reasoning?: string;
}> => {
  if (!apiKey) {
    return { odometer: 0, confidence: 0, reasoning: "API key required" };
  }

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.0-flash",
      contents: {
        parts: [
          { inlineData: { mimeType: "image/jpeg", data: base64Image.split(",")[1] } },
          {
            text: "Extract the exact odometer reading (in km or miles) from this vehicle dashboard image. Return ONLY a valid JSON with 'odometer' (number), 'confidence' (0-100), and 'reasoning' (brief string). Try to avoid extracting trip distance, look for the main total mileage.",
          },
        ],
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            odometer: { type: Type.NUMBER },
            confidence: { type: Type.NUMBER },
            reasoning: { type: Type.STRING },
          },
          required: ["odometer", "confidence"],
        },
      },
    });

    const result = JSON.parse(response.text || "{}");

    // Ensure it's a valid positive number
    if (result.odometer < 0 || isNaN(result.odometer)) {
      result.odometer = 0;
    }

    return result;
  } catch (error) {
    console.error("Odometer scan error:", error);
    return { odometer: 0, confidence: 0, reasoning: "Extraction failed" };
  }
};

// ─── Bill Image Scan ──────────────────────────────────────────────────────────

export const verifyBillImage = async (
  base64Image: string
): Promise<{
  units: number;
  confidence: number;
  isAnomalous: boolean;
  reasoning?: string;
}> => {
  if (!apiKey) {
    return { units: 0, confidence: 0, isAnomalous: false, reasoning: "API key required" };
  }

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.0-flash",  // cheaper model OK for OCR
      contents: {
        parts: [
          { inlineData: { mimeType: "image/jpeg", data: base64Image.split(",")[1] } },
          {
            text: "Extract kWh from this electricity bill. Return JSON with units (number), confidence (0-100), isAnomalous (bool), reasoning (string).",
          },
        ],
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            units: { type: Type.NUMBER },
            confidence: { type: Type.NUMBER },
            isAnomalous: { type: Type.BOOLEAN },
            reasoning: { type: Type.STRING },
          },
          required: ["units", "confidence", "isAnomalous"],
        },
      },
    });

    const result = JSON.parse(response.text || "{}");

    if (result.units < 0) {
      result.units = 0;
      result.isAnomalous = true;
    }

    return result;
  } catch (error) {
    console.error("Bill scan error:", error);
    return { units: 0, confidence: 0, isAnomalous: false };
  }
};

// ─── Vehicle Plate Lookup (Gemini fallback only) ──────────────────────────────

export interface VehicleLookupResult {
  make: string;
  model: string;
  fuelType: string;
  vehicleType: string;
  year?: number;
  vehicleAge?: number;
  emissionNorm?: string;
  bodyType?: string;
  conditionHint?: string;
  source: 'parivahan' | 'gemini' | 'error' | 'not_found';
  error?: string;
}

/**
 * Last-resort Gemini plate lookup. Prefer /api/vehicle-lookup (Parivahan backend).
 * Only call this if the backend is unreachable for >30s.
 */
export const lookupVehicleByPlate = async (
  regNumber: string
): Promise<VehicleLookupResult> => {
  if (!apiKey) {
    return { make: '', model: '', fuelType: '', vehicleType: '', source: 'error', error: 'No Gemini API key configured.' };
  }

  const clean = regNumber.trim().toUpperCase().replace(/\s+/g, '');

  // Check cache first
  const key = cacheKey(["plate", clean]);
  const cached = readCache<VehicleLookupResult>(key, 7 * 24 * 60 * 60 * 1000);
  if (cached) return cached;

  try {
    const prompt = `You are an Indian vehicle registration expert.

Given the Indian vehicle registration number: "${clean}"

Analyze the registration number pattern and your knowledge of common Indian vehicles to infer:
1. The most likely make (manufacturer), e.g. "Honda", "Maruti Suzuki", "Royal Enfield"
2. The most likely model, e.g. "Activa 6G", "Swift", "Classic 350"
3. Fuel type: one of "petrol", "diesel", "electric", "cng", "lpg", "hybrid"
4. Vehicle type: one of "car", "motorcycle", "scooter", "bus", "truck", "auto"
5. Approximate year of manufacture (if inferable from the series)

The state code tells you the region (e.g. MH=Maharashtra, KA=Karnataka, DL=Delhi, TN=Tamil Nadu).
Use your knowledge of popular vehicles in that region and the registration series to make your best inference.
If you cannot confidently infer a field, use an empty string for text fields or null for year.

Respond ONLY with a valid JSON object:
{"make":"Honda","model":"Activa 6G","fuelType":"petrol","vehicleType":"scooter","year":2021}`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            make: { type: Type.STRING },
            model: { type: Type.STRING },
            fuelType: { type: Type.STRING },
            vehicleType: { type: Type.STRING },
            year: { type: Type.NUMBER, nullable: true }
          },
          required: ['make', 'model', 'fuelType', 'vehicleType']
        }
      }
    });

    const result = JSON.parse(response.text || '{}');
    const year = result.year ?? undefined;
    const vehicleAge = year ? new Date().getFullYear() - year : undefined;

    const output: VehicleLookupResult = {
      make: result.make || '',
      model: result.model || '',
      fuelType: result.fuelType || '',
      vehicleType: result.vehicleType || '',
      year,
      vehicleAge,
      conditionHint: vehicleAge !== undefined ? (vehicleAge <= 3 ? 'Good' : vehicleAge <= 7 ? 'Average' : 'Poor') : 'Average',
      source: 'gemini'
    };

    writeCache(key, output);
    return output;
  } catch (error) {
    console.error('Gemini plate lookup error:', error);
    return { make: '', model: '', fuelType: '', vehicleType: '', source: 'error', error: 'Gemini lookup failed.' };
  }
};

// ─── Location-Based Transport Suggestions ─────────────────────────────────────

const FALLBACK_SUGGESTIONS: Record<string, TransportSuggestion[]> = {
  default: [
    { mode: "Metro / Suburban Rail", description: "Use city metro or local trains for long commutes", co2PerKm: 0.008, savingVsCarPct: 96, icon: "fa-train" },
    { mode: "City Bus (BRT)", description: "Bus Rapid Transit or regular city buses", co2PerKm: 0.015, savingVsCarPct: 92, icon: "fa-bus" },
    { mode: "Electric Auto-Rickshaw", description: "Zero-emission last-mile connectivity", co2PerKm: 0.03, savingVsCarPct: 84, icon: "fa-motorcycle" },
    { mode: "Cycling", description: "Zero-emission for trips under 5 km", co2PerKm: 0, savingVsCarPct: 100, icon: "fa-bicycle" },
    { mode: "Carpooling", description: "Share rides to split emissions per passenger", co2PerKm: 0.048, savingVsCarPct: 75, icon: "fa-car-side" },
  ],
};

export const getLocationBasedSuggestions = async (
  city: string,
  currentVehicle: string
): Promise<TransportSuggestion[]> => {
  if (!city) return FALLBACK_SUGGESTIONS.default;

  const key = cacheKey(["location_suggestions", city]);
  const cached = readCache<TransportSuggestion[]>(key, LOCATION_CACHE_TTL_MS);
  if (cached) return cached;

  if (!apiKey) {
    return FALLBACK_SUGGESTIONS.default;
  }

  try {
    const prompt = `You are a sustainable transport expert for Indian cities.

The user is in "${city}" and currently uses "${currentVehicle}" as their primary transport.

List up to 5 practical, lower-emission transport alternatives specifically available in ${city}.
Focus on real options: city metro lines, BRT corridors, electric buses, rideshare apps, auto-rickshaws, cycling infrastructure, etc.
Mention specific app names or services where relevant (e.g., BMTC, DTC, Ola Electric, Yulu bikes, etc.).

For each option provide:
- mode: short name (max 4 words)
- description: 1 sentence describing availability in ${city}
- co2PerKm: estimated kg CO2 per km (petrol car ≈ 0.192 for reference)
- savingVsCarPct: % CO2 saving vs petrol car (0-100)
- icon: one of: fa-train, fa-bus, fa-bicycle, fa-motorcycle, fa-car-side, fa-person-walking, fa-bolt

Return JSON: { "suggestions": [ { "mode": "", "description": "", "co2PerKm": 0.0, "savingVsCarPct": 0, "icon": "" } ] }`;

    const response = await ai.models.generateContent({
      model: "gemini-2.0-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            suggestions: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  mode: { type: Type.STRING },
                  description: { type: Type.STRING },
                  co2PerKm: { type: Type.NUMBER },
                  savingVsCarPct: { type: Type.NUMBER },
                  icon: { type: Type.STRING },
                },
                required: ["mode", "description", "co2PerKm", "savingVsCarPct", "icon"],
              },
            },
          },
          required: ["suggestions"],
        },
        temperature: 0.5,
      },
    });

    const result = JSON.parse(response.text || "{}");
    const suggestions: TransportSuggestion[] = (result.suggestions || []).slice(0, 5).map((s: any) => ({
      mode: s.mode || "",
      description: s.description || "",
      co2PerKm: Math.max(0, Number(s.co2PerKm) || 0),
      savingVsCarPct: Math.min(100, Math.max(0, Number(s.savingVsCarPct) || 0)),
      icon: s.icon || "fa-bus",
    }));

    const final = suggestions.length > 0 ? suggestions : FALLBACK_SUGGESTIONS.default;
    writeCache(key, final);
    return final;
  } catch (error) {
    console.warn("Location suggestions failed, using fallback:", error);
    return FALLBACK_SUGGESTIONS.default;
  }
};
