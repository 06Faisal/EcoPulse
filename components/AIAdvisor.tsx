import React, { useState, useEffect, useRef } from 'react';
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Cell, Tooltip } from 'recharts';
import { AIInsight, TransportSuggestion } from '../services/types';
import { getLocationBasedSuggestions } from '../services/geminiService';

interface AIAdvisorProps {
  insight: AIInsight | null;
  loading: boolean;
  userCity?: string;
  mostUsedVehicle?: string;
}

// Default hardcoded fallback — always available, no API needed
const DEFAULT_SUGGESTIONS: TransportSuggestion[] = [
  { mode: "Metro / Suburban Rail", description: "Use city metro or local trains for long commutes — typically 90–96% lower emissions than cars", co2PerKm: 0.008, savingVsCarPct: 96, icon: "fa-train" },
  { mode: "City Bus (BRT)", description: "Bus Rapid Transit or regular city buses — shared transport cuts per-person emissions dramatically", co2PerKm: 0.015, savingVsCarPct: 92, icon: "fa-bus" },
  { mode: "Electric Auto / E-Rickshaw", description: "Zero-emission last-mile connectivity — great under 5 km", co2PerKm: 0.03, savingVsCarPct: 84, icon: "fa-motorcycle" },
  { mode: "Cycling", description: "Zero-emission for trips under 5 km — lowest CO₂ of any transport mode", co2PerKm: 0, savingVsCarPct: 100, icon: "fa-bicycle" },
  { mode: "Carpooling", description: "Share rides with colleagues or neighbours to split emissions per passenger", co2PerKm: 0.048, savingVsCarPct: 75, icon: "fa-car-side" },
];

// ─── Location Suggestions Section ────────────────────────────────────────────

const LocationSuggestions: React.FC<{ city: string; vehicle: string }> = ({ city, vehicle }) => {
  const [suggestions, setSuggestions] = useState<TransportSuggestion[]>(DEFAULT_SUGGESTIONS);
  const [loading, setLoading] = useState(false);
  const [source, setSource] = useState<'city' | 'default'>('default');
  const [refreshKey, setRefreshKey] = useState(0);
  const didFetch = useRef(false);

  useEffect(() => {
    // Always pre-show the default suggestions immediately (no blank state)
    setSuggestions(DEFAULT_SUGGESTIONS);

    if (!city || (didFetch.current && refreshKey === 0)) return;
    didFetch.current = true;

    let cancelled = false;
    setLoading(true);

    getLocationBasedSuggestions(city, vehicle)
      .then((s) => {
        if (!cancelled && s && s.length > 0) {
          setSuggestions(s);
          // Check if these are city-specific (vs default fallback)
          setSource(s[0].description?.includes(city) ? 'city' : 'city');
        }
      })
      .catch(() => {
        // silently keep default suggestions
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
          setSource('city');
        }
      });

    return () => { cancelled = true; };
  }, [city, vehicle, refreshKey]);

  const handleRefresh = () => {
    const key = `ecopulse_cache_location_suggestions_${city.toLowerCase().trim()}`;
    localStorage.removeItem(key);
    setRefreshKey(k => k + 1);
    didFetch.current = false;
  };

  return (
    <div className="glass p-6 rounded-[2.5rem] bg-white dark:bg-slate-900/40">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-[11px] font-black text-slate-400 uppercase tracking-[0.16em] flex items-center gap-2">
          <i className="fa-solid fa-location-dot text-emerald-500" />
          Alternatives Near You
          {city && (
            <span className="px-2 py-0.5 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded-full text-[10px] capitalize truncate max-w-[80px]">
              {city}
            </span>
          )}
          {loading && (
            <span className="px-2 py-0.5 bg-blue-500/10 text-blue-500 rounded-full text-[10px] flex items-center gap-1">
              <i className="fa-solid fa-spinner animate-spin fa-xs" /> Localising...
            </span>
          )}
        </h3>
        {city && !loading && (
          <button
            onClick={handleRefresh}
            className="text-[10px] font-black text-slate-400 hover:text-emerald-500 transition-colors uppercase tracking-widest flex items-center gap-1"
          >
            <i className="fa-solid fa-rotate-right" /> Refresh
          </button>
        )}
      </div>

      <div className="space-y-3">
        {suggestions.map((s, i) => (
          <div
            key={i}
            className="flex items-center gap-4 p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl hover:bg-emerald-50 dark:hover:bg-emerald-500/10 transition-all duration-200"
          >
            <div className="w-10 h-10 rounded-xl bg-slate-900 dark:bg-slate-800 text-emerald-500 flex items-center justify-center flex-shrink-0 text-base shadow">
              <i className={`fa-solid ${s.icon}`} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-black text-slate-800 dark:text-white text-xs">{s.mode}</div>
              <div className="text-[11px] text-slate-500 dark:text-slate-300 font-medium leading-tight mt-0.5">{s.description}</div>
            </div>
            <div className="flex-shrink-0 text-right">
              <div className="text-xs font-black text-emerald-600 dark:text-emerald-400">
                -{s.savingVsCarPct}%
              </div>
              <div className="text-[10px] text-slate-400 font-bold">
                {s.co2PerKm === 0 ? 'Zero CO₂' : `${s.co2PerKm.toFixed(3)} kg/km`}
              </div>
            </div>
          </div>
        ))}
      </div>

      {!city && (
        <div className="mt-3 p-3 bg-amber-50 dark:bg-amber-500/10 rounded-xl text-center">
          <p className="text-[10px] font-black text-amber-600 dark:text-amber-400 uppercase tracking-[0.12em]">
            <i className="fa-solid fa-location-arrow mr-1" />
            Allow location access for city-specific suggestions
          </p>
        </div>
      )}
    </div>
  );
};

// ─── Confidence Explanation ───────────────────────────────────────────────────

const ConfidenceExplainer: React.FC<{ confidence: number; tripCount: number }> = ({ confidence, tripCount }) => {
  const [show, setShow] = useState(false);

  const factors = [
    { label: 'Trip Coverage', hint: 'Days with logged trips / 30 days', improve: 'Log trips daily', weight: 30 },
    { label: 'Data Volume', hint: 'Number of trips logged', improve: `Log ${Math.max(0, 20 - tripCount)} more trips to reach max`, weight: 15 },
    { label: 'Trend Stability', hint: 'How consistent your emissions are day to day', improve: 'Consistent logging helps pattern detection', weight: 15 },
    { label: 'Data Freshness', hint: 'How recent your trips are', improve: 'Log trips within the last 14 days', weight: 10 },
    { label: 'Billing Data', hint: 'Whether electricity bills are linked', improve: 'Add your monthly electricity bill', weight: 5 },
  ];

  return (
    <div className="relative">
      <button
        onClick={() => setShow(s => !s)}
        className="text-[10px] font-black text-blue-400 hover:text-blue-500 underline underline-offset-2 uppercase tracking-widest"
      >
        Why {confidence}%?
      </button>
      {show && (
        <div className="absolute bottom-full left-0 mb-2 z-50 w-72 bg-slate-900 rounded-2xl p-4 shadow-2xl border border-slate-700 animate-in zoom-in-95">
          <h4 className="text-[11px] font-black text-white uppercase tracking-[0.14em] mb-3">Confidence Score</h4>
          <p className="text-[10px] text-slate-300 font-medium mb-3 leading-relaxed">
            This score reflects how confidently the ML model can forecast your emissions. More data = higher confidence.
          </p>
          <div className="space-y-2">
            {factors.map((f, i) => (
              <div key={i} className="text-[10px]">
                <div className="flex justify-between text-slate-200 font-bold mb-0.5">
                  <span>{f.label}</span>
                  <span className="text-slate-400">{f.weight}pts</span>
                </div>
                <div className="text-slate-400 font-medium">{f.improve}</div>
              </div>
            ))}
          </div>
          <div className="mt-3 pt-3 border-t border-slate-700 text-[10px] text-emerald-400 font-black">
            ✓ Reaches 95%+ after 20+ trips across 2 weeks
          </div>
          <button onClick={() => setShow(false)} className="absolute top-2 right-3 text-slate-500 hover:text-white text-xs">✕</button>
        </div>
      )}
    </div>
  );
};

// ─── Main AIAdvisor ───────────────────────────────────────────────────────────

const AIAdvisor: React.FC<AIAdvisorProps> = ({ insight, loading, userCity, mostUsedVehicle }) => {
  const current7DayForecast = insight?.forecast || 0;
  const isEliteEfficiency = (insight?.breakdown?.energy || 0) < 5;
  const hasInsight = Boolean(insight);

  const savingsData = [
    { name: 'Current', value: current7DayForecast, color: '#94a3b8' },
    { name: 'Optimized', value: insight?.optimizedForecast || (current7DayForecast * 0.8), color: '#10b981' }
  ];

  const recIcons = ['fa-route', 'fa-bolt-lightning', 'fa-seedling'];

  const riskColor = insight?.risk === 'High'
    ? 'text-rose-500 bg-rose-500/10'
    : insight?.risk === 'Moderate'
      ? 'text-amber-500 bg-amber-500/10'
      : 'text-emerald-500 bg-emerald-500/10';

  // Estimate trip count from patterns data (best proxy we have here)
  const estimatedTripCount = insight?.patterns?.averageDailyDistance
    ? Math.round(insight.patterns.averageDailyDistance * 10)
    : 3;

  return (
    <div className="space-y-8 pt-4 pb-24">
      {/* Header card */}
      <div className="relative animate-fade-in-up opacity-0" style={{ animationDelay: '0ms' }}>
        <div className="absolute inset-0 bg-emerald-500 blur-3xl opacity-10 rounded-full" />
        <div className="relative glass p-8 rounded-[2.5rem] text-center border-slate-200 dark:border-white/10 bg-white/50 dark:bg-slate-900/50">
          <div className="w-20 h-20 bg-slate-900 dark:bg-emerald-500 rounded-[2rem] flex items-center justify-center mx-auto mb-6 shadow-xl">
            <i className={`fa-solid fa-brain text-3xl ${loading ? 'text-emerald-400 animate-pulse' : 'text-white'}`} />
          </div>
          <h2 className="text-2xl font-black text-slate-800 dark:text-white tracking-tight">AI Advisor</h2>

          {insight && !loading && (
            <div className="flex flex-wrap items-center justify-center gap-2 mt-3">
              <span className={`px-3 py-1 text-[10px] font-black uppercase tracking-widest rounded-full ${riskColor}`}>
                {insight.risk} Risk
              </span>
              {insight.mlConfidence !== undefined && (
                <span className="px-3 py-1 text-[10px] font-black uppercase tracking-widest rounded-full bg-blue-500/10 text-blue-500">
                  {insight.mlConfidence}% ML Confidence
                </span>
              )}
              {isEliteEfficiency && (
                <span className="px-3 py-1 bg-emerald-500 text-white text-[10px] font-black uppercase tracking-widest rounded-full">
                  <i className="fa-solid fa-crown mr-1" /> Elite
                </span>
              )}
            </div>
          )}

          {/* Confidence explainer */}
          {insight?.mlConfidence !== undefined && !loading && (
            <div className="mt-3 flex justify-center">
              <ConfidenceExplainer confidence={insight.mlConfidence} tripCount={estimatedTripCount} />
            </div>
          )}

          <p className="text-sm text-slate-500 dark:text-slate-300 font-medium leading-relaxed mt-4 px-4">
            {loading
              ? hasInsight
                ? "Updating insights with ML and recommendations..."
                : "EcoPulse AI is synthesizing localized patterns..."
              : isEliteEfficiency
                ? "Excellent. Your current consumption is already at the peak sustainable tier for your region."
                : "Context-aware protocols generated by cross-referencing regional emission benchmarks."}
          </p>
        </div>
      </div>

      {/* Location-based suggestions — always visible */}
      <div className="animate-fade-in-up opacity-0" style={{ animationDelay: '100ms' }}>
        <LocationSuggestions
          city={userCity || ''}
          vehicle={mostUsedVehicle || insight?.patterns?.mostUsedVehicle || 'Car'}
        />
      </div>

      {hasInsight && (
        <>
          {/* Behavioral Patterns */}
          {insight!.patterns && (
            <div className="glass p-6 rounded-[2.5rem] bg-white dark:bg-slate-900/40 animate-fade-in-up opacity-0" style={{ animationDelay: '200ms' }}>
              <h3 className="text-[11px] font-black text-slate-400 uppercase tracking-[0.16em] mb-6 flex items-center gap-2">
                <i className="fa-solid fa-chart-line" />
                Behavioral Pattern Analysis
              </h3>

              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl">
                  <div className="text-[11px] font-black text-slate-400 uppercase mb-1">Carbon Trend</div>
                  <div className="flex items-center gap-2">
                    <i className={`fa-solid ${insight!.patterns!.carbonTrend === 'decreasing' ? 'fa-arrow-down text-emerald-500' : insight!.patterns!.carbonTrend === 'increasing' ? 'fa-arrow-up text-rose-500' : 'fa-minus text-blue-500'}`} />
                    <span className="text-sm font-black text-slate-800 dark:text-white capitalize">
                      {insight!.patterns!.carbonTrend}
                    </span>
                  </div>
                </div>

                <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl">
                  <div className="text-[11px] font-black text-slate-400 uppercase mb-1">Avg Daily Distance</div>
                  <div className="text-sm font-black text-slate-800 dark:text-white">
                    {insight!.patterns!.averageDailyDistance.toFixed(1)} <span className="text-xs text-slate-400">km</span>
                  </div>
                </div>

                <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl col-span-2">
                  <div className="text-[11px] font-black text-slate-400 uppercase mb-2">Peak Travel Days</div>
                  <div className="flex gap-2 flex-wrap">
                    {insight!.patterns!.peakTravelDays.length > 0
                      ? insight!.patterns!.peakTravelDays.map(day => (
                        <span key={day} className="px-3 py-1 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[10px] font-black rounded-lg uppercase tracking-[0.1em]">
                          {day}
                        </span>
                      ))
                      : <span className="text-[11px] text-slate-400 font-medium">Log more trips to see patterns</span>
                    }
                  </div>
                </div>

                <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl col-span-2">
                  <div className="text-[11px] font-black text-slate-400 uppercase mb-1">Most Used Vehicle</div>
                  <div className="flex items-center gap-2">
                    <i className="fa-solid fa-car text-emerald-500" />
                    <span className="text-sm font-black text-slate-800 dark:text-white">
                      {insight!.patterns!.mostUsedVehicle}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Regional Benchmarking */}
          <div className="glass p-6 rounded-[2.5rem] bg-white dark:bg-slate-900/40 animate-fade-in-up opacity-0" style={{ animationDelay: '300ms' }}>
            <h3 className="text-[11px] font-black text-slate-400 uppercase tracking-[0.16em] mb-6">Regional Benchmarking</h3>
            <div className="w-full" style={{ minWidth: 0 }}>
              <ResponsiveContainer width="100%" height={192} minWidth={0}>
                <BarChart data={savingsData} margin={{ top: 30, right: 10, left: -20, bottom: 0 }}>
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 800 }} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#1e293b', border: 'none', borderRadius: '12px', padding: '8px 12px' }}
                    labelStyle={{ color: '#10b981', fontWeight: 'bold', fontSize: 10 }}
                    itemStyle={{ color: '#fff', fontSize: 12 }}
                    formatter={(value: any) => [`${Number(value).toFixed(1)} kg`, 'CO2']}
                  />
                  <Bar dataKey="value" radius={[12, 12, 12, 12]} barSize={50} label={{
                    position: 'top',
                    fill: '#1e293b',
                    fontSize: 11,
                    fontWeight: 900,
                    formatter: (value: number) => `${value.toFixed(1)} kg`
                  }}>
                    {savingsData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="grid grid-cols-2 gap-3 mt-6">
              <div className="flex items-center gap-2 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl">
                <div className="w-3 h-3 rounded bg-slate-400" />
                <span className="text-[11px] font-black text-slate-600 dark:text-slate-300">Your Current Trend</span>
              </div>
              <div className="flex items-center gap-2 p-3 bg-emerald-50 dark:bg-emerald-500/10 rounded-xl">
                <div className="w-3 h-3 rounded bg-emerald-500" />
                <span className="text-[11px] font-black text-emerald-600 dark:text-emerald-400">Optimized Target</span>
              </div>
            </div>
          </div>

          {/* Recommendations */}
          <div className="space-y-4 animate-fade-in-up opacity-0" style={{ animationDelay: '400ms' }}>
            <div className="flex items-center justify-between px-1">
              <h3 className="text-[11px] font-black text-slate-400 uppercase tracking-[0.16em]">Personal Protocols</h3>
              <span className={`text-[10px] font-black px-2 py-1 rounded-lg tracking-[0.12em] ${isEliteEfficiency ? 'bg-emerald-500 text-white' : 'bg-emerald-500/10 text-emerald-500'}`}>
                {isEliteEfficiency ? 'ELITE STATUS' : 'CALIBRATED'}
              </span>
            </div>
            {(insight!.recommendations ?? []).map((rec, i) => (
              <div key={i} className="glass interactive p-5 rounded-[2.5rem] flex items-start gap-5 border-slate-200 dark:border-white/5 hover:bg-white dark:hover:bg-slate-800 transition-all duration-300 group">
                <div className="w-14 h-14 rounded-2xl bg-slate-900 dark:bg-slate-800 text-emerald-500 flex items-center justify-center flex-shrink-0 text-2xl shadow-lg transition-transform duration-300 group-hover:scale-110 group-active:scale-95">
                  <i className={`fa-solid ${recIcons[i % recIcons.length]}`} />
                </div>
                <div>
                  <h4 className="font-black text-slate-800 dark:text-white text-xs mb-1 uppercase tracking-tight">
                    {isEliteEfficiency ? 'Maintenance Protocol' : `Level ${i + 1} Optimization`}
                  </h4>
                  <p className="text-xs text-slate-500 dark:text-slate-300 leading-relaxed font-medium">{rec}</p>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {loading && !hasInsight && (
        <div className="flex flex-col items-center justify-center py-24">
          <div className="w-12 h-12 border-4 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin mb-6" />
          <p className="text-[11px] font-black text-slate-400 uppercase tracking-[0.16em] animate-pulse"> Analyzing...</p>
        </div>
      )}
    </div>
  );
};

export default AIAdvisor;
