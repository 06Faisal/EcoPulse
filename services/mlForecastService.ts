// FILE: src/services/mlForecastService.ts
// ML-POWERED WEEKLY FORECAST ENGINE
// Copy this entire file to your project

import { Trip, UtilityBill } from './types';

interface TimeSeriesPoint {
  date: string;
  value: number;
}

/**
 * ML FORECAST ENGINE
 * Uses EWMA, Linear Regression, and Seasonal Decomposition
 */
export class MLForecastEngine {
  
  /**
   * ALGORITHM 1: Exponential Weighted Moving Average (EWMA)
   * Recent data gets more weight than historical data
   * 
   * @param data - Array of daily CO2 values
   * @param alpha - Smoothing factor (0-1). Higher = more weight to recent data
   * @returns Smoothed prediction
   */
  private calculateEWMA(data: number[], alpha: number = 0.3): number {
    if (data.length === 0) return 0;
    
    let ewma = data[0]; // Initialize with first value
    
    for (let i = 1; i < data.length; i++) {
      ewma = alpha * data[i] + (1 - alpha) * ewma;
    }
    
    return ewma;
  }
  
  /**
   * ALGORITHM 2: Linear Regression for Trend Detection
   * Calculates if emissions are increasing/stable/decreasing
   * 
   * @param data - Array of daily CO2 values
   * @returns Slope and trend direction
   */
  private detectTrend(data: number[]): { 
    slope: number; 
    direction: 'increasing' | 'stable' | 'decreasing' 
  } {
    const n = data.length;
    if (n < 3) return { slope: 0, direction: 'stable' };
    
    // Linear regression: y = mx + b
    // Calculate slope (m) using least squares method
    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
    
    for (let i = 0; i < n; i++) {
      sumX += i;
      sumY += data[i];
      sumXY += i * data[i];
      sumX2 += i * i;
    }
    
    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    
    // Classify trend based on slope
    let direction: 'increasing' | 'stable' | 'decreasing';
    if (slope > 0.1) direction = 'increasing';
    else if (slope < -0.1) direction = 'decreasing';
    else direction = 'stable';
    
    return { slope, direction };
  }
  
  /**
   * ALGORITHM 3: Seasonal Pattern Analysis
   * Detects weekday vs weekend emission patterns
   * 
   * @param trips - All user trips
   * @returns Weekday and weekend averages
   */
  private analyzeSeasonalPattern(trips: Trip[]): {
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
        // Saturday (6) or Sunday (0)
        weekendEmissions.push(co2);
      } else {
        // Monday (1) - Friday (5)
        weekdayEmissions.push(co2);
      }
    });
    
    const weekdayAvg = weekdayEmissions.length > 0
      ? weekdayEmissions.reduce((a, b) => a + b, 0) / weekdayEmissions.length
      : 0;
    
    const weekendAvg = weekendEmissions.length > 0
      ? weekendEmissions.reduce((a, b) => a + b, 0) / weekendEmissions.length
      : 0;
    
    // Pattern exists if weekday/weekend differ by >20%
    const hasPattern = Math.abs(weekdayAvg - weekendAvg) / Math.max(weekdayAvg, 1) > 0.2;
    
    return { weekdayAvg, weekendAvg, hasPattern };
  }
  
  /**
   * MAIN FORECAST FUNCTION
   * Combines all ML algorithms for accurate weekly prediction
   */
  public forecastWeekly(trips: Trip[], bills: UtilityBill[]): {
    forecast: number;
    confidence: number;
    method: string;
    breakdown: { travel: number; energy: number };
    dailyForecast: { day: string; value: number }[];
    trend: 'increasing' | 'stable' | 'decreasing';
  } {
    
    // === STEP 1: PREPARE TIME SERIES DATA ===
    const now = new Date();
    const last30Days = trips.filter(t => {
      const tripDate = new Date(t.date);
      const diffDays = Math.ceil(Math.abs(now.getTime() - tripDate.getTime()) / (1000 * 60 * 60 * 24));
      return diffDays <= 30;
    });
    
    // Group trips by day and sum CO2
    const dailyEmissions = new Map<string, number>();
    last30Days.forEach(trip => {
      const date = trip.date.split('T')[0];
      const current = dailyEmissions.get(date) || 0;
      dailyEmissions.set(date, current + (trip.co2 || 0));
    });
    
    const timeSeriesData = Array.from(dailyEmissions.values());
    
    console.log('📊 ML Forecast - Data points:', timeSeriesData.length);
    
    // === STEP 2: APPLY ALGORITHM 1 - EWMA ===
    const ewmaTravel = this.calculateEWMA(timeSeriesData, 0.3);
    console.log('📈 EWMA Result:', ewmaTravel.toFixed(2), 'kg/day');
    
    // === STEP 3: APPLY ALGORITHM 2 - TREND DETECTION ===
    const trend = this.detectTrend(timeSeriesData);
    console.log('📉 Trend Detection:', trend.direction, 'slope:', trend.slope.toFixed(4));
    
    // === STEP 4: APPLY ALGORITHM 3 - SEASONAL ANALYSIS ===
    const seasonal = this.analyzeSeasonalPattern(last30Days);
    console.log('🗓️ Seasonal Pattern:', seasonal.hasPattern ? 'DETECTED' : 'None', 
                '(Weekday:', seasonal.weekdayAvg.toFixed(2), 'Weekend:', seasonal.weekendAvg.toFixed(2), ')');
    
    // === STEP 5: ENERGY FORECAST ===
    const latestBill = bills.length > 0 ? bills[0].units : 0;
    const dailyEnergy = (latestBill * 0.45) / 30;
    
    // === STEP 6: COMBINE FORECASTS ===
    let travelForecast: number;
    let method: string;
    
    if (seasonal.hasPattern && timeSeriesData.length > 7) {
      // Use seasonal decomposition (5 weekdays + 2 weekend days)
      travelForecast = (seasonal.weekdayAvg * 5 + seasonal.weekendAvg * 2);
      method = 'Seasonal Decomposition';
    } else {
      // Use EWMA with trend adjustment
      const trendAdjustment = trend.slope * 7; // Project trend 7 days forward
      travelForecast = (ewmaTravel + trendAdjustment) * 7;
      method = 'EWMA + Trend Analysis';
    }
    
    const energyForecast = dailyEnergy * 7;
    const totalForecast = travelForecast + energyForecast;
    
    console.log('🎯 Final Forecast:', totalForecast.toFixed(1), 'kg (Method:', method + ')');
    
    // === STEP 7: CONFIDENCE CALCULATION ===
    let confidence = 50; // Base confidence
    
    if (timeSeriesData.length > 7) confidence += 20;   // Sufficient data
    if (timeSeriesData.length > 14) confidence += 10;  // Rich dataset
    if (trend.direction === 'stable') confidence += 15; // Predictable pattern
    if (seasonal.hasPattern) confidence += 5;           // Clear weekly cycle
    
    confidence = Math.min(confidence, 95); // Cap at 95%
    
    // === STEP 8: DAILY BREAKDOWN WITH SEASONAL ADJUSTMENT ===
    const dailyAvg = totalForecast / 7;
    const dailyForecast = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day, idx) => {
      let value = dailyAvg;
      
      // Apply seasonal pattern if detected
      if (seasonal.hasPattern) {
        const isWeekend = idx >= 5; // Saturday (5), Sunday (6)
        if (isWeekend) {
          value = seasonal.weekendAvg + dailyEnergy;
        } else {
          value = seasonal.weekdayAvg + dailyEnergy;
        }
      }
      
      return { day, value: Number(value.toFixed(1)) };
    });
    
    return {
      forecast: Number(totalForecast.toFixed(1)),
      confidence: Math.round(confidence),
      method,
      breakdown: {
        travel: Number((travelForecast / 7).toFixed(2)),
        energy: Number(dailyEnergy.toFixed(2))
      },
      dailyForecast,
      trend: trend.direction
    };
  }
}

// Export singleton instance
export const mlForecast = new MLForecastEngine();
