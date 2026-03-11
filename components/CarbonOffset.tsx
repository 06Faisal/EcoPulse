import React, { useState } from 'react';
import { Trip, UtilityBill } from '../services/types';

interface CarbonOffsetProps {
    trips: Trip[];
    bills: UtilityBill[];
}

const OFFSET_PROVIDERS = [
    {
        name: 'SankalpTaru',
        description: 'India\'s largest tree-planting platform. Plant native trees to offset your carbon.',
        url: 'https://sankalptaru.org',
        icon: 'fa-tree',
        color: 'from-green-500 to-emerald-600',
        pricePerKg: 1.2,
        badge: '🇮🇳 India-based',
    },
    {
        name: 'Gold Standard',
        description: 'UN-backed verified carbon offsets. Highest quality certification globally.',
        url: 'https://www.goldstandard.org/impact-quantification/offset-your-emissions',
        icon: 'fa-award',
        color: 'from-yellow-500 to-amber-600',
        pricePerKg: 2.1,
        badge: '🏆 UN-backed',
    },
    {
        name: 'Climate Partner India',
        description: 'Carbon offset projects across India — renewable energy, cookstoves, water.',
        url: 'https://www.climatepartner.com',
        icon: 'fa-wind',
        color: 'from-blue-500 to-cyan-600',
        pricePerKg: 1.8,
        badge: '🌏 Asia focus',
    },
];

const CarbonOffset: React.FC<CarbonOffsetProps> = ({ trips, bills }) => {
    const [expanded, setExpanded] = useState(false);

    // Calculate this month's CO₂
    const now = new Date();
    const monthlyTripCO2 = trips
        .filter(t => {
            const d = new Date(t.date);
            return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
        })
        .reduce((s, t) => s + t.co2, 0);

    const latestBillCO2 = bills.length > 0 ? bills[0].co2 : 0;
    const totalCO2 = monthlyTripCO2 + latestBillCO2;

    const treesNeeded = Math.ceil(totalCO2 / 4); // rough: 4kg CO₂ per tree per year (monthly portion)

    return (
        <div className="glass p-6 rounded-[2rem] border-slate-200 dark:border-white/10">
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-500">
                        <i className="fa-solid fa-earth-americas text-lg" />
                    </div>
                    <div>
                        <h3 className="text-sm font-black text-slate-800 dark:text-white">Carbon Offsets</h3>
                        <p className="text-[11px] text-slate-400 font-bold uppercase tracking-[0.1em]">Neutralise your footprint</p>
                    </div>
                </div>
                <button
                    onClick={() => setExpanded(e => !e)}
                    className="text-[10px] font-black text-emerald-500 uppercase tracking-widest flex items-center gap-1 hover:text-emerald-400 transition-colors"
                >
                    {expanded ? 'Close' : 'Explore'}
                    <i className={`fa-solid fa-chevron-${expanded ? 'up' : 'down'} text-[9px]`} />
                </button>
            </div>

            {/* Monthly summary banner */}
            <div className="p-4 bg-gradient-to-r from-emerald-500/10 to-teal-500/10 rounded-2xl border border-emerald-500/20 mb-4">
                <div className="flex items-center justify-between">
                    <div>
                        <div className="text-[11px] font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-[0.12em] mb-1">
                            This month's footprint
                        </div>
                        <div className="text-2xl font-black text-slate-800 dark:text-white">
                            {totalCO2.toFixed(1)} <span className="text-sm text-slate-400 font-bold">kg CO₂</span>
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                            ≈ {treesNeeded} trees for 1 month to absorb this
                        </div>
                    </div>
                    <div className="text-right">
                        <div className="text-[11px] font-black text-slate-400 uppercase mb-1">Est. offset cost</div>
                        <div className="text-xl font-black text-slate-700 dark:text-slate-200">
                            ₹{Math.ceil(totalCO2 * 1.5)}
                            <span className="text-xs text-slate-400 font-medium ml-1">– ₹{Math.ceil(totalCO2 * 2.1)}</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Offset providers */}
            {expanded && (
                <div className="space-y-3 animate-in fade-in slide-in-from-bottom-2 duration-300">
                    <p className="text-[11px] font-black text-slate-400 uppercase tracking-[0.14em] px-1">
                        Verified Offset Providers
                    </p>
                    {OFFSET_PROVIDERS.map((p) => (
                        <a
                            key={p.name}
                            href={p.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-4 p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl hover:bg-emerald-50 dark:hover:bg-emerald-500/10 transition-all duration-200 group"
                        >
                            <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${p.color} flex items-center justify-center flex-shrink-0 shadow-md`}>
                                <i className={`fa-solid ${p.icon} text-white text-sm`} />
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                    <span className="font-black text-slate-800 dark:text-white text-xs">{p.name}</span>
                                    <span className="text-[10px] bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-300 px-2 py-0.5 rounded-full">{p.badge}</span>
                                </div>
                                <p className="text-[11px] text-slate-500 dark:text-slate-300 font-medium leading-tight mt-0.5">
                                    {p.description}
                                </p>
                            </div>
                            <div className="flex-shrink-0 text-right">
                                <div className="text-xs font-black text-emerald-600 dark:text-emerald-400">
                                    ₹{p.pricePerKg.toFixed(1)}/kg
                                </div>
                                <div className="text-[10px] text-slate-400">
                                    ₹{Math.ceil(totalCO2 * p.pricePerKg)} total
                                </div>
                                <i className="fa-solid fa-arrow-up-right-from-square text-[10px] text-slate-400 group-hover:text-emerald-500 transition-colors mt-1" />
                            </div>
                        </a>
                    ))}

                    <p className="text-[10px] text-slate-400 font-medium text-center pt-1 px-2">
                        Prices are estimates. ₹/kg varies by project type and provider.
                    </p>
                </div>
            )}
        </div>
    );
};

export default CarbonOffset;
