import React from 'react';

export type TabId = 'home' | 'track' | 'emissions' | 'ai' | 'challenges' | 'profile';

interface NavigationProps {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
}

const TABS: { id: TabId; icon: string; label: string; hint: string }[] = [
  { id: 'home', icon: 'fa-house-chimney', label: 'Home', hint: 'Overview' },
  { id: 'track', icon: 'fa-square-plus', label: 'Log', hint: 'Record a trip' },
  { id: 'emissions', icon: 'fa-chart-pie', label: 'Impact', hint: 'Breakdown' },
  { id: 'ai', icon: 'fa-brain', label: 'Advisor', hint: 'AI insights' },
  { id: 'challenges', icon: 'fa-trophy', label: 'Compete', hint: 'Challenges' },
  { id: 'profile', icon: 'fa-user-circle', label: 'Profile', hint: 'You' }
];

const Navigation: React.FC<NavigationProps> = ({ activeTab, onTabChange }) => (
  <>
    {/* ── Mobile: floating bottom bar ─────────────────────────────────────── */}
    <div className="fixed bottom-0 inset-x-0 z-50 px-3 pb-3 pt-2 pointer-events-none lg:hidden safe-bottom">
      <nav
        aria-label="Primary"
        className="mx-auto w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200/70 dark:border-white/10 p-1.5 rounded-[2rem] flex justify-between items-center shadow-[0_10px_30px_rgba(0,0,0,0.08)] pointer-events-auto"
      >
        {TABS.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onTabChange(tab.id)}
              aria-current={isActive ? 'page' : undefined}
              className={`relative flex flex-col items-center justify-center w-full py-2 gap-1 rounded-2xl transition-colors duration-200 ${
                isActive
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : 'text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
              }`}
            >
              <i className={`fa-solid ${tab.icon} ${isActive ? 'text-lg' : 'text-base'}`} aria-hidden="true" />
              <span className="text-[0.5rem] uppercase tracking-[0.08em] font-bold">{tab.label}</span>
            </button>
          );
        })}
      </nav>
    </div>

    {/* ── Desktop: persistent sidebar ─────────────────────────────────────── */}
    <aside className="hidden lg:flex fixed inset-y-0 left-0 w-72 flex-col justify-between border-r border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-950/70 backdrop-blur-xl px-5 py-7 z-40">
      <div className="space-y-9">
        <div className="flex items-center gap-3 px-2">
          <div className="w-11 h-11 bg-emerald-500 rounded-2xl flex items-center justify-center text-white shadow-md shrink-0">
            <i className="fa-solid fa-leaf text-lg" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h1 className="text-base font-bold text-slate-800 dark:text-white tracking-tight leading-tight">
              EcoPulse AI
            </h1>
            <p className="text-[0.5625rem] font-bold text-slate-400 uppercase tracking-[0.08em]">
              Sustainability
            </p>
          </div>
        </div>

        <nav aria-label="Primary" className="space-y-1">
          {TABS.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => onTabChange(tab.id)}
                aria-current={isActive ? 'page' : undefined}
                className={`w-full flex items-center gap-3.5 px-4 py-3 rounded-xl transition-colors duration-200 text-left ${
                  isActive
                    ? 'bg-emerald-500/10 dark:bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                    : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/60 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                <i className={`fa-solid ${tab.icon} text-base w-5 text-center`} aria-hidden="true" />
                <span className="min-w-0">
                  <span className="block text-sm font-bold leading-tight">{tab.label}</span>
                  <span className="block text-[0.625rem] text-slate-400 dark:text-slate-500 font-medium leading-tight">
                    {tab.hint}
                  </span>
                </span>
              </button>
            );
          })}
        </nav>
      </div>

      <p className="text-[0.625rem] text-slate-400 dark:text-slate-600 font-semibold px-2">
        &copy; {new Date().getFullYear()} EcoPulse AI
      </p>
    </aside>
  </>
);

export default Navigation;
