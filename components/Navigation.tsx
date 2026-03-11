
import React from 'react';

interface NavigationProps {
  activeTab: 'home' | 'track' | 'emissions' | 'ai' | 'profile' | 'challenges';
  onTabChange: (tab: 'home' | 'track' | 'emissions' | 'ai' | 'profile' | 'challenges') => void;
}

const Navigation: React.FC<NavigationProps> = ({ activeTab, onTabChange }) => {
  const tabs: { id: 'home' | 'track' | 'emissions' | 'ai' | 'challenges' | 'profile', icon: string, label: string }[] = [
    { id: 'home', icon: 'fa-house-chimney', label: 'Home' },
    { id: 'track', icon: 'fa-square-plus', label: 'Log' },
    { id: 'emissions', icon: 'fa-chart-pie', label: 'Impact' },
    { id: 'ai', icon: 'fa-brain', label: 'Advisor' },
    { id: 'challenges', icon: 'fa-trophy', label: 'Compete' },
    { id: 'profile', icon: 'fa-user-circle', label: 'Profile' },
  ];

  const activeIndex = tabs.findIndex(t => t.id === activeTab);

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 pointer-events-none">
      <nav className="mx-auto max-w-md bg-white dark:bg-slate-900 border-t border-slate-100 dark:border-slate-800 p-2 pb-safe flex justify-between items-center shadow-[0_-8px_30px_rgb(0,0,0,0.05)] pointer-events-auto relative overflow-hidden">
        {/* Sliding active pill background */}
        <div
          className="absolute top-2 bottom-2 w-[calc((100%-16px)/6)] bg-emerald-500/15 dark:bg-emerald-500/20 rounded-[1.5rem] transition-transform duration-500 ease-[cubic-bezier(0.175,0.885,0.32,1.275)]"
          style={{ transform: `translateX(${activeIndex * 100}%)` }}
        />

        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id as NavigationProps['activeTab'])}
            className={`relative z-10 flex flex-col items-center justify-center w-full py-2 gap-1 transition-colors duration-300 rounded-2xl interactive ${activeTab === tab.id
              ? 'text-emerald-600 dark:text-emerald-400 font-bold'
              : 'text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 font-medium'
              }`}
          >
            <i className={`fa-solid ${tab.icon} transition-transform duration-500 ease-[cubic-bezier(0.175,0.885,0.32,1.275)] ${activeTab === tab.id ? 'scale-110 text-lg shadow-emerald-500/20 drop-shadow-md' : 'text-base'}`}></i>
            <span className="text-[9px] uppercase tracking-[0.1em]">{tab.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
};

export default Navigation;
