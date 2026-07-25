import React, { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip, LabelList, ReferenceLine } from 'recharts';
import { Trip, AIInsight, UserProfile, UtilityBill } from '../services/types';
import { getCO2Equivalents } from '../services/co2Equivalents';
import ShareCard from './ShareCard';

interface DashboardProps {
  trips: Trip[];
  bills: UtilityBill[];
  electricity: number;
  insight: AIInsight | null;
  user: UserProfile;
  loading: boolean;
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-slate-900 border border-emerald-500/30 p-3 rounded-2xl shadow-xl">
        <p className="text-[0.625rem] font-bold text-emerald-400 uppercase mb-1 tracking-[0.08em]">{label}</p>
        <p className="text-sm font-bold text-white">{Number(payload[0].value).toFixed(2)} <span className="text-[0.625rem] opacity-60">kg</span></p>
      </div>
    );
  }
  return null;
};

const ChartValueLabel = ({ x, y, value }: any) => {
  if (value === null || value === undefined) return null;
  return (
    <text x={x} y={y - 10} textAnchor="middle" fill="#94a3b8" fontSize={9} fontWeight={700}>
      {Number(value).toFixed(1)}
    </text>
  );
};

// ─── Odometer Effect ────────────────────────────────────────────────────────────

const Odometer: React.FC<{ value: number }> = ({ value }) => {
  const [displayValue, setDisplayValue] = useState(0);

  useEffect(() => {
    let startTimestamp: number;
    const duration = 1500; // 1.5s
    const startValue = 0;

    const step = (timestamp: number) => {
      if (!startTimestamp) startTimestamp = timestamp;
      const progress = Math.min((timestamp - startTimestamp) / duration, 1);
      // easeOutExpo
      const ease = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
      setDisplayValue(startValue + (value - startValue) * ease);

      if (progress < 1) {
        window.requestAnimationFrame(step);
      }
    };

    window.requestAnimationFrame(step);
  }, [value]);

  return <span>{displayValue.toFixed(2)}</span>;
};

// ─── Weekly Goal Ring ─────────────────────────────────────────────────────────

const WeeklyRing: React.FC<{ used: number; goal: number }> = ({ used, goal }) => {
  const pct = goal > 0 ? Math.min(used / goal, 1) : 0;
  const radius = 28;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - pct);
  const over = pct >= 1;

  return (
    <div className="flex flex-col items-center justify-center">
      <div className="relative w-20 h-20">
        <svg className="w-20 h-20 -rotate-90" viewBox="0 0 72 72">
          <circle cx="36" cy="36" r={radius} fill="none" stroke="#e2e8f0" strokeWidth="6" className="dark:stroke-slate-700" />
          <circle
            cx="36" cy="36" r={radius}
            fill="none"
            stroke={over ? '#f43f5e' : '#10b981'}
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
            className="transition-all duration-700"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={`text-xs font-bold ${over ? 'text-rose-500' : 'text-emerald-500'}`}>
            {Math.round(pct * 100)}%
          </span>
          <span className="text-[0.5625rem] text-slate-400 font-bold">WEEK</span>
        </div>
      </div>
      <div className="text-[0.625rem] font-bold text-slate-400 uppercase tracking-[0.08em] mt-1">
        {used.toFixed(1)} / {goal} kg
      </div>
    </div>
  );
};

// ─── Dashboard ────────────────────────────────────────────────────────────────

const Dashboard: React.FC<DashboardProps> = ({ trips, bills, electricity, insight, user, loading }) => {
  const [showShare, setShowShare] = useState(false);

  const todayStr = new Date().toISOString().split('T')[0];
  const dailyBehaviors = trips.filter(t => t.date.split('T')[0] === todayStr);
  const dailyTotal = Number(dailyBehaviors.reduce((acc, t) => acc + (t.co2 || 0), 0)) || 0;
  const progressPercent = Math.min((dailyTotal / (user.dailyGoal || 1)) * 100, 100);
  const overLimit = dailyTotal > user.dailyGoal;

  // Weekly CO₂ (last 7 days)
  const weekCO2 = (() => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 7);
    return trips
      .filter(t => new Date(t.date) >= cutoff)
      .reduce((s, t) => s + t.co2, 0);
  })();
  const weeklyGoal = user.weeklyGoal ?? 50; // default 50 kg/week

  // CO₂ equivalents for daily total
  const equivalents = getCO2Equivalents(dailyTotal);

  const getLast7DaysData = () => {
    const dates = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      dates.push(d.toISOString().split('T')[0]);
    }
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    return dates.map(dateStr => {
      const date = new Date(dateStr + 'T12:00:00');
      const dayName = dayNames[date.getDay()];
      const dayTrips = trips.filter(trip => trip.date.startsWith(dateStr));
      const dayTotal = dayTrips.reduce((sum, trip) => sum + (trip.co2 || 0), 0);
      return { name: dayName, value: dayTotal > 0 ? Number(dayTotal.toFixed(1)) : null };
    });
  };

  const chartData = getLast7DaysData();
  // A trend line drawn through a single point is noise, so the chart only
  // appears once there is something to trend.
  const loggedDays = chartData.filter(d => d.value !== null).length;

  return (
    <div className="space-y-6 pt-4 pb-4">
      {/* Responsive layout: 3 columns on large screens, stacks on mobile */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Main Column (2/3 width on desktop) */}
        <div className="lg:col-span-2 space-y-6">
          {/* Today's reading. The hero is the meter itself: one large value in
              tabular figures, the daily limit marked on the scale beneath it. */}
          <div className="glass p-6 sm:p-7 rounded-card border-slate-200 dark:border-white/10 animate-fade-in-up opacity-0" style={{ animationDelay: '0ms' }}>
            <div className="flex justify-between items-start gap-4">
              <div className="min-w-0">
                <span className="eyebrow">Today</span>
                <div className="flex items-baseline gap-2 mt-2">
                  <h2 className="metric-xl text-[2.75rem] sm:text-5xl text-slate-900 dark:text-white">
                    <Odometer value={dailyTotal} />
                  </h2>
                  <span className="unit text-sm text-slate-500 dark:text-slate-400">kg CO₂e</span>
                </div>
              </div>
              <div
                className={`shrink-0 px-2.5 py-1 rounded-md text-[0.6875rem] font-semibold ${
                  overLimit
                    ? 'bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-400'
                    : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400'
                }`}
              >
                {overLimit ? 'Over limit' : 'Within limit'}
              </div>
            </div>

            {/* Scale. A single flat bar with a tick at the daily limit reads as a
                gauge; the previous gradient fill read as decoration. */}
            <div className="mt-6">
              <div className="relative h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all duration-700 ease-out rounded-full ${
                    overLimit ? 'bg-orange-500' : 'bg-emerald-500'
                  }`}
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
              <div className="flex justify-between mt-2">
                <span className="metric text-[0.625rem] text-slate-400">0</span>
                <span className="metric text-[0.625rem] text-slate-400">
                  {user.dailyGoal} kg limit
                </span>
              </div>
            </div>

            {/* Equivalents translate an abstract figure into something physical.
                Only meaningful once something has actually been logged. */}
            {dailyBehaviors.length === 0 ? (
              <p className="mt-6 pt-5 border-t border-slate-100 dark:border-slate-800 text-sm text-slate-500 dark:text-slate-400">
                Nothing logged today. Add a trip on the{' '}
                <span className="font-semibold text-slate-700 dark:text-slate-200">Log</span> tab and
                your reading will appear here.
              </p>
            ) : (
              equivalents.length > 0 && (
                <div className="mt-6 pt-5 border-t border-slate-100 dark:border-slate-800">
                  <p className="eyebrow mb-3">Same as</p>
                  <div className="flex gap-2 flex-wrap">
                    {equivalents.map((eq, i) => (
                      <div
                        key={i}
                        className="flex items-center gap-2 px-3 py-2 bg-slate-50 dark:bg-slate-800/60 rounded-lg"
                      >
                        <span className="text-sm" aria-hidden="true">{eq.icon}</span>
                        <span>
                          <span className="metric block text-xs text-slate-800 dark:text-white leading-none">
                            {eq.value}
                          </span>
                          <span className="block text-[0.625rem] text-slate-500 dark:text-slate-400 leading-none mt-1">
                            {eq.label}
                          </span>
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )
            )}
          </div>

          {/* 7-day chart */}
          <div className="glass p-6 rounded-card border-slate-200 dark:border-white/10 animate-fade-in-up opacity-0" style={{ animationDelay: '300ms' }}>
            <div className="flex justify-between items-baseline mb-5">
              <h3 className="eyebrow">Last 7 days</h3>
              <span className="metric text-[0.6875rem] text-slate-500 dark:text-slate-400">
                {weekCO2.toFixed(1)} <span className="unit">kg total</span>
              </span>
            </div>
            <div className="h-56 w-full">
              {loggedDays === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center px-6">
                  <i className="fa-regular fa-chart-bar text-2xl text-slate-300 dark:text-slate-700 mb-3" aria-hidden="true" />
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    No trips logged this week yet.
                  </p>
                  <p className="text-[0.6875rem] text-slate-400 dark:text-slate-500 mt-1">
                    Log two or three days and the trend line becomes useful.
                  </p>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ left: 0, right: 8, top: 16, bottom: 8 }}>
                    <XAxis
                      dataKey="name"
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: '#94a3b8', fontSize: 10, fontFamily: 'IBM Plex Mono, monospace' }}
                      interval={0}
                      padding={{ left: 16, right: 16 }}
                    />
                    <YAxis
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: '#94a3b8', fontSize: 10, fontFamily: 'IBM Plex Mono, monospace' }}
                      width={32}
                    />
                    <Tooltip content={<CustomTooltip />} cursor={{ stroke: '#cbd5e1', strokeWidth: 1 }} />
                    {/* The daily limit as a reference line turns the chart from a
                        shape into a judgement: above the line is over budget. */}
                    <ReferenceLine
                      y={user.dailyGoal}
                      stroke="#f97316"
                      strokeDasharray="4 4"
                      strokeWidth={1}
                    />
                    <Line
                      type="monotone"
                      dataKey="value"
                      stroke="#10b981"
                      strokeWidth={2}
                      dot={{ r: 3, fill: '#10b981', strokeWidth: 0 }}
                      activeDot={{ r: 5, strokeWidth: 0, fill: '#10b981' }}
                      animationDuration={900}
                      connectNulls
                    >
                      <LabelList dataKey="value" content={<ChartValueLabel />} />
                    </Line>
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </div>

        {/* Sidebar Panel (1/3 width on desktop) */}
        <div className="space-y-6">
          {/* Weekly Goal + Share row */}
          <div className="grid grid-cols-2 gap-4 animate-fade-in-up opacity-0" style={{ animationDelay: '100ms' }}>
            <div className="glass interactive p-5 rounded-card border-slate-200 dark:border-white/10 flex flex-col items-center justify-center">
              <WeeklyRing used={weekCO2} goal={weeklyGoal} />
              <p className="text-[0.625rem] font-bold text-slate-400 uppercase tracking-[0.08em] mt-2 text-center">Weekly Goal</p>
            </div>
            <div className="glass p-5 rounded-card border-slate-200 dark:border-white/10 flex flex-col items-center justify-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-amber-500/10 flex items-center justify-center">
                <i className="fa-solid fa-fire text-amber-500 text-xl" />
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-slate-800 dark:text-white">{user.streak}</div>
                <div className="text-[0.625rem] font-bold text-slate-400 uppercase tracking-[0.08em]">Day Streak</div>
              </div>
              <button
                onClick={() => setShowShare(true)}
                className="w-full py-2 bg-emerald-500 hover:bg-emerald-400 text-white text-[0.625rem] font-bold uppercase tracking-[0.08em] rounded-xl transition-colors flex items-center justify-center gap-1.5"
              >
                <i className="fa-solid fa-share-nodes text-xs" /> Share
              </button>
            </div>
          </div>

          {/* ML Insight card */}
          <div
            className={`interactive p-6 rounded-card border transition-all duration-700 relative overflow-hidden group animate-fade-in-up opacity-0 ${insight?.risk === 'High' ? 'bg-rose-50 border-rose-100 dark:bg-rose-500/10 dark:border-rose-500/20' : 'bg-emerald-50 border-emerald-100 dark:bg-emerald-500/10 dark:border-emerald-500/20'}`}
            style={{ animationDelay: '200ms' }}
          >
            <div className="flex items-center gap-2 mb-4">
              <div className={`w-2.5 h-2.5 rounded-full ${loading ? 'bg-amber-400 animate-pulse' : 'bg-emerald-400 ai-pulse'}`}></div>
              <span className="text-[0.6875rem] font-bold tracking-[0.08em] text-emerald-600 dark:text-emerald-400 uppercase">ML Insight Engine</span>
            </div>
            <h3 className="text-lg font-bold text-slate-800 dark:text-white mb-2 leading-tight">
              {loading ? "Analyzing behaviors..." : insight?.risk === 'High' ? "Imminent Carbon Alert" : "Peak Efficiency Mode"}
            </h3>
            <p className="text-sm text-slate-600 dark:text-slate-300 font-medium leading-relaxed mb-6">
              {insight?.message || "Aggregating your patterns to predict future environmental impact."}
            </p>
            {insight && !loading && (
              <div className="grid grid-cols-2 gap-4 mt-4 bg-white/60 dark:bg-slate-900/40 p-4 rounded-2xl border border-slate-200 dark:border-white/5">
                <div>
                  <div className="text-[0.6875rem] font-bold text-slate-400 uppercase mb-1">Travel Predicted</div>
                  <div className="text-lg font-bold text-slate-800 dark:text-white">{Number(insight.breakdown.travel).toFixed(1)} kg</div>
                </div>
                <div>
                  <div className="text-[0.6875rem] font-bold text-slate-400 uppercase mb-1">Energy Baseline</div>
                  <div className="text-lg font-bold text-slate-800 dark:text-white">{Number(insight.breakdown.energy).toFixed(1)} kg</div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Bottom stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 animate-fade-in-up opacity-0" style={{ animationDelay: '400ms' }}>
        <div className="glass interactive p-6 rounded-card flex flex-col items-center justify-center text-center border-slate-200 dark:border-white/10">
          <div className="w-12 h-12 rounded-2xl bg-blue-500/10 flex items-center justify-center text-blue-500 mb-3 border border-blue-500/10">
            <i className="fa-solid fa-bolt-lightning text-xl"></i>
          </div>
          <span className="text-[0.6875rem] font-bold text-slate-400 uppercase tracking-[0.08em] mb-1">Energy Baseline</span>
          <div className="text-xl font-bold text-slate-800 dark:text-white">{Number(electricity) || 0} <span className="text-xs font-bold text-slate-400">kWh</span></div>
        </div>
        <div className="glass p-6 rounded-card flex flex-col items-center justify-center text-center border-slate-200 dark:border-white/10">
          <div className="w-12 h-12 rounded-2xl bg-orange-500/10 flex items-center justify-center text-orange-500 mb-3 border border-orange-500/10">
            <i className="fa-solid fa-calendar-check text-xl"></i>
          </div>
          <span className="text-[0.6875rem] font-bold text-slate-400 uppercase tracking-[0.08em] mb-1">Logs Today</span>
          <div className="text-xl font-bold text-slate-800 dark:text-white">{dailyBehaviors.length} <span className="text-xs font-bold text-slate-400">trips</span></div>
        </div>
        <div className="glass interactive p-6 rounded-card flex flex-col items-center justify-center text-center border-slate-200 dark:border-white/10">
          <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 flex items-center justify-center text-emerald-500 mb-3 border border-emerald-500/10">
            <i className="fa-solid fa-route text-xl"></i>
          </div>
          <span className="text-[0.6875rem] font-bold text-slate-400 uppercase tracking-[0.08em] mb-1">Total Travel</span>
          <div className="text-xl font-bold text-slate-800 dark:text-white">{trips.reduce((acc, t) => acc + (t.distance || 0), 0).toFixed(1)} <span className="text-xs font-bold text-slate-400">km</span></div>
        </div>
        <div className="glass interactive p-6 rounded-card flex flex-col items-center justify-center text-center border-slate-200 dark:border-white/10">
          <div className="w-12 h-12 rounded-2xl bg-rose-500/10 flex items-center justify-center text-rose-500 mb-3 border border-rose-500/10">
            <i className="fa-solid fa-cloud-arrow-down text-xl"></i>
          </div>
          <span className="text-[0.6875rem] font-bold text-slate-400 uppercase tracking-[0.08em] mb-1">Total Emissions</span>
          <div className="text-xl font-bold text-slate-800 dark:text-white">{trips.reduce((acc, t) => acc + (t.co2 || 0), 0).toFixed(1)} <span className="text-xs font-bold text-slate-400">kg</span></div>
        </div>
      </div>

      {/* Share Card Modal */}
      {showShare && (
        <ShareCard user={user} trips={trips} bills={bills} onClose={() => setShowShare(false)} />
      )}
    </div>
  );
};

export default Dashboard;
