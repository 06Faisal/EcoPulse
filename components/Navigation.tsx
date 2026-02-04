
import React from 'react';

interface NavigationProps {
  activeTab: 'home' | 'track' | 'emissions' | 'ai' | 'profile';
  onTabChange: (tab: 'home' | 'track' | 'emissions' | 'ai' | 'profile') => void;
}

const Navigation: React.FC<NavigationProps> = ({ activeTab, onTabChange }) => {
  const tabs: {id: 'home' | 'track' | 'emissions' | 'ai' | 'profile', icon: string, label: string}[] = [
    { id: 'home', icon: 'fa-house-chimney', label: 'Home' },
    { id: 'track', icon: 'fa-square-plus', label: 'Log' },
    { id: 'emissions', icon: 'fa-chart-pie', label: 'Impact' },
    { id: 'ai', icon: 'fa-brain', label: 'Advisor' },
    { id: 'profile', icon: 'fa-trophy', label: 'Social' }
  ];

  return (
    <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md bg-white/80 dark:bg-slate-900/80 backdrop-blur-2xl border-t border-slate-100 dark:border-slate-800 flex justify-around items-center px-4 py-4 safe-bottom z-40 transition-colors duration-300">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onTabChange(tab.id)}
          className={`flex flex-col items-center gap-1.5 transition-all duration-300 ${activeTab === tab.id ? 'active-tab' : 'text-slate-400 dark:text-slate-600 hover:text-slate-900 dark:hover:text-slate-300'}`}
        >
          <div className={`w-12 h-10 rounded-2xl flex items-center justify-center transition-all ${activeTab === tab.id ? 'bg-emerald-500/10 text-xl' : 'text-lg'}`}>
            <i className={`fa-solid ${tab.icon}`}></i>
          </div>
          <span className="text-[11px] font-black uppercase tracking-[0.12em]">{tab.label}</span>
        </button>
      ))}
    </nav>
  );
};

export default Navigation;
