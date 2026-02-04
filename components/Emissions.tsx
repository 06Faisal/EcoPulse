import React from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, BarChart, Bar, XAxis, YAxis } from 'recharts';
import { Trip } from '../services/types';

interface EmissionsProps {
  trips: Trip[];
  electricity: number;
  onDeleteTripsByVehicle?: (vehicle: string) => void;
}

const COLORS = [
  '#2563eb',
  '#f59e0b',
  '#10b981',
  '#ef4444',
  '#a855f7',
  '#14b8a6',
  '#f97316',
  '#0ea5e9',
  '#84cc16',
  '#e11d48'
];

const getColor = (key: string, index: number) => {
  if (index < COLORS.length) return COLORS[index];
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = (hash << 5) - hash + key.charCodeAt(i);
    hash |= 0;
  }
  const idx = Math.abs(hash) % COLORS.length;
  return COLORS[idx];
};

const CustomTooltip = ({ active, payload }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-slate-900 p-3 rounded-2xl shadow-lg border border-white/10">
        <p className="text-[10px] font-black text-slate-400 uppercase mb-1">{payload[0].name}</p>
        <p className="text-sm font-bold text-white">{Number(payload[0].value).toFixed(2)} kg CO2</p>
      </div>
    );
  }
  return null;
};

const renderPieLabel = ({ cx, cy, innerRadius, outerRadius, percent, startAngle, endAngle, index, midAngle }: any) => {
  if (percent < 0.08) return null;
  const RADIAN = Math.PI / 180;
  const radius = innerRadius + (outerRadius - innerRadius) * 0.6;

  const polarToCartesian = (angle: number) => ({
    x: cx + radius * Math.cos(-angle * RADIAN),
    y: cy + radius * Math.sin(-angle * RADIAN)
  });

  let pathD = '';
  const safeMidAngle = Number.isFinite(midAngle) ? midAngle : (startAngle + endAngle) / 2;
  const normalizedMid = ((safeMidAngle % 360) + 360) % 360;
  const needsFlip = normalizedMid >= 90 && normalizedMid <= 270;
  if (percent > 0.99) {
    const start = { x: cx + radius, y: cy };
    const mid = { x: cx - radius, y: cy };
    const sweepFlag = needsFlip ? 0 : 1;
    pathD = `M ${start.x} ${start.y} A ${radius} ${radius} 0 1 ${sweepFlag} ${mid.x} ${mid.y} A ${radius} ${radius} 0 1 ${sweepFlag} ${start.x} ${start.y}`;
  } else {
    let start = polarToCartesian(startAngle);
    let end = polarToCartesian(endAngle);
    const largeArcFlag = Math.abs(endAngle - startAngle) > 180 ? 1 : 0;
    let sweepFlag = startAngle > endAngle ? 1 : 0;
    if (needsFlip) {
      [start, end] = [end, start];
      sweepFlag = sweepFlag ? 0 : 1;
    }
    pathD = `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArcFlag} ${sweepFlag} ${end.x} ${end.y}`;
  }

  const pathId = `pie-label-arc-${index}`;
  return (
    <g>
      <path id={pathId} d={pathD} fill="none" stroke="none" />
      <text fill="#e2e8f0" fontSize={11} fontWeight={800}>
        <textPath href={`#${pathId}`} xlinkHref={`#${pathId}`} startOffset="50%" textAnchor="middle">
          {`${(percent * 100).toFixed(0)}%`}
        </textPath>
      </text>
    </g>
  );
};

const Emissions: React.FC<EmissionsProps> = ({ trips, electricity, onDeleteTripsByVehicle }) => {
  const todayStr = new Date().toISOString().split('T')[0];
  const todayTrips = trips.filter(t => t.date.split('T')[0] === todayStr);
  const todayTripCO2 = Number(todayTrips.reduce((acc, t) => acc + (t.co2 || 0), 0)) || 0;
  const monthlyEnergyCO2 = (Number(electricity) || 0) * 0.45;

  // Breakdown by vehicle for cumulative impact
  const vehicleStats = trips.reduce((acc, trip) => {
    const key = trip.vehicle === 'Custom' ? (trip.customVehicleName || 'Unknown Vehicle') : trip.vehicle;
    acc[key] = (Number(acc[key]) || 0) + Number(trip.co2);
    return acc;
  }, {} as Record<string, number>);

  const pieData = Object.entries(vehicleStats)
    .map(([name, value]) => ({ name, value: Number(value) }))
    .sort((a, b) => b.value - a.value);
  
  // Total stats
  const totalTravelCO2 = trips.reduce((acc, t) => acc + Number(t.co2), 0);
  const totalDistance = trips.reduce((acc, t) => acc + Number(t.distance), 0);

  return (
    <div className="space-y-8 pb-24 animate-in fade-in slide-in-from-right-4 duration-300 pt-4">
      {/* CUMULATIVE TRAVEL ANALYSIS */}
      <div className="glass p-8 rounded-[2.5rem] bg-white dark:bg-slate-900 text-slate-900 dark:text-white border border-slate-200 dark:border-white/10 shadow-xl relative overflow-hidden">
        <div className="relative z-10">
          <span className="text-[11px] font-black text-emerald-500 dark:text-emerald-400 uppercase tracking-[0.16em]">All-Time Travel Impact</span>
          <div className="flex items-baseline gap-2 mt-2">
            <h2 className="text-5xl font-black tracking-tighter text-slate-900 dark:text-white">{totalTravelCO2.toFixed(1)}</h2>
            <span className="text-sm font-bold text-slate-500 dark:text-slate-400">kg CO2</span>
          </div>
          <div className="mt-6 grid grid-cols-2 gap-4">
             <div className="p-4 bg-slate-100 dark:bg-white/5 rounded-2xl border border-slate-200 dark:border-white/5">
                <p className="text-[11px] font-black text-slate-400 dark:text-slate-400 uppercase">Distance Covered</p>
                <p className="text-xl font-black text-slate-900 dark:text-white">{totalDistance.toFixed(0)} <span className="text-[10px] text-slate-500 dark:text-slate-400">km</span></p>
             </div>
             <div className="p-4 bg-slate-100 dark:bg-white/5 rounded-2xl border border-slate-200 dark:border-white/5">
                <p className="text-[11px] font-black text-slate-400 dark:text-slate-400 uppercase">Trip Count</p>
                <p className="text-xl font-black text-slate-900 dark:text-white">{trips.length} <span className="text-[10px] text-slate-500 dark:text-slate-400">logs</span></p>
             </div>
          </div>
        </div>

        {pieData.length > 0 ? (
          <>
            <div className="h-64 w-full mt-8 bg-slate-900 rounded-2xl border border-slate-800 p-3 relative">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={85}
                    paddingAngle={8}
                    dataKey="value"
                    stroke="none"
                    labelLine={false}
                    label={renderPieLabel}
                  >
                    {pieData.map((entry, index) => (
                      <Cell key={`cell-${entry.name}`} fill={getColor(entry.name, index)} />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomTooltip />} />
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="text-center">
                  <div className="text-[11px] font-black text-slate-400 uppercase tracking-[0.16em]">Total</div>
                  <div className="text-xl font-black text-white">{totalTravelCO2.toFixed(1)} kg</div>
                </div>
              </div>
            </div>
            
            {/* Legend with vehicle colors and delete option */}
            <div className="mt-6 space-y-2">
              <h4 className="text-[11px] font-black text-slate-400 dark:text-slate-400 uppercase tracking-[0.16em] mb-3">Vehicle Breakdown</h4>
              <div className="grid grid-cols-1 gap-2">
                {pieData.map((entry, index) => (
                  <div 
                    key={entry.name}
                    className="flex items-center justify-between p-3 bg-slate-100 dark:bg-white/5 rounded-xl border border-slate-200 dark:border-white/5 group hover:bg-slate-200 dark:hover:bg-white/10 transition-all"
                  >
                    <div className="flex items-center gap-3 flex-1">
                      <div 
                        className="w-4 h-4 rounded-full flex-shrink-0" 
                        style={{ backgroundColor: getColor(entry.name, index) }}
                      ></div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-black text-slate-800 dark:text-white truncate">{entry.name}</p>
                        <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400">
                          {Number(entry.value).toFixed(2)} kg CO2 | {((Number(entry.value) / totalTravelCO2) * 100).toFixed(1)}%
                        </p>
                      </div>
                    </div>
                    {onDeleteTripsByVehicle && (
                      <button
                        onClick={() => {
                          if (confirm(`Delete all ${entry.name} trips?`)) {
                            onDeleteTripsByVehicle(entry.name);
                          }
                        }}
                        className="ml-2 w-8 h-8 rounded-lg bg-rose-500/10 text-rose-500 flex items-center justify-center md:opacity-0 md:group-hover:opacity-100 transition-opacity hover:bg-rose-500 hover:text-white flex-shrink-0"
                      >
                        <i className="fa-solid fa-trash text-xs"></i>
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </>
        ) : (
          <div className="py-16 text-center text-slate-400 dark:text-slate-500 text-[11px] font-black uppercase tracking-[0.16em]">No cumulative data recorded</div>
        )}
      </div>

      {/* MONTHLY ENERGY BENCHMARK */}
      <div className="glass p-6 rounded-[2rem] bg-white dark:bg-slate-900/40 border border-slate-200 dark:border-white/5 shadow-lg">
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-500/10 rounded-xl flex items-center justify-center text-blue-500">
              <i className="fa-solid fa-plug-circle-bolt"></i>
            </div>
            <h3 className="text-[11px] font-black text-slate-800 dark:text-white uppercase tracking-[0.16em]">Fixed Monthly Energy</h3>
          </div>
          <div className="text-right">
             <div className="text-[10px] font-black text-blue-500">{(monthlyEnergyCO2/30).toFixed(2)} kg/day</div>
          </div>
        </div>
        
        <div className="p-5 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-white/5 relative overflow-hidden">
          <div className="flex justify-between items-end relative z-10">
            <div>
               <p className="text-[11px] font-bold text-slate-400 uppercase mb-1">Grid Consumption</p>
               <div className="text-3xl font-black text-slate-800 dark:text-white">{Number(electricity) || 0} <span className="text-xs font-bold text-slate-400">kWh</span></div>
            </div>
            <div className="text-right">
               <p className="text-[11px] font-bold text-slate-400 uppercase mb-1">Monthly CO2</p>
               <div className="text-3xl font-black text-blue-500">{monthlyEnergyCO2.toFixed(1)} <span className="text-xs font-bold text-blue-400/60">kg</span></div>
            </div>
          </div>
          <div className="absolute bottom-0 left-0 h-1 bg-blue-500 transition-all duration-1000" style={{width: electricity > 0 ? '100%' : '0%'}}></div>
        </div>
      </div>

      {/* VEHICLE EFFICIENCY RANKING */}
      <div className="space-y-4">
        <h3 className="text-[11px] font-black text-slate-400 dark:text-slate-400 uppercase tracking-[0.16em] ml-1">Modal Distribution</h3>
        <div className="space-y-3">
          {Object.entries(vehicleStats).sort((a,b) => Number(b[1]) - Number(a[1])).map(([vehicle, co2], idx) => (
            <div key={vehicle} className="glass p-4 rounded-2xl flex items-center gap-4 bg-white dark:bg-slate-900/40 border-white/5">
              <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-500 font-black text-xs">#{idx+1}</div>
              <div className="flex-1">
                <div className="flex justify-between items-center mb-1.5">
                  <span className="text-sm font-black text-slate-800 dark:text-white">{vehicle}</span>
                  {/* Fixed toFied on possibly unknown type and arithmetic operation types */}
                  <span className="text-xs font-black text-emerald-500">{Number(co2).toFixed(1)} kg</span>
                </div>
                <div className="h-1.5 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                  {/* Ensure no division by zero and cast to number */}
                  <div className="h-full bg-emerald-500" style={{width: `${totalTravelCO2 > 0 ? (Number(co2) / totalTravelCO2) * 100 : 0}%`}}></div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default Emissions;
