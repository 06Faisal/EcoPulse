import React from 'react';
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip } from 'recharts';
import { Trip, AIInsight, UserProfile } from '../services/types';

interface DashboardProps {
  trips: Trip[];
  electricity: number;
  insight: AIInsight | null;
  user: UserProfile;
  loading: boolean;
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-slate-900 border border-emerald-500/30 p-3 rounded-2xl shadow-2xl">
        <p className="text-[10px] font-black text-emerald-400 uppercase mb-1 tracking-widest">{label}</p>
        <p className="text-sm font-bold text-white">{Number(payload[0].value).toFixed(2)} <span className="text-[10px] opacity-60">kg</span></p>
      </div>
    );
  }
  return null;
};

const Dashboard: React.FC<DashboardProps> = ({ trips, electricity, insight, user, loading }) => {
  const todayStr = new Date().toISOString().split('T')[0];
  const dailyBehaviors = trips.filter(t => t.date.split('T')[0] === todayStr);
  const dailyTotal = Number(dailyBehaviors.reduce((acc, t) => acc + (t.co2 || 0), 0)) || 0;
  
  const progressPercent = Math.min((dailyTotal / (user.dailyGoal || 1)) * 100, 100);

  // Calculate actual user data from trips
  const getLast7DaysData = () => {
    // Get last 7 days of dates as strings
    const dates = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      dates.push(d.toISOString().split('T')[0]); // e.g., "2026-01-23"
    }
    
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    
    return dates.map(dateStr => {
      // Get day name from the date string
      const date = new Date(dateStr + 'T12:00:00'); // Noon to avoid timezone issues
      const dayName = dayNames[date.getDay()];
      
      // Find trips matching this date (simple string comparison)
      const dayTrips = trips.filter(trip => trip.date.startsWith(dateStr));
      
      const dayTotal = dayTrips.reduce((sum, trip) => sum + (trip.co2 || 0), 0);
      
      console.log(`📅 ${dayName} (${dateStr}): ${dayTrips.length} trips, ${dayTotal.toFixed(2)} kg`, dayTrips);
      
      return {
        name: dayName,
        value: dayTotal > 0 ? Number(dayTotal.toFixed(1)) : null
      };
    });
  };

  // Always use actual trip data (not ML forecasts)
  const chartData = getLast7DaysData();

  return (
    <div className="space-y-6 pt-4 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-4">
      <div className="glass p-6 rounded-[2rem] shadow-sm border-slate-200 dark:border-white/10 space-y-5">
        <div className="flex justify-between items-end">
          <div>
            <span className="text-slate-400 dark:text-slate-500 text-[10px] font-black uppercase tracking-[0.2em]">Real-time Impact</span>
            <div className="flex items-baseline gap-1 mt-1">
              <h2 className="text-4xl font-black text-slate-800 dark:text-white tracking-tighter">{dailyTotal.toFixed(2)}</h2>
              <span className="text-slate-500 dark:text-slate-400 font-bold text-sm italic">kg CO₂e</span>
            </div>
          </div>
          <div className="text-right">
            <span className="text-slate-400 dark:text-slate-500 text-[9px] font-black uppercase tracking-widest">Limit: {user.dailyGoal}kg</span>
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
      </div>

      <div className={`p-6 rounded-[2rem] border transition-all duration-700 relative overflow-hidden group ${insight?.risk === 'High' ? 'bg-rose-50 border-rose-100 dark:bg-rose-500/10 dark:border-rose-500/20' : 'bg-emerald-50 border-emerald-100 dark:bg-emerald-500/10 dark:border-emerald-500/20'}`}>
        <div className="flex items-center gap-2 mb-4">
          <div className={`w-2.5 h-2.5 rounded-full ${loading ? 'bg-amber-400 animate-pulse' : 'bg-emerald-400 ai-pulse'}`}></div>
          <span className="text-[10px] font-black tracking-[0.15em] text-emerald-600 dark:text-emerald-400 uppercase">ML Insight Engine</span>
        </div>
        
        <h3 className="text-lg font-black text-slate-800 dark:text-white mb-2 leading-tight">
          {loading ? "Analyzing behaviors..." : insight?.risk === 'High' ? "Imminent Carbon Alert" : "Peak Efficiency Mode"}
        </h3>
        <p className="text-sm text-slate-600 dark:text-slate-400 font-medium leading-relaxed mb-6">
          {insight?.message || "Aggregating your patterns to predict future environmental impact."}
        </p>

        {insight && !loading && (
          <div className="grid grid-cols-2 gap-4 mt-4 bg-white/60 dark:bg-slate-900/40 p-4 rounded-2xl border border-slate-200 dark:border-white/5 shadow-sm">
            <div>
              <div className="text-[9px] font-black text-slate-400 uppercase mb-1">Travel Predicted</div>
              <div className="text-lg font-black text-slate-800 dark:text-white">{Number(insight.breakdown.travel).toFixed(1)}kg</div>
            </div>
            <div>
              <div className="text-[9px] font-black text-slate-400 uppercase mb-1">Energy Baseline</div>
              <div className="text-lg font-black text-slate-800 dark:text-white">{Number(insight.breakdown.energy).toFixed(1)}kg</div>
            </div>
          </div>
        )}
      </div>

      <div className="glass p-6 rounded-[2rem] shadow-sm border-slate-200 dark:border-white/10">
        <div className="flex justify-between items-center mb-6 px-1">
          <h3 className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Weekly Projection</h3>
          <div className="text-[10px] font-black text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-3 py-1 rounded-full uppercase">Week View</div>
        </div>
        <div className="h-56 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ left: 0, right: 0, top: 10, bottom: 20 }}>
              <XAxis 
                dataKey="name" 
                axisLine={false} 
                tickLine={false} 
                tick={{fill: '#94a3b8', fontSize: 9, fontWeight: 700}}
                interval={0}
                padding={{ left: 20, right: 20 }}
              />
              <Tooltip content={<CustomTooltip />} cursor={{ stroke: '#10b981', strokeWidth: 1, strokeDasharray: '5 5' }} />
              <Line 
                type="monotone" 
                dataKey="value" 
                stroke="#10b981" 
                strokeWidth={4} 
                dot={{r: 5, fill: '#fff', strokeWidth: 3, stroke: '#10b981'}}
                activeDot={{r: 8, strokeWidth: 0, fill: '#10b981'}}
                animationDuration={1500}
                connectNulls={true}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="glass p-6 rounded-[2rem] shadow-sm flex flex-col items-center justify-center text-center border-slate-200 dark:border-white/10">
          <div className="w-12 h-12 rounded-2xl bg-blue-500/10 flex items-center justify-center text-blue-500 mb-3 border border-blue-500/10">
             <i className="fa-solid fa-bolt-lightning text-xl"></i>
          </div>
          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Energy Baseline</span>
          <div className="text-xl font-black text-slate-800 dark:text-white">{Number(electricity) || 0} <span className="text-xs font-bold text-slate-400">kWh</span></div>
        </div>
        <div className="glass p-6 rounded-[2rem] shadow-sm flex flex-col items-center justify-center text-center border-slate-200 dark:border-white/10">
          <div className="w-12 h-12 rounded-2xl bg-orange-500/10 flex items-center justify-center text-orange-500 mb-3 border border-orange-500/10">
             <i className="fa-solid fa-calendar-check text-xl"></i>
          </div>
          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Logs Today</span>
          <div className="text-xl font-black text-slate-800 dark:text-white">{dailyBehaviors.length} <span className="text-xs font-bold text-slate-400">trips</span></div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;