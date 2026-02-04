
import React from 'react';
import { UserProfile, Trip, MilestoneAchievement, LeaderboardEntry } from '../services/types';

interface ProfileProps {
  user: UserProfile;
  trips: Trip[];
  onUpdateProfile: (updates: Partial<UserProfile>) => void;
  milestones?: MilestoneAchievement[];
  rankings?: LeaderboardEntry[];
}

const Profile: React.FC<ProfileProps> = ({ user, trips, milestones, rankings }) => {
  const totalCarbonSaved = Math.floor(trips.reduce((a, b) => a + (b.co2 || 0), 0));
  const publicTransitTrips = trips.filter(t => t.vehicle === 'Bus' || t.vehicle === 'Train').length;
  const totalDistance = Math.floor(trips.reduce((a, b) => a + (b.distance || 0), 0));

  const computedMilestones: MilestoneAchievement[] = [
    {
      id: 'streak',
      title: 'Daily Streak',
      description: 'Keep logging your daily habits to build a sustainable streak.',
      icon: 'fa-fire-flame-curved',
      currentValue: user.streak,
      nextMilestone: 7,
      level: 1,
      unit: 'days'
    },
    {
      id: 'carbon-saved',
      title: 'Carbon Saver',
      description: 'Offset carbon by choosing low-impact transit and energy options.',
      icon: 'fa-seedling',
      currentValue: totalCarbonSaved,
      nextMilestone: 50,
      level: 1,
      unit: 'kg'
    },
    {
      id: 'public-hero',
      title: 'Public Hero',
      description: 'Reduce congestion by using public buses and trains.',
      icon: 'fa-bus-simple',
      currentValue: publicTransitTrips,
      nextMilestone: 5,
      level: 1,
      unit: 'trips'
    },
    {
      id: 'green-commuter',
      title: 'Green Commuter',
      description: 'Log 100km of total travel distance to unlock the next tier.',
      icon: 'fa-route',
      currentValue: totalDistance,
      nextMilestone: 100,
      level: 1,
      unit: 'km'
    }
  ];

  const resolvedMilestones = milestones && milestones.length > 0 ? milestones : computedMilestones;
  const resolvedRankings =
    rankings && rankings.length > 0
      ? rankings
      : [
          {
            name: `${user.name} (You)`,
            points: user.points,
            rank: user.rank,
            avatar: user.avatarId,
            isUser: true
          }
        ];

  return (
    <div className="space-y-8 animate-in slide-in-from-right-4 duration-300 pb-8 pt-4">
      <div className="glass p-8 rounded-[2.5rem] border border-white/10 shadow-xl relative overflow-hidden text-center">
        <div className="absolute top-0 right-0 p-8 opacity-10">
          <i className="fa-solid fa-award text-8xl text-emerald-500"></i>
        </div>
        <div className="w-24 h-24 rounded-3xl bg-slate-900 dark:bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-4xl mx-auto mb-4 shadow-lg border border-emerald-500/20">
          <i className={`fa-solid ${user.avatarId}`}></i>
        </div>
        <h2 className="text-2xl font-black text-slate-800 dark:text-white">{user.name}</h2>
        <div className="flex justify-center gap-2 mt-2">
          <span className="px-3 py-1 bg-emerald-500 text-white text-[10px] font-black rounded-full uppercase tracking-widest">{user.level}</span>
          <span className="px-3 py-1 bg-slate-900 dark:bg-slate-800 text-white text-[10px] font-black rounded-full uppercase tracking-widest">Rank #{user.rank}</span>
        </div>
      </div>

      {resolvedMilestones.length > 0 && (
        <div className="space-y-4">
          <div className="flex justify-between items-center ml-1">
            <h3 className="text-[11px] font-black text-slate-400 dark:text-slate-400 uppercase tracking-[0.16em]">Dynamic Achievements</h3>
            <span className="text-[10px] font-bold text-emerald-500 uppercase tracking-[0.12em]">Tracked via AI</span>
          </div>
          <div className="space-y-4">
            {resolvedMilestones.map((m) => (
              <div key={m.id} className="glass p-6 rounded-[2rem] border-white/5 shadow-md group transition-all hover:bg-white/90 dark:hover:bg-slate-800/90">
                <div className="flex justify-between items-start mb-4">
                  <div className="flex gap-4">
                    <div className="w-14 h-14 rounded-2xl bg-slate-900 dark:bg-slate-800 text-emerald-500 flex items-center justify-center text-2xl shadow-lg flex-shrink-0">
                      <i className={`fa-solid ${m.icon}`}></i>
                    </div>
                    <div className="pr-4">
                      <h4 className="font-black text-slate-800 dark:text-white text-sm mb-1">{m.title}</h4>
                      <p className="text-[11px] font-medium text-slate-500 dark:text-slate-300 leading-tight">
                        {m.description}
                      </p>
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <span className="text-xs font-black text-emerald-500 uppercase tracking-tighter">Tier {m.level}</span>
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between items-center px-1">
                    <span className="text-[10px] font-black text-slate-400 uppercase">{m.unit} Progress</span>
                    <span className="text-xs font-black text-slate-800 dark:text-white">{m.currentValue} <span className="text-slate-400">/ {m.nextMilestone}</span></span>
                  </div>
                  <div className="h-2.5 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden shadow-inner">
                    <div className="h-full bg-gradient-to-r from-emerald-400 via-emerald-500 to-teal-500 transition-all duration-1000 shadow-[0_0_10px_rgba(16,185,129,0.4)]" style={{ width: `${Math.min((m.currentValue / m.nextMilestone) * 100, 100)}%` }} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {resolvedRankings.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-[11px] font-black text-slate-400 dark:text-slate-400 uppercase tracking-[0.16em] ml-1">
            {rankings && rankings.length > 0 ? 'Global Leaderboard' : 'Your Rank'}
          </h3>
          <div className="glass rounded-[2rem] overflow-hidden border-white/5 shadow-lg">
            {resolvedRankings.map((r, i) => (
              <div key={i} className={`flex items-center justify-between p-5 border-b border-slate-50 dark:border-slate-800/50 last:border-none ${r.isUser ? 'bg-emerald-500/10' : 'bg-transparent'}`}>
                <div className="flex items-center gap-4">
                  <span className={`text-[10px] font-black w-6 ${r.rank <= 3 ? 'text-amber-500' : 'text-slate-400'}`}>#{r.rank}</span>
                  <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-500 dark:text-slate-400 border border-white/10 shadow-inner">
                    <i className={`fa-solid ${r.avatar}`}></i>
                  </div>
                  <span className={`text-sm tracking-tight ${r.isUser ? 'font-black text-slate-800 dark:text-white' : 'font-bold text-slate-600 dark:text-slate-300'}`}>{r.name}</span>
                </div>
                <span className="text-[10px] font-black text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-3 py-1.5 rounded-xl">{r.points} pts</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default Profile;
