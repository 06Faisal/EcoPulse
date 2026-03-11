import React, { useState, useEffect, useRef } from 'react';
import { UserProfile, Trip, MilestoneAchievement, LeaderboardEntry, AchievementDef, MilestoneTier, UtilityBill } from '../services/types';
import MonthlyReport from './MonthlyReport';
import { requestNotificationPermission, scheduleDailyReminder, cancelDailyReminder, getNotificationPermission } from '../services/notificationService';

// ─── Achievement Definitions ────────────────────────────────────────────────

const ACHIEVEMENT_DEFS: AchievementDef[] = [
  {
    id: 'streak',
    title: 'Daily Streak',
    description: 'Log your trips every day to build your streak.',
    icon: 'fa-fire-flame-curved',
    unit: 'days',
    tiers: [
      { threshold: 1, label: '1 Day', icon: 'fa-seedling' },
      { threshold: 7, label: '7 Days', icon: 'fa-leaf' },
      { threshold: 14, label: '14 Days', icon: 'fa-tree' },
      { threshold: 30, label: '1 Month', icon: 'fa-star' },
      { threshold: 60, label: '2 Months', icon: 'fa-bolt' },
      { threshold: 90, label: '3 Months', icon: 'fa-crown' },
    ],
  },
  {
    id: 'carbon-saver',
    title: 'Carbon Saver',
    description: 'Total CO₂ logged across all your tracked trips.',
    icon: 'fa-seedling',
    unit: 'kg CO₂',
    tiers: [
      { threshold: 10, label: 'Sprout', icon: 'fa-seedling' },
      { threshold: 50, label: 'Sapling', icon: 'fa-leaf' },
      { threshold: 100, label: 'Tree', icon: 'fa-tree' },
      { threshold: 250, label: 'Forest', icon: 'fa-mountain' },
      { threshold: 500, label: 'Biome', icon: 'fa-globe' },
    ],
  },
  {
    id: 'transit-hero',
    title: 'Transit Hero',
    description: 'Use public buses and trains to reduce road congestion.',
    icon: 'fa-bus-simple',
    unit: 'trips',
    tiers: [
      { threshold: 5, label: 'Rookie', icon: 'fa-ticket' },
      { threshold: 20, label: 'Regular', icon: 'fa-bus' },
      { threshold: 50, label: 'Commuter', icon: 'fa-train' },
      { threshold: 100, label: 'Rail Hero', icon: 'fa-medal' },
    ],
  },
  {
    id: 'green-commuter',
    title: 'Green Commuter',
    description: 'Total distance tracked across all trips.',
    icon: 'fa-route',
    unit: 'km',
    tiers: [
      { threshold: 100, label: '100 km', icon: 'fa-person-biking' },
      { threshold: 500, label: '500 km', icon: 'fa-car-side' },
      { threshold: 1000, label: '1,000 km', icon: 'fa-road' },
      { threshold: 2500, label: '2,500 km', icon: 'fa-earth-asia' },
    ],
  },
  {
    id: 'ev-rider',
    title: 'EV Rider',
    description: 'Take trips using electric vehicles or electric cycles.',
    icon: 'fa-bolt',
    unit: 'EV trips',
    tiers: [
      { threshold: 1, label: 'First Spark', icon: 'fa-plug' },
      { threshold: 10, label: 'Green Driver', icon: 'fa-bolt' },
      { threshold: 25, label: 'EV Champion', icon: 'fa-charging-station' },
      { threshold: 50, label: 'Eco Legend', icon: 'fa-star' },
    ],
  },
];

// ─── Helpers ────────────────────────────────────────────────────────────────

function computeAchievements(
  user: UserProfile,
  trips: Trip[]
): MilestoneAchievement[] {
  const publicTransitTrips = trips.filter(
    (t) => t.vehicle === 'Bus' || t.vehicle === 'Train'
  ).length;
  const totalDistance = trips.reduce((a, b) => a + (b.distance || 0), 0);
  const totalCO2 = trips.reduce((a, b) => a + (b.co2 || 0), 0);
  const evTrips = trips.filter(
    (t) =>
      t.fuelType === 'electric' ||
      (t.vehicle === 'Bike') ||
      (t.customVehicleName || '').toLowerCase().includes('electric') ||
      (t.customVehicleName || '').toLowerCase().includes('ev')
  ).length;

  const values: Record<string, number> = {
    'streak': user.streak,
    'carbon-saver': Math.floor(totalCO2),
    'transit-hero': publicTransitTrips,
    'green-commuter': Math.floor(totalDistance),
    'ev-rider': evTrips,
  };

  return ACHIEVEMENT_DEFS.map((def) => {
    const currentValue = values[def.id] || 0;
    const unlockedTierIndex = def.tiers.reduce(
      (highest, tier, idx) => (currentValue >= tier.threshold ? idx : highest),
      -1
    );
    const nextTierIndex = unlockedTierIndex + 1;
    const nextMilestone =
      nextTierIndex < def.tiers.length
        ? def.tiers[nextTierIndex].threshold
        : def.tiers[def.tiers.length - 1].threshold;

    return {
      id: def.id,
      title: def.title,
      description: def.description,
      icon: def.icon,
      currentValue,
      nextMilestone,
      unlockedTierIndex,
      allTiers: def.tiers,
      level: unlockedTierIndex + 1,
      unit: def.unit,
    };
  });
}

function buildHeatmapData(trips: Trip[]): Map<string, number> {
  const map = new Map<string, number>();
  trips.forEach((t) => {
    const day = (t.date || '').split('T')[0];
    if (day) map.set(day, (map.get(day) || 0) + (t.co2 || 0));
  });
  return map;
}

// ─── Toast Component ─────────────────────────────────────────────────────────

const Toast: React.FC<{ message: string; onDismiss: () => void }> = ({ message, onDismiss }) => {
  useEffect(() => {
    const t = setTimeout(onDismiss, 4000);
    return () => clearTimeout(t);
  }, [onDismiss]);

  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[100] animate-in slide-in-from-top-4 duration-300">
      <div className="bg-slate-900 dark:bg-emerald-500 text-white px-6 py-3 rounded-2xl shadow-2xl flex items-center gap-3 text-sm font-black">
        <i className="fa-solid fa-trophy text-amber-400 dark:text-white text-lg" />
        <span>{message}</span>
      </div>
    </div>
  );
};

// ─── Profile Component ────────────────────────────────────────────────────────

interface ProfileProps {
  user: UserProfile;
  trips: Trip[];
  bills?: UtilityBill[];
  onUpdateProfile: (updates: Partial<UserProfile>) => void;
  milestones?: MilestoneAchievement[];
  rankings?: LeaderboardEntry[];
}

const Profile: React.FC<ProfileProps> = ({ user, trips, bills = [], onUpdateProfile, milestones, rankings }) => {
  const [editingGoal, setEditingGoal] = useState(false);
  const [goalInput, setGoalInput] = useState(String(user.dailyGoal));
  const [editingWeeklyGoal, setEditingWeeklyGoal] = useState(false);
  const [weeklyGoalInput, setWeeklyGoalInput] = useState(String(user.weeklyGoal ?? 50));
  const [showMonthlyReport, setShowMonthlyReport] = useState(false);
  const [notifPermission, setNotifPermission] = useState<NotificationPermission>(getNotificationPermission());
  const [toast, setToast] = useState<string | null>(null);
  const prevMilestonesRef = useRef<Record<string, number> | null>(null);

  const handleToggleNotifications = async () => {
    if (notifPermission === 'granted' && user.notificationsEnabled) {
      cancelDailyReminder();
      onUpdateProfile({ notificationsEnabled: false });
      setToast('🔕 Daily reminders turned off');
    } else {
      const perm = await requestNotificationPermission();
      setNotifPermission(perm);
      if (perm === 'granted') {
        scheduleDailyReminder(20); // 8pm
        onUpdateProfile({ notificationsEnabled: true });
        setToast('🔔 Daily reminders set for 8 PM!');
      } else {
        setToast('⚠️ Please allow notifications in browser settings');
      }
    }
    setTimeout(() => setToast(null), 4000);
  };

  const handleSaveWeeklyGoal = () => {
    const parsed = parseFloat(weeklyGoalInput);
    if (!isNaN(parsed) && parsed > 0) {
      onUpdateProfile({ weeklyGoal: parsed });
    }
    setEditingWeeklyGoal(false);
  };

  const computedMilestones = computeAchievements(user, trips);
  const resolvedMilestones = milestones && milestones.length > 0 ? milestones : computedMilestones;

  // Detect newly unlocked milestones and show toast
  useEffect(() => {
    const lsKey = `ecopulse_achievements_${user.name}`;
    const stored = localStorage.getItem(lsKey);
    const lastSeen: Record<string, number> = stored ? JSON.parse(stored) : {};

    let newUnlock: string | null = null;
    computedMilestones.forEach((m) => {
      const prev = lastSeen[m.id] ?? -1;
      if (m.unlockedTierIndex > prev && m.unlockedTierIndex >= 0) {
        const tier = m.allTiers[m.unlockedTierIndex];
        newUnlock = `🏆 ${m.title}: ${tier.label} Unlocked!`;
        lastSeen[m.id] = m.unlockedTierIndex;
      }
    });

    localStorage.setItem(lsKey, JSON.stringify(lastSeen));

    if (newUnlock && prevMilestonesRef.current !== null) {
      setToast(newUnlock);
    }
    prevMilestonesRef.current = lastSeen;
  }, [user.streak, trips.length]);

  const handleSaveGoal = () => {
    const parsed = parseFloat(goalInput);
    if (!isNaN(parsed) && parsed > 0) {
      onUpdateProfile({ dailyGoal: parsed });
    }
    setEditingGoal(false);
  };

  // 30-day heatmap
  const heatmap = buildHeatmapData(trips);
  const today = new Date();
  const heatmapDays: { date: string; co2: number }[] = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const dateStr = d.toISOString().split('T')[0];
    heatmapDays.push({ date: dateStr, co2: heatmap.get(dateStr) || 0 });
  }

  const maxCo2 = Math.max(...heatmapDays.map((d) => d.co2), 1);

  const getHeatColor = (co2: number) => {
    if (co2 === 0) return 'bg-slate-100 dark:bg-slate-800';
    const intensity = co2 / maxCo2;
    if (intensity < 0.25) return 'bg-emerald-200 dark:bg-emerald-900';
    if (intensity < 0.5) return 'bg-emerald-400 dark:bg-emerald-700';
    if (intensity < 0.75) return 'bg-amber-400 dark:bg-amber-600';
    return 'bg-rose-500 dark:bg-rose-600';
  };

  const resolvedRankings =
    rankings && rankings.length > 0
      ? rankings
      : [
        {
          name: `${user.name} (You)`,
          points: user.points,
          rank: user.rank,
          avatar: user.avatarId,
          isUser: true,
        },
      ];

  return (
    <>
      {toast && <Toast message={toast} onDismiss={() => setToast(null)} />}

      <div className="space-y-6 animate-in slide-in-from-right-4 duration-300 pb-8 pt-4">

        {/* Hero Card */}
        <div className="glass p-8 rounded-[2.5rem] border border-white/10 shadow-xl relative overflow-hidden text-center animate-fade-in-up opacity-0" style={{ animationDelay: '0ms' }}>
          <div className="absolute top-0 right-0 p-8 opacity-10 drop-shadow-2xl">
            <i className="fa-solid fa-award text-8xl text-emerald-500" />
          </div>
          <div className="w-24 h-24 rounded-[2rem] bg-slate-900 dark:bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-4xl mx-auto mb-4 shadow-xl border border-emerald-500/20 relative z-10 group">
            <div className="absolute inset-0 bg-emerald-500/20 rounded-[2rem] blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
            <i className={`fa-solid ${user.avatarId} relative z-10`} />
          </div>
          <h2 className="text-2xl font-black text-slate-800 dark:text-white relative z-10">{user.name}</h2>
          <div className="flex justify-center gap-2 mt-2">
            <span className="px-3 py-1 bg-emerald-500 text-white text-[10px] font-black rounded-full uppercase tracking-widest">{user.level}</span>
            <span className="px-3 py-1 bg-slate-900 dark:bg-slate-800 text-white text-[10px] font-black rounded-full uppercase tracking-widest">Rank #{user.rank}</span>
            {user.streak > 0 && (
              <span className="px-3 py-1 bg-amber-500 text-white text-[10px] font-black rounded-full uppercase tracking-widest flex items-center gap-1">
                <i className="fa-solid fa-fire-flame-curved" /> {user.streak}d
              </span>
            )}
          </div>

          {/* Daily Goal Editor */}
          <div className="mt-8 p-5 bg-slate-50 dark:bg-slate-800/50 rounded-2xl text-left border border-slate-200 dark:border-slate-700/50">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-black text-slate-400 uppercase tracking-[0.16em]">Daily CO₂ Goal</span>
              <button
                onClick={() => { setEditingGoal(!editingGoal); setGoalInput(String(user.dailyGoal)); }}
                className="text-[10px] font-black text-emerald-500 hover:text-emerald-600 dark:hover:text-emerald-400 uppercase tracking-widest transition-colors"
              >
                {editingGoal ? 'Cancel' : 'Edit'}
              </button>
            </div>
            {editingGoal ? (
              <div className="flex gap-2 items-center">
                <input
                  type="number"
                  value={goalInput}
                  onChange={(e) => setGoalInput(e.target.value)}
                  className="flex-1 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 p-2 rounded-xl font-bold text-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500 text-sm"
                  placeholder="kg CO2"
                  min="0.1"
                  step="0.5"
                />
                <span className="text-xs text-slate-400 font-bold">kg</span>
                <button
                  onClick={handleSaveGoal}
                  className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 active:scale-95 text-white text-[10px] font-black uppercase tracking-widest rounded-xl transition-all shadow-md shadow-emerald-500/20"
                >
                  Save
                </button>
              </div>
            ) : (
              <div className="text-xl font-black text-slate-800 dark:text-white">
                {user.dailyGoal} <span className="text-xs font-bold text-slate-400">kg CO₂/day</span>
              </div>
            )}
          </div>

          {/* Weekly Goal Editor */}
          <div className="mt-3 p-5 bg-slate-50 dark:bg-slate-800/50 rounded-2xl text-left border border-slate-200 dark:border-slate-700/50">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-black text-slate-400 uppercase tracking-[0.16em]">Weekly CO₂ Goal</span>
              <button
                onClick={() => { setEditingWeeklyGoal(!editingWeeklyGoal); setWeeklyGoalInput(String(user.weeklyGoal ?? 50)); }}
                className="text-[10px] font-black text-emerald-500 hover:text-emerald-600 dark:hover:text-emerald-400 uppercase tracking-widest transition-colors"
              >
                {editingWeeklyGoal ? 'Cancel' : 'Edit'}
              </button>
            </div>
            {editingWeeklyGoal ? (
              <div className="flex gap-2 items-center">
                <input
                  type="number"
                  value={weeklyGoalInput}
                  onChange={(e) => setWeeklyGoalInput(e.target.value)}
                  className="flex-1 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 p-2 rounded-xl font-bold text-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500 text-sm"
                  placeholder="kg CO₂"
                  min="1"
                  step="5"
                />
                <span className="text-xs text-slate-400 font-bold">kg/week</span>
                <button onClick={handleSaveWeeklyGoal} className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 active:scale-95 text-white text-[10px] font-black uppercase tracking-widest rounded-xl transition-all shadow-md shadow-emerald-500/20">Save</button>
              </div>
            ) : (
              <div className="text-xl font-black text-slate-800 dark:text-white">
                {user.weeklyGoal ?? 50} <span className="text-xs font-bold text-slate-400">kg CO₂/week</span>
              </div>
            )}
          </div>

          {/* Notifications + Monthly Report */}
          <div className="mt-3 grid grid-cols-2 gap-3">
            <button
              onClick={handleToggleNotifications}
              className={`flex flex-col items-center justify-center gap-2 p-5 rounded-2xl transition-all duration-300 hover:scale-[1.02] active:scale-95 ${user.notificationsEnabled && notifPermission === 'granted'
                ? 'bg-emerald-500/10 border border-emerald-500/30'
                : 'bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700'
                }`}
            >
              <i className={`fa-solid fa-bell text-xl ${user.notificationsEnabled && notifPermission === 'granted' ? 'text-emerald-500' : 'text-slate-400'
                }`} />
              <span className="text-[10px] font-black text-slate-600 dark:text-slate-300 uppercase tracking-widest text-center leading-tight">
                {user.notificationsEnabled && notifPermission === 'granted' ? 'Reminders On' : 'Enable Reminders'}
              </span>
            </button>
            <button
              onClick={() => setShowMonthlyReport(true)}
              className="flex flex-col items-center justify-center gap-2 p-4 bg-gradient-to-br from-indigo-500/10 to-purple-500/10 border border-indigo-500/20 rounded-2xl hover:from-indigo-500/20 hover:to-purple-500/20 transition-all"
            >
              <i className="fa-solid fa-chart-bar text-xl text-indigo-500" />
              <span className="text-[10px] font-black text-slate-600 dark:text-slate-300 uppercase tracking-widest text-center leading-tight">Monthly Report</span>
            </button>
          </div>
        </div>

        {/* 30-Day Activity Heatmap */}
        <div className="glass p-6 rounded-[2.5rem] border border-white/10 animate-fade-in-up opacity-0" style={{ animationDelay: '100ms' }}>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-[11px] font-black text-slate-400 uppercase tracking-[0.16em]">
              <i className="fa-solid fa-calendar-days mr-2" />30-Day Activity
            </h3>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded bg-slate-100 dark:bg-slate-800" />
              <span className="text-[10px] text-slate-400 font-bold">None</span>
              <div className="w-3 h-3 rounded bg-emerald-400" />
              <span className="text-[10px] text-slate-400 font-bold">Low</span>
              <div className="w-3 h-3 rounded bg-rose-500" />
              <span className="text-[10px] text-slate-400 font-bold">High</span>
            </div>
          </div>
          <div className="grid grid-cols-10 gap-1">
            {heatmapDays.map((d) => (
              <div
                key={d.date}
                title={`${d.date}: ${d.co2.toFixed(1)} kg CO₂`}
                className={`aspect-square rounded-sm transition-all duration-300 ${getHeatColor(d.co2)}`}
              />
            ))}
          </div>
          <div className="mt-3 flex justify-between text-[10px] font-bold text-slate-400">
            <span>{new Date(heatmapDays[0].date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>
            <span>Today</span>
          </div>
        </div>

        {/* Achievements */}
        {resolvedMilestones.length > 0 && (
          <div className="space-y-4 animate-fade-in-up opacity-0" style={{ animationDelay: '200ms' }}>
            <div className="flex justify-between items-center ml-1">
              <h3 className="text-[11px] font-black text-slate-400 uppercase tracking-[0.16em]">Achievements</h3>
              <span className="text-[10px] font-bold text-emerald-500 uppercase tracking-[0.12em]">
                {resolvedMilestones.filter(m => m.unlockedTierIndex >= 0).length}/{resolvedMilestones.length} Unlocked
              </span>
            </div>
            <div className="space-y-4">
              {resolvedMilestones.map((m) => {
                const progressToNext =
                  m.unlockedTierIndex + 1 < m.allTiers.length
                    ? (m.currentValue / m.nextMilestone) * 100
                    : 100;

                const currentTierLabel =
                  m.unlockedTierIndex >= 0
                    ? m.allTiers[m.unlockedTierIndex].label
                    : null;

                return (
                  <div
                    key={m.id}
                    className={`glass interactive p-6 rounded-[2.5rem] border-white/5 shadow-md group transition-all hover:bg-white/90 dark:hover:bg-slate-800/90 ${m.unlockedTierIndex < 0 ? 'opacity-70' : ''}`}
                  >
                    <div className="flex justify-between items-start mb-4">
                      <div className="flex gap-4">
                        <div className={`w-14 h-14 rounded-2xl flex items-center justify-center text-2xl shadow-lg flex-shrink-0 ${m.unlockedTierIndex >= 0 ? 'bg-slate-900 dark:bg-slate-800 text-emerald-500' : 'bg-slate-100 dark:bg-slate-800 text-slate-400'}`}>
                          <i className={`fa-solid ${m.icon}`} />
                        </div>
                        <div className="pr-4">
                          <div className="flex items-center gap-2 mb-1">
                            <h4 className="font-black text-slate-800 dark:text-white text-sm">{m.title}</h4>
                            {currentTierLabel && (
                              <span className="px-2 py-0.5 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[10px] font-black rounded-full uppercase">
                                {currentTierLabel}
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] font-medium text-slate-500 dark:text-slate-300 leading-tight">
                            {m.description}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Tier pips */}
                    <div className="flex gap-1.5 mb-4">
                      {m.allTiers.map((tier, idx) => (
                        <div
                          key={idx}
                          title={tier.label}
                          className={`flex-1 h-1.5 rounded-full transition-all ${idx <= m.unlockedTierIndex ? 'bg-emerald-500' : 'bg-slate-200 dark:bg-slate-700'}`}
                        />
                      ))}
                    </div>

                    {/* Progress bar */}
                    <div className="space-y-1.5">
                      <div className="flex justify-between items-center px-0.5">
                        <span className="text-[10px] font-black text-slate-400 uppercase">{m.unit} Progress</span>
                        <span className="text-xs font-black text-slate-800 dark:text-white">
                          {m.currentValue.toLocaleString()} <span className="text-slate-400">/ {m.nextMilestone.toLocaleString()}</span>
                        </span>
                      </div>
                      <div className="h-2.5 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden shadow-inner">
                        <div
                          className="h-full bg-gradient-to-r from-emerald-400 via-emerald-500 to-teal-500 transition-all duration-1000 shadow-[0_0_10px_rgba(16,185,129,0.4)]"
                          style={{ width: `${Math.min(progressToNext, 100)}%` }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Leaderboard */}
        {resolvedRankings.length > 0 && (
          <div className="space-y-4 animate-fade-in-up opacity-0" style={{ animationDelay: '300ms' }}>
            <h3 className="text-[11px] font-black text-slate-400 uppercase tracking-[0.16em] ml-1">
              {rankings && rankings.length > 0 ? 'Global Leaderboard' : 'Your Rank'}
            </h3>
            <div className="glass rounded-[2.5rem] overflow-hidden border-white/5 shadow-lg">
              {(() => {
                const top5 = resolvedRankings.slice(0, 5);
                const userEntry = resolvedRankings.find(r => r.isUser);
                const userIdx = resolvedRankings.findIndex(r => r.isUser);
                
                const displayList = [...top5];
                let showDots = false;
                let showUserAtBottom = false;

                if (userIdx >= 5) {
                  showDots = true;
                  if (userEntry) displayList.push(userEntry);
                }

                return (
                  <>
                    {top5.map((r, i) => (
                      <div
                        key={`top-${i}`}
                        className={`flex items-center justify-between p-5 border-b border-slate-50 dark:border-slate-800/50 last:border-none ${r.isUser ? 'bg-emerald-500/10' : 'bg-transparent'}`}
                      >
                        <div className="flex items-center gap-4">
                          <span className="text-[10px] font-black w-8 text-center">
                            {r.rank === 1 ? '🥇' : r.rank === 2 ? '🥈' : r.rank === 3 ? '🥉' : (
                              <span className={r.rank <= 3 ? 'text-amber-500' : 'text-slate-400'}>#{r.rank}</span>
                            )}
                          </span>
                          <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-500 dark:text-slate-400 border border-white/10 shadow-inner">
                            <i className={`fa-solid ${r.avatar}`} />
                          </div>
                          <span className={`text-sm tracking-tight ${r.isUser ? 'font-black text-slate-800 dark:text-white' : 'font-bold text-slate-600 dark:text-slate-300'}`}>
                            {r.name}
                          </span>
                        </div>
                        <span className="text-[10px] font-black text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-3 py-1.5 rounded-xl">
                          {r.points.toLocaleString()} pts
                        </span>
                      </div>
                    ))}
                    
                    {showDots && (
                      <div className="flex justify-center p-2 text-slate-400">
                        <i className="fa-solid fa-ellipsis-vertical" />
                      </div>
                    )}

                    {userIdx >= 5 && userEntry && (
                      <div
                        className="flex items-center justify-between p-5 bg-emerald-500/10"
                      >
                        <div className="flex items-center gap-4">
                          <span className="text-[10px] font-black w-8 text-center text-slate-400">
                            #{userEntry.rank}
                          </span>
                          <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-500 dark:text-slate-400 border border-white/10 shadow-inner">
                            <i className={`fa-solid ${userEntry.avatar}`} />
                          </div>
                          <span className="text-sm tracking-tight font-black text-slate-800 dark:text-white">
                            {userEntry.name}
                          </span>
                        </div>
                        <span className="text-[10px] font-black text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-3 py-1.5 rounded-xl">
                          {userEntry.points.toLocaleString()} pts
                        </span>
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
          </div>
        )}
      </div>

      {/* Monthly Report Modal */}
      {showMonthlyReport && (
        <MonthlyReport
          user={user}
          trips={trips}
          bills={bills}
          onClose={() => setShowMonthlyReport(false)}
        />
      )}
    </>
  );
};

export default Profile;
