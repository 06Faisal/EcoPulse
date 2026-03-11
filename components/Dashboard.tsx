import React, { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip, LabelList } from 'recharts';
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
        <p className="text-[10px] font-black text-emerald-400 uppercase mb-1 tracking-widest">{label}</p>
        <p className="text-sm font-bold text-white">{Number(payload[0].value).toFixed(2)} <span className="text-[10px] opacity-60">kg</span></p>
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
          <span className={`text-xs font-black ${over ? 'text-rose-500' : 'text-emerald-500'}`}>
            {Math.round(pct * 100)}%
          </span>
          <span className="text-[9px] text-slate-400 font-black">WEEK</span>
        </div>
      </div>
      <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">
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

  return (
    <div className="space-y-6 pt-4 pb-4">
      {/* Daily CO₂ card */}
      <div className="glass p-6 rounded-[2rem] border-slate-200 dark:border-white/10 space-y-4 animate-fade-in-up opacity-0" style={{ animationDelay: '0ms' }}>
        <div className="flex justify-between items-end">
          <div>
            <span className="text-slate-400 dark:text-slate-400 text-[11px] font-black uppercase tracking-[0.16em]">Real-time Impact</span>
            <div className="flex items-baseline gap-1 mt-1">
              <h2 className="text-4xl font-black text-slate-800 dark:text-white tracking-tighter">
                <Odometer value={dailyTotal} />
              </h2>
              <span className="text-slate-500 dark:text-slate-400 font-bold text-sm italic">kg CO₂e</span>
            </div>
          </div>
          <div className="text-right">
            <span className="text-slate-400 dark:text-slate-400 text-[11px] font-black uppercase tracking-[0.16em]">Limit: {user.dailyGoal} kg</span>
            <div className={`text-xs font-black mt-1 ${dailyTotal > user.dailyGoal ? 'text-rose-500' : 'text-emerald-500'}`}>
              {dailyTotal > user.dailyGoal ? 'ABOVE LIMIT' : 'ON TRACK'}
            </div>
          </div>
        </div>
        <div className="h-4 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden shadow-inner">
          <div
            className={`h-full transition-all duration-1000 ease-out rounded-full ${dailyTotal > user.dailyGoal ? 'bg-gradient-to-r from-rose-400 to-rose-600' : 'bg-gradient-to-r from-emerald-400 to-teal-500'}`}
            style={{ width: `${progressPercent}%` }}
          />
        </div>

        {/* CO₂ Equivalents */}
        {equivalents.length > 0 && (
          <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.14em] mb-2">That's equivalent to...</p>
            <div className="flex gap-2 flex-wrap">
              {equivalents.map((eq, i) => (
                <div key={i} className="flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800/60 rounded-xl">
                  <span className="text-sm">{eq.icon}</span>
                  <div>
                    <div className="text-[10px] font-black text-slate-700 dark:text-white leading-none">{eq.value}</div>
                    <div className="text-[9px] text-slate-400 font-medium leading-none mt-0.5">{eq.label}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Weekly Goal + Share row */}
      <div className="grid grid-cols-2 gap-4 animate-fade-in-up opacity-0" style={{ animationDelay: '100ms' }}>
        <div className="glass interactive p-5 rounded-[2rem] border-slate-200 dark:border-white/10 flex flex-col items-center justify-center">
          <WeeklyRing used={weekCO2} goal={weeklyGoal} />
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.12em] mt-2 text-center">Weekly Goal</p>
        </div>
        <div className="glass p-5 rounded-[2rem] border-slate-200 dark:border-white/10 flex flex-col items-center justify-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-amber-500/10 flex items-center justify-center">
            <i className="fa-solid fa-fire text-amber-500 text-xl" />
          </div>
          <div className="text-center">
            <div className="text-2xl font-black text-slate-800 dark:text-white">{user.streak}</div>
            <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Day Streak</div>
          </div>
          <button
            onClick={() => setShowShare(true)}
            className="w-full py-2 bg-emerald-500 hover:bg-emerald-400 text-white text-[10px] font-black uppercase tracking-widest rounded-xl transition-colors flex items-center justify-center gap-1.5"
          >
            <i className="fa-solid fa-share-nodes text-xs" /> Share
          </button>
        </div>
      </div>

      {/* ML Insight card */}
      <div
        className={`interactive p-6 rounded-[2rem] border transition-all duration-700 relative overflow-hidden group animate-fade-in-up opacity-0 ${insight?.risk === 'High' ? 'bg-rose-50 border-rose-100 dark:bg-rose-500/10 dark:border-rose-500/20' : 'bg-emerald-50 border-emerald-100 dark:bg-emerald-500/10 dark:border-emerald-500/20'}`}
        style={{ animationDelay: '200ms' }}
      >
        <div className="flex items-center gap-2 mb-4">
          <div className={`w-2.5 h-2.5 rounded-full ${loading ? 'bg-amber-400 animate-pulse' : 'bg-emerald-400 ai-pulse'}`}></div>
          <span className="text-[11px] font-black tracking-[0.16em] text-emerald-600 dark:text-emerald-400 uppercase">ML Insight Engine</span>
        </div>
        <h3 className="text-lg font-black text-slate-800 dark:text-white mb-2 leading-tight">
          {loading ? "Analyzing behaviors..." : insight?.risk === 'High' ? "Imminent Carbon Alert" : "Peak Efficiency Mode"}
        </h3>
        <p className="text-sm text-slate-600 dark:text-slate-300 font-medium leading-relaxed mb-6">
          {insight?.message || "Aggregating your patterns to predict future environmental impact."}
        </p>
        {insight && !loading && (
          <div className="grid grid-cols-2 gap-4 mt-4 bg-white/60 dark:bg-slate-900/40 p-4 rounded-2xl border border-slate-200 dark:border-white/5">
            <div>
              <div className="text-[11px] font-black text-slate-400 uppercase mb-1">Travel Predicted</div>
              <div className="text-lg font-black text-slate-800 dark:text-white">{Number(insight.breakdown.travel).toFixed(1)} kg</div>
            </div>
            <div>
              <div className="text-[11px] font-black text-slate-400 uppercase mb-1">Energy Baseline</div>
              <div className="text-lg font-black text-slate-800 dark:text-white">{Number(insight.breakdown.energy).toFixed(1)} kg</div>
            </div>
          </div>
        )}
      </div>

      {/* 7-day chart */}
      <div className="glass p-6 rounded-[2rem] border-slate-200 dark:border-white/10 animate-fade-in-up opacity-0" style={{ animationDelay: '300ms' }}>
        <div className="flex justify-between items-center mb-6 px-1">
          <h3 className="text-[11px] font-black text-slate-400 dark:text-slate-400 uppercase tracking-[0.16em]">Weekly Projection</h3>
          <div className="text-[10px] font-black text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-3 py-1 rounded-full uppercase tracking-[0.12em]">Week View</div>
        </div>
        <div className="h-56 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ left: 0, right: 0, top: 10, bottom: 20 }}>
              <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 9, fontWeight: 700 }} interval={0} padding={{ left: 20, right: 20 }} />
              <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 8, fontWeight: 700 }} width={28} label={{ value: 'kg', angle: -90, position: 'insideLeft', fill: '#94a3b8', fontSize: 9, fontWeight: 700 }} />
              <Tooltip content={<CustomTooltip />} cursor={{ stroke: '#10b981', strokeWidth: 1, strokeDasharray: '5 5' }} />
              <Line type="monotone" dataKey="value" stroke="#10b981" strokeWidth={4} dot={{ r: 5, fill: '#fff', strokeWidth: 3, stroke: '#10b981' }} activeDot={{ r: 8, strokeWidth: 0, fill: '#10b981' }} animationDuration={1500} connectNulls={true}>
                <LabelList dataKey="value" content={<ChartValueLabel />} />
              </Line>
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Bottom stats */}
      <div className="grid grid-cols-2 gap-4 animate-fade-in-up opacity-0" style={{ animationDelay: '400ms' }}>
        <div className="glass interactive p-6 rounded-[2rem] flex flex-col items-center justify-center text-center border-slate-200 dark:border-white/10">
          <div className="w-12 h-12 rounded-2xl bg-blue-500/10 flex items-center justify-center text-blue-500 mb-3 border border-blue-500/10">
            <i className="fa-solid fa-bolt-lightning text-xl"></i>
          </div>
          <span className="text-[11px] font-black text-slate-400 uppercase tracking-[0.16em] mb-1">Energy Baseline</span>
          <div className="text-xl font-black text-slate-800 dark:text-white">{Number(electricity) || 0} <span className="text-xs font-bold text-slate-400">kWh</span></div>
        </div>
        <div className="glass p-6 rounded-[2rem] flex flex-col items-center justify-center text-center border-slate-200 dark:border-white/10">
          <div className="w-12 h-12 rounded-2xl bg-orange-500/10 flex items-center justify-center text-orange-500 mb-3 border border-orange-500/10">
            <i className="fa-solid fa-calendar-check text-xl"></i>
          </div>
          <span className="text-[11px] font-black text-slate-400 uppercase tracking-[0.16em] mb-1">Logs Today</span>
          <div className="text-xl font-black text-slate-800 dark:text-white">{dailyBehaviors.length} <span className="text-xs font-bold text-slate-400">trips</span></div>
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
