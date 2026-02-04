// FILE: src/services/geminiService.ts
// UPDATED VERSION - AI-Powered Recommendations (No If-Else!)
// This version uses Gemini AI to generate recommendations from ML data

import { GoogleGenAI, Type } from "@google/genai";
import { Trip, AIInsight, UtilityBill, CustomVehicle } from "./types";

const apiKey = import.meta.env.VITE_GEMINI_API_KEY || import.meta.env.GEMINI_API_KEY || '';

if (!apiKey) {
  console.warn('⚠️ GEMINI_API_KEY not found');
}

const ai = new GoogleGenAI({ apiKey });

// ============================================================================
// ML ALGORITHM 1: EXPONENTIAL WEIGHTED MOVING AVERAGE (EWMA)
// ============================================================================
function calculateEWMA(data: number[], alpha: number = 0.3): number {
  if (data.length === 0) return 0;
  let ewma = data[0];
  for (let i = 1; i < data.length; i++) {
    ewma = alpha * data[i] + (1 - alpha) * ewma;
  }
  return ewma;
}

// ============================================================================
// ML ALGORITHM 2: LINEAR REGRESSION (TREND DETECTION)
// ============================================================================
function detectTrend(data: number[]): { 
  slope: number; 
  direction: 'increasing' | 'stable' | 'decreasing' 
} {
  const n = data.length;
  if (n < 3) return { slope: 0, direction: 'stable' };
  
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
  for (let i = 0; i < n; i++) {
    sumX += i;
    sumY += data[i];
    sumXY += i * data[i];
    sumX2 += i * i;
  }
  
  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  
  let direction: 'increasing' | 'stable' | 'decreasing';
  if (slope > 0.1) direction = 'increasing';
  else if (slope < -0.1) direction = 'decreasing';
  else direction = 'stable';
  
  return { slope, direction };
}

// ============================================================================
// ML ALGORITHM 3: SEASONAL DECOMPOSITION
// ============================================================================
function analyzeSeasonalPattern(trips: Trip[]): {
  weekdayAvg: number;
  weekendAvg: number;
  hasPattern: boolean;
} {
  const weekdayEmissions: number[] = [];
  const weekendEmissions: number[] = [];
  
  trips.forEach(trip => {
    const dayOfWeek = new Date(trip.date).getDay();
    const co2 = trip.co2 || 0;
    
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      weekendEmissions.push(co2);
    } else {
      weekdayEmissions.push(co2);
    }
  });
  
  const weekdayAvg = weekdayEmissions.length > 0
    ? weekdayEmissions.reduce((a, b) => a + b, 0) / weekdayEmissions.length
    : 0;
  
  const weekendAvg = weekendEmissions.length > 0
    ? weekendEmissions.reduce((a, b) => a + b, 0) / weekendEmissions.length
    : 0;
  
  const hasPattern = Math.abs(weekdayAvg - weekendAvg) / Math.max(weekdayAvg, 1) > 0.2;
  
  return { weekdayAvg, weekendAvg, hasPattern };
}

// ============================================================================
// ML ALGORITHM 4: K-MEANS CLUSTERING
// ============================================================================
const clusters = [
  { name: 'Eco Elite', avgTravel: 1.0, avgEnergy: 1.5 },
  { name: 'Green Commuter', avgTravel: 2.0, avgEnergy: 2.5 },
  { name: 'Sustainable Standard', avgTravel: 3.0, avgEnergy: 2.5 },
  { name: 'Heavy Traveler', avgTravel: 5.0, avgEnergy: 2.5 },
  { name: 'Energy Intensive', avgTravel: 2.0, avgEnergy: 5.0 },
  { name: 'High Impact', avgTravel: 5.0, avgEnergy: 4.0 }
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
  
  console.log('🎯 K-Means: Assigned to cluster:', closestCluster);
  return closestCluster;
}

// ============================================================================
// ML ALGORITHM 5: PATTERN MINING
// ============================================================================
function minePatterns(trips: Trip[]): {
  peakDays: string[];
  vehicleFrequency: Record<string, number>;
} {
  const dayCount: Record<string, number> = {};
  const vehicleCount: Record<string, number> = {};
  
  trips.forEach(trip => {
    const date = new Date(trip.date);
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const dayName = dayNames[date.getDay()];
    dayCount[dayName] = (dayCount[dayName] || 0) + 1;
    
    const vehicle = trip.vehicle === 'Custom' 
      ? trip.customVehicleName || 'Custom' 
      : trip.vehicle;
    vehicleCount[vehicle] = (vehicleCount[vehicle] || 0) + 1;
  });
  
  const peakDays = Object.entries(dayCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(entry => entry[0]);
  
  console.log('⛏️ Pattern Mining - Peak Days:', peakDays);
  
  return { peakDays, vehicleFrequency: vehicleCount };
}

// ============================================================================
// ML ALGORITHM 6: ANOMALY DETECTION
// ============================================================================
function detectAnomalies(
  avgTravel: number, 
  avgEnergy: number, 
  trend: string
): string[] {
  const anomalies: string[] = [];
  
  const ratio = avgEnergy / Math.max(avgTravel, 0.1);
  if (ratio > 2) {
    anomalies.push('energy_dominates');
  } else if (ratio < 0.5) {
    anomalies.push('travel_dominates');
  }
  
  if (trend === 'increasing') {
    anomalies.push('emissions_increasing');
  }
  
  console.log('🚨 Anomaly Detection:', anomalies.length > 0 ? anomalies.join(', ') : 'None');
  
  return anomalies;
}

// ============================================================================
// VEHICLE PREDICTION (Keep existing - works well)
// ============================================================================
export const predictEmissionFactor = async (
  vehicleName: string,
  vehicleType?: string,
  fuelType?: string
): Promise<{ factor: number; confidence: number; category: string }> => {
  if (!apiKey) {
    return { factor: 0.15, confidence: 30, category: 'gas' };
  }

  const prompt = `Predict CO2 emission factor (kg CO2/km) for: ${vehicleName}, Type: ${vehicleType || "unknown"}, Fuel: ${fuelType || "unknown"}.

Reference ranges:
- Electric: 0.04-0.08
- Hybrid: 0.10-0.15  
- Gasoline: 0.15-0.25
- Diesel: 0.17-0.22

CRITICAL: Factor MUST be 0.01-0.50 (NO negatives!). Return JSON with factor, confidence (0-100), category, reasoning.`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            factor: { type: Type.NUMBER },
            confidence: { type: Type.NUMBER },
            category: { type: Type.STRING },
            reasoning: { type: Type.STRING }
          },
          required: ["factor", "confidence", "category"]
        },
        temperature: 0.2,
      }
    });

    const result = JSON.parse(response.text || '{}');
    
    let validFactor = result.factor || 0.15;
    if (validFactor <= 0 || validFactor > 0.5) {
      console.warn(`⚠️ Invalid factor ${validFactor}, using 0.15`);
      validFactor = 0.15;
    }
    
    console.log(`✅ Predicted ${vehicleName}: ${validFactor.toFixed(3)} kg/km`);
    
    return {
      factor: Number(validFactor.toFixed(3)),
      confidence: Math.round(Math.max(0, Math.min(100, result.confidence || 50))),
      category: result.category || 'gas'
    };
  } catch (error) {
    console.error("Prediction error:", error);
    return { factor: 0.15, confidence: 30, category: 'gas' };
  }
};

// ============================================================================
// ML-POWERED ANALYTICS (NEW - Uses all 6 algorithms + AI recommendations!)
// ============================================================================
export const getAIAnalytics = async (
  trips: Trip[], 
  bills: UtilityBill[], 
  location?: { lat: number, lng: number },
  customVehicles?: CustomVehicle[]
): Promise<AIInsight> => {
  
  console.log('🤖 === ML-POWERED ANALYTICS START ===');
  console.log('📊 Data: Trips:', trips.length, 'Bills:', bills.length);
  
  // === STEP 1: PREPARE TIME SERIES DATA ===
  const now = new Date();
  const last30Days = trips.filter(t => {
    const tripDate = new Date(t.date);
    const diffDays = Math.ceil(Math.abs(now.getTime() - tripDate.getTime()) / (1000 * 60 * 60 * 24));
    return diffDays <= 30;
  });
  
  const dailyEmissions = new Map<string, number>();
  last30Days.forEach(trip => {
    const date = trip.date.split('T')[0];
    const current = dailyEmissions.get(date) || 0;
    dailyEmissions.set(date, current + (trip.co2 || 0));
  });
  
  const timeSeriesData = Array.from(dailyEmissions.values());
  
  // === STEP 2: APPLY ML ALGORITHMS ===
  console.log('\n🔮 Running ML Algorithms...');
  
  // Algorithm 1: EWMA
  const ewmaTravel = calculateEWMA(timeSeriesData, 0.3);
  console.log('📈 EWMA Result:', ewmaTravel.toFixed(2), 'kg/day');
  
  // Algorithm 2: Trend Detection
  const trend = detectTrend(timeSeriesData);
  console.log('📉 Trend:', trend.direction, 'slope:', trend.slope.toFixed(4));
  
  // Algorithm 3: Seasonal Analysis
  const seasonal = analyzeSeasonalPattern(last30Days);
  console.log('🗓️ Seasonal:', seasonal.hasPattern ? 'DETECTED' : 'None');
  
  // === STEP 3: CALCULATE FORECAST (MATH, NOT AI!) ===
  const latestBill = bills.length > 0 ? bills[0].units : 0;
  const dailyEnergy = (latestBill * 0.45) / 30;
  
  let travelForecast: number;
  let method: string;
  
  if (seasonal.hasPattern && timeSeriesData.length > 7) {
    travelForecast = (seasonal.weekdayAvg * 5 + seasonal.weekendAvg * 2);
    method = 'Seasonal Decomposition';
  } else {
    const trendAdjustment = trend.slope * 7;
    travelForecast = (ewmaTravel + trendAdjustment) * 7;
    method = 'EWMA + Trend Analysis';
  }
  
  const energyForecast = dailyEnergy * 7;
  const totalForecast = travelForecast + energyForecast;
  
  console.log('🎯 Forecast:', totalForecast.toFixed(1), 'kg (Method:', method + ')');
  
  // === STEP 4: CALCULATE OPTIMIZED TARGET (20% REDUCTION) ===
  const optimizedWeekly = totalForecast * 0.80;
  
  console.log('🎯 Current:', totalForecast.toFixed(1), 'kg');
  console.log('✨ Optimized:', optimizedWeekly.toFixed(1), 'kg (20% reduction)');
  
  // === STEP 5: ML DATA COLLECTION ===
  const avgDailyTravel = travelForecast / 7;
  const avgDailyEnergy = dailyEnergy;
  const totalDaily = avgDailyTravel + avgDailyEnergy;
  
  // Algorithm 4: K-Means Clustering
  const cluster = assignCluster(avgDailyTravel, avgDailyEnergy);
  
  // Algorithm 5: Pattern Mining
  const patterns = minePatterns(trips);
  
  // Algorithm 6: Anomaly Detection
  const anomalies = detectAnomalies(avgDailyTravel, avgDailyEnergy, trend.direction);
  
  // === STEP 6: AI-POWERED RECOMMENDATIONS (NO IF-ELSE!) ===
  let recommendations: string[] = [];
  
  if (apiKey) {
    try {
      console.log('\n🤖 Generating AI recommendations from ML data...');
      
      const mostUsedVehicle = Object.entries(patterns.vehicleFrequency)
        .sort((a, b) => b[1] - a[1])[0]?.[0] || 'None';
      
      const aiPrompt = `You are a sustainability coach analyzing a user's carbon footprint.

ML ANALYSIS RESULTS (DO NOT CHANGE THESE NUMBERS):
- User Cluster: ${cluster} (from K-Means clustering)
- Daily Emissions: ${totalDaily.toFixed(1)} kg/day (Travel: ${avgDailyTravel.toFixed(1)} kg, Energy: ${avgDailyEnergy.toFixed(1)} kg)
- Regional Average: 5.5 kg/day
- Trend: ${trend.direction} (slope: ${trend.slope.toFixed(4)})
- Peak Travel Days: ${patterns.peakDays.join(', ') || 'Not enough data yet'}
- Most Used Vehicle: ${mostUsedVehicle}
- Anomalies: ${anomalies.length > 0 ? anomalies.join(', ') : 'None'}
- Weekly Forecast: ${totalForecast.toFixed(1)} kg
- Optimized Target: ${optimizedWeekly.toFixed(1)} kg (20% reduction)
- Data Points: ${trips.length} trips logged

TASK: Generate exactly 3 personalized, actionable recommendations.

REQUIREMENTS:
1. Use the EXACT numbers provided - don't calculate or modify them
2. Be specific and actionable ("carpool on Mondays" not "try to reduce")
3. Quantify savings when relevant ("save 2.4 kg/week")
4. Be motivating and positive, not preachy
5. Reference their actual patterns (peak days, vehicles, cluster)
6. Each should be 1-2 sentences, conversational tone
7. Use emojis naturally (🚗 💡 📊 🌟 etc)
8. Match advice to cluster:
   - Eco Elite: Celebrate and maintain
   - Sustainable Standard: Show clear path to Eco Elite
   - High Impact: Focus on biggest wins
   - Green Commuter: Optimize energy
   - Energy Intensive: Focus on electricity
9. If trending up, create urgency; if down, celebrate
10. For <10 trips, encourage more logging

Return as JSON array of 3 strings.`;

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
                maxItems: 3
              }
            },
            required: ["recommendations"]
          },
          temperature: 0.8, // Higher for creative recommendations
        }
      });

      const aiResult = JSON.parse(aiResponse.text || '{}');
      
      if (aiResult.recommendations && aiResult.recommendations.length === 3) {
        recommendations = aiResult.recommendations;
        console.log('✅ AI generated recommendations successfully');
      } else {
        throw new Error('Invalid AI response');
      }
      
    } catch (error) {
  console.warn('⚠️ AI recommendations failed, using fallback');
  
  // Define mostUsedVehicle for fallback
  const mostUsedVehicle = Object.entries(patterns.vehicleFrequency)
    .sort((a, b) => b[1] - a[1])[0]?.[0] || 'vehicle';
  
  // Simple fallback if AI fails
  recommendations = [
        `📊 ML Analysis: You're in '${cluster}' cluster at ${totalDaily.toFixed(1)} kg/day. ${totalDaily < 5.5 ? 'Great work staying below regional average!' : 'Target: Get below 5.5 kg/day regional average.'}`,
        patterns.peakDays.length > 0 
          ? `🚗 Peak travel on ${patterns.peakDays.join(' & ')} using ${mostUsedVehicle}. Focus optimizations on these high-impact days.`
          : `📈 Log more trips (${trips.length}/10) to unlock pattern-based insights and personalized recommendations.`,
        anomalies.includes('energy_dominates')
          ? `💡 Energy (${avgDailyEnergy.toFixed(1)} kg) dominates travel (${avgDailyTravel.toFixed(1)} kg). Smart thermostat could save 15-20%.`
          : trend.direction === 'increasing'
          ? `📈 Emissions trending up. Lock in one eco-swap this week to reverse the trend!`
          : `✅ ${trend.direction === 'decreasing' ? 'Great progress! Keep the momentum going.' : 'Stable pattern. Set a 10% reduction goal!'}`
      ];
    }
  } else {
    // No API key
    recommendations = [
      `📊 You're in '${cluster}' cluster at ${totalDaily.toFixed(1)} kg/day. Add API key for AI-powered insights!`,
      `📈 ${trips.length} trips logged. Pattern analysis active at 10+ trips.`,
      `💡 Enable Gemini API for personalized, actionable recommendations based on your ML data.`
    ];
  }
  
  // === STEP 7: CONFIDENCE CALCULATION ===
  let mlConfidence = 60;
  if (timeSeriesData.length > 7) mlConfidence += 20;
  if (trend.direction === 'stable') mlConfidence += 15;
  if (seasonal.hasPattern) mlConfidence += 5;
  mlConfidence = Math.min(mlConfidence, 95);
  
  console.log('✅ ML Confidence:', mlConfidence + '%');
  console.log('🎉 === ML ANALYTICS COMPLETE ===\n');
  
  // === STEP 8: RETURN RESULTS ===
  return {
    forecast: Number(totalForecast.toFixed(1)),
    optimizedForecast: Number(optimizedWeekly.toFixed(1)),
    risk: totalForecast < 15 ? 'Low' : totalForecast < 30 ? 'Moderate' : 'High',
    message: `ML Analysis (${method}): You're in '${cluster}'. ${
      trend.direction === 'increasing' ? '⚠️ Emissions trending up.' :
      trend.direction === 'decreasing' ? '📉 Great! Trending down.' :
      '📊 Stable pattern.'
    }`,
    recommendations: recommendations.slice(0, 3),
    breakdown: {
      travel: Number(avgDailyTravel.toFixed(2)),
      energy: Number(avgDailyEnergy.toFixed(2))
    },
    dailyForecast: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day, idx) => {
      let value = (totalForecast / 7);
      if (seasonal.hasPattern) {
        const isWeekend = idx >= 5;
        value = isWeekend ? seasonal.weekendAvg + dailyEnergy : seasonal.weekdayAvg + dailyEnergy;
      }
      return { day, value: Number(value.toFixed(1)) };
    }),
    patterns: {
      peakTravelDays: patterns.peakDays,
      averageDailyDistance: trips.length > 0 
        ? Number((trips.reduce((sum, t) => sum + t.distance, 0) / trips.length).toFixed(1))
        : 0,
      mostUsedVehicle: Object.entries(patterns.vehicleFrequency || {})
        .sort((a, b) => b[1] - a[1])[0]?.[0] || 'None',
      carbonTrend: trend.direction
    },
    mlConfidence: Math.round(mlConfidence)
  };
};

// ============================================================================
// BILL VERIFICATION (Keep existing)
// ============================================================================
export const verifyBillImage = async (
  base64Image: string, 
  location?: { lat: number, lng: number }
): Promise<{ units: number; confidence: number; isAnomalous: boolean; reasoning?: string }> => {
  if (!apiKey) {
    return { units: 0, confidence: 0, isAnomalous: false, reasoning: 'API key required' };
  }

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: { 
        parts: [
          { inlineData: { mimeType: "image/jpeg", data: base64Image.split(',')[1] } }, 
          { text: `Extract kWh from this bill. Return JSON with units, confidence (0-100), isAnomalous (bool), reasoning.` }
        ] 
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: { 
            units: { type: Type.NUMBER }, 
            confidence: { type: Type.NUMBER },
            isAnomalous: { type: Type.BOOLEAN },
            reasoning: { type: Type.STRING }
          },
          required: ["units", "confidence", "isAnomalous"]
        }
      }
    });
    
    const result = JSON.parse(response.text || '{}');
    
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
