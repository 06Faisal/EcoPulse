import React, { useState, useEffect } from 'react';
import { Challenge, ChallengeType } from '../services/types';

interface ChallengesProps {
    userId: string;
    userCO2ThisWeek: number;
}

// ─── Preset challenges ────────────────────────────────────────────────────────

const PRESET_CHALLENGES: Challenge[] = [
    {
        id: 'zero-car-week',
        title: 'Zero-Car Week 🚌',
        description: 'No private car trips for 7 days. Use metro, bus, or cycles only.',
        type: 'zero_car_week',
        goalValue: 0,
        unit: 'private car trips',
        startsAt: new Date().toISOString(),
        endsAt: new Date(Date.now() + 7 * 86400000).toISOString(),
        createdBy: 'EcoPulse',
        participantCount: 0,
        userJoined: false,
        userProgress: 0,
    },
    {
        id: 'low-carbon-week',
        title: 'Under 10 kg Week 🎯',
        description: 'Keep your total CO₂ under 10 kg for travel this week.',
        type: 'low_carbon_day',
        goalValue: 10,
        unit: 'kg CO₂',
        startsAt: new Date().toISOString(),
        endsAt: new Date(Date.now() + 7 * 86400000).toISOString(),
        createdBy: 'EcoPulse',
        participantCount: 0,
        userJoined: false,
        userProgress: 0,
    },
    {
        id: 'transit-champion',
        title: 'Transit Champion 🚇',
        description: 'Use public transport for 5 trips this week.',
        type: 'public_transit',
        goalValue: 5,
        unit: 'public transit trips',
        startsAt: new Date().toISOString(),
        endsAt: new Date(Date.now() + 7 * 86400000).toISOString(),
        createdBy: 'EcoPulse',
        participantCount: 0,
        userJoined: false,
        userProgress: 0,
    },
    {
        id: 'cycle-week',
        title: 'Cycle & Walk Week 🚴',
        description: 'Log at least 10 km of cycling or walking this week.',
        type: 'custom',
        goalValue: 10,
        unit: 'km cycled/walked',
        startsAt: new Date().toISOString(),
        endsAt: new Date(Date.now() + 7 * 86400000).toISOString(),
        createdBy: 'EcoPulse',
        participantCount: 0,
        userJoined: false,
        userProgress: 0,
    },
];

const typeColors: Record<ChallengeType, { bg: string; text: string; icon: string }> = {
    zero_car_week: { bg: 'bg-rose-500/10', text: 'text-rose-500', icon: 'fa-car-slash' },
    low_carbon_day: { bg: 'bg-emerald-500/10', text: 'text-emerald-500', icon: 'fa-leaf' },
    public_transit: { bg: 'bg-blue-500/10', text: 'text-blue-500', icon: 'fa-train-subway' },
    custom: { bg: 'bg-purple-500/10', text: 'text-purple-500', icon: 'fa-star' },
};

function daysLeft(endsAt: string): number {
    return Math.max(0, Math.ceil((new Date(endsAt).getTime() - Date.now()) / 86400000));
}

// ─── Component ────────────────────────────────────────────────────────────────

const Challenges: React.FC<ChallengesProps> = ({ userId, userCO2ThisWeek }) => {
    const [challenges, setChallenges] = useState<Challenge[]>(() => {
        const stored = localStorage.getItem('ecopulse_challenges');
        if (stored) return JSON.parse(stored);
        return PRESET_CHALLENGES;
    });
    const [showCreate, setShowCreate] = useState(false);
    const [newTitle, setNewTitle] = useState('');
    const [newGoal, setNewGoal] = useState('');
    const [newDays, setNewDays] = useState('7');
    const [toast, setToast] = useState('');

    const persist = (updated: Challenge[]) => {
        setChallenges(updated);
        localStorage.setItem('ecopulse_challenges', JSON.stringify(updated));
    };

    const handleJoin = (id: string) => {
        const updated = challenges.map(c =>
            c.id === id ? { ...c, userJoined: !c.userJoined, participantCount: (c.participantCount || 0) + (c.userJoined ? -1 : 1) } : c
        );
        persist(updated);
        const joined = updated.find(c => c.id === id)?.userJoined;
        setToast(joined ? '🎉 Challenge joined! Good luck!' : 'Left challenge.');
        setTimeout(() => setToast(''), 3000);
    };

    const handleCreate = () => {
        if (!newTitle.trim() || !newGoal) return;
        const newChallenge: Challenge = {
            id: `custom-${Date.now()}`,
            title: newTitle.trim(),
            description: `Custom challenge: reach ${newGoal} goal in ${newDays} days.`,
            type: 'custom',
            goalValue: Number(newGoal),
            unit: 'kg CO₂',
            startsAt: new Date().toISOString(),
            endsAt: new Date(Date.now() + Number(newDays) * 86400000).toISOString(),
            createdBy: userId,
            participantCount: 1,
            userJoined: true,
            userProgress: userCO2ThisWeek,
        };
        persist([newChallenge, ...challenges]);
        setNewTitle('');
        setNewGoal('');
        setNewDays('7');
        setShowCreate(false);
        setToast('✅ Challenge created!');
        setTimeout(() => setToast(''), 3000);
    };

    const joined = challenges.filter(c => c.userJoined);
    const available = challenges.filter(c => !c.userJoined);

    return (
        <div className="space-y-6 pt-4 pb-24 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Toast */}
            {toast && (
                <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 px-5 py-3 bg-slate-900 text-white text-sm font-bold rounded-2xl shadow-xl animate-in zoom-in-95 duration-300">
                    {toast}
                </div>
            )}

            {/* Header */}
            <div className="glass p-6 rounded-[2rem] border-slate-200 dark:border-white/10 text-center">
                <div className="w-16 h-16 bg-amber-500/10 rounded-[1.5rem] flex items-center justify-center mx-auto mb-4">
                    <i className="fa-solid fa-trophy text-amber-500 text-2xl" />
                </div>
                <h2 className="text-xl font-black text-slate-800 dark:text-white">Challenges</h2>
                <p className="text-sm text-slate-500 dark:text-slate-400 font-medium mt-1">
                    Compete, commit, and cut carbon with others
                </p>
                <div className="flex justify-center gap-4 mt-4">
                    <div className="text-center">
                        <div className="text-2xl font-black text-slate-800 dark:text-white">{joined.length}</div>
                        <div className="text-[10px] text-slate-400 font-black uppercase tracking-widest">Active</div>
                    </div>
                </div>
            </div>

            {/* Active challenges */}
            {joined.length > 0 && (
                <div className="space-y-3">
                    <h3 className="text-[11px] font-black text-slate-400 uppercase tracking-[0.16em] px-1 flex items-center gap-2">
                        <i className="fa-solid fa-fire text-amber-500" /> Your Active Challenges
                    </h3>
                    {joined.map(c => {
                        const colors = typeColors[c.type];
                        const pct = c.type === 'low_carbon_day'
                            ? Math.min(100, ((c.userProgress || 0) / c.goalValue) * 100)
                            : 0;
                        return (
                            <div key={c.id} className="glass p-5 rounded-[2rem] border border-emerald-500/20 bg-emerald-500/5">
                                <div className="flex items-start gap-4">
                                    <div className={`w-11 h-11 rounded-2xl ${colors.bg} flex items-center justify-center flex-shrink-0`}>
                                        <i className={`fa-solid ${colors.icon} ${colors.text} text-base`} />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center justify-between gap-2 flex-wrap">
                                            <h4 className="font-black text-slate-800 dark:text-white text-sm">{c.title}</h4>
                                            <span className="text-[10px] font-black text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full">
                                                {daysLeft(c.endsAt)}d left
                                            </span>
                                        </div>
                                        <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium mt-1 leading-tight">{c.description}</p>
                                        {c.type === 'low_carbon_day' && (
                                            <div className="mt-3">
                                                <div className="flex justify-between text-[10px] font-black text-slate-400 mb-1">
                                                    <span>{(c.userProgress || 0).toFixed(1)} kg used</span>
                                                    <span>{c.goalValue} kg limit</span>
                                                </div>
                                                <div className="h-2 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                                                    <div
                                                        className={`h-full rounded-full transition-all duration-700 ${pct >= 100 ? 'bg-rose-500' : 'bg-emerald-500'}`}
                                                        style={{ width: `${pct}%` }}
                                                    />
                                                </div>
                                            </div>
                                        )}
                                        <button
                                            onClick={() => handleJoin(c.id)}
                                            className="mt-3 text-[10px] font-black text-rose-500 hover:text-rose-400 uppercase tracking-widest transition-colors"
                                        >
                                            Leave challenge
                                        </button>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Available challenges */}
            <div className="space-y-3">
                <h3 className="text-[11px] font-black text-slate-400 uppercase tracking-[0.16em] px-1">
                    Available Challenges
                </h3>
                {available.map(c => {
                    const colors = typeColors[c.type];
                    return (
                        <div key={c.id} className="glass p-5 rounded-[2rem] border-slate-200 dark:border-white/10 hover:bg-white dark:hover:bg-slate-800/80 transition-all duration-200">
                            <div className="flex items-start gap-4">
                                <div className={`w-11 h-11 rounded-2xl ${colors.bg} flex items-center justify-center flex-shrink-0`}>
                                    <i className={`fa-solid ${colors.icon} ${colors.text} text-base`} />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center justify-between gap-2 flex-wrap">
                                        <h4 className="font-black text-slate-800 dark:text-white text-sm">{c.title}</h4>
                                        <span className="text-[10px] font-bold text-slate-400">
                                            👥 {c.participantCount?.toLocaleString()} joined
                                        </span>
                                    </div>
                                    <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium mt-1 leading-tight">{c.description}</p>
                                    <div className="flex items-center justify-between mt-3 flex-wrap gap-2">
                                        <span className="text-[10px] text-slate-400 font-black">
                                            ⏱ {daysLeft(c.endsAt)} days left
                                        </span>
                                        <button
                                            onClick={() => handleJoin(c.id)}
                                            className="px-4 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-white text-xs font-black rounded-xl transition-colors shadow shadow-emerald-500/25"
                                        >
                                            Join Challenge
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Create custom challenge */}
            <div className="glass p-5 rounded-[2rem] border-slate-200 dark:border-white/10">
                <button
                    onClick={() => setShowCreate(s => !s)}
                    className="w-full flex items-center justify-between"
                >
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-purple-500/10 flex items-center justify-center">
                            <i className="fa-solid fa-plus text-purple-500 text-sm" />
                        </div>
                        <span className="font-black text-slate-700 dark:text-slate-200 text-sm">Create Custom Challenge</span>
                    </div>
                    <i className={`fa-solid fa-chevron-${showCreate ? 'up' : 'down'} text-slate-400 text-xs`} />
                </button>

                {showCreate && (
                    <div className="mt-4 space-y-3 animate-in fade-in duration-300">
                        <input
                            type="text"
                            placeholder="Challenge name (e.g. Bike to work this week)"
                            value={newTitle}
                            onChange={e => setNewTitle(e.target.value)}
                            className="w-full px-4 py-3 bg-slate-100 dark:bg-slate-800 rounded-xl text-sm font-medium text-slate-800 dark:text-white placeholder-slate-400 outline-none border-none"
                        />
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 block">CO₂ Limit (kg)</label>
                                <input
                                    type="number"
                                    placeholder="e.g. 5"
                                    value={newGoal}
                                    onChange={e => setNewGoal(e.target.value)}
                                    className="w-full px-3 py-2.5 bg-slate-100 dark:bg-slate-800 rounded-xl text-sm font-medium text-slate-800 dark:text-white placeholder-slate-400 outline-none"
                                />
                            </div>
                            <div>
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 block">Duration (days)</label>
                                <input
                                    type="number"
                                    placeholder="7"
                                    value={newDays}
                                    onChange={e => setNewDays(e.target.value)}
                                    className="w-full px-3 py-2.5 bg-slate-100 dark:bg-slate-800 rounded-xl text-sm font-medium text-slate-800 dark:text-white placeholder-slate-400 outline-none"
                                />
                            </div>
                        </div>
                        <button
                            onClick={handleCreate}
                            disabled={!newTitle.trim() || !newGoal}
                            className="w-full py-3 bg-purple-500 hover:bg-purple-400 disabled:opacity-40 text-white font-black text-sm rounded-xl transition-colors"
                        >
                            Create Challenge
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

export default Challenges;
