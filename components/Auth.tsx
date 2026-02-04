
import React, { useState } from 'react';
import { cloud } from '../services/cloudService';
import { UserProfile } from '../services/types';

interface AuthProps {
  onLogin: (payload: { id: string; username: string }) => void;
}

const Auth: React.FC<AuthProps> = ({ onLogin }) => {
  const [isLogin, setIsLogin] = useState(true);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (username.length < 3) return setError('Username too short.');
    if (password.length < 6) return setError('Password too short.');

    try {
      if (isLogin) {
        const result = await cloud.signIn(username, password);
        onLogin(result);
      } else {
        const starterProfile: UserProfile = {
          name: username,
          avatarId: 'fa-user-astronaut',
          points: 0,
          level: 'Eco Explorer',
          dailyGoal: 10,
          rank: 1,
          streak: 0,
          darkMode: false,
          customVehicles: [],
          availableVehicles: ['Car', 'Bike', 'Bus', 'Train', 'Walking']
        };
        const result = await cloud.signUp(username, password, starterProfile);
        onLogin(result);
      }
    } catch (err: any) {
      setError(err?.message || 'Authentication failed.');
    }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-slate-50 dark:bg-slate-950 flex flex-col px-8 pt-24 pb-12 overflow-y-auto">
      <div className="mb-12">
        <div className="w-16 h-16 bg-emerald-500 rounded-3xl flex items-center justify-center text-white text-3xl mb-6 shadow-2xl">
          <i className="fa-solid fa-leaf"></i>
        </div>
        <h1 className="text-4xl font-black text-slate-800 dark:text-white tracking-tight">EcoPulse AI</h1>
        <p className="text-slate-500 font-medium mt-2">Next-Gen Sustainability Core</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-2xl text-rose-500 text-xs font-bold">{error}</div>}
        <input
          type="text" required value={username} onChange={(e) => setUsername(e.target.value)}
          placeholder="Username"
          className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 rounded-2xl font-bold"
        />
        <input
          type="password" required value={password} onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 rounded-2xl font-bold"
        />
        <button type="submit" className="w-full bg-slate-900 dark:bg-emerald-500 text-white p-5 rounded-2xl font-black uppercase tracking-widest shadow-2xl">
          {isLogin ? 'Secure Login' : 'Initialize Account'}
        </button>
      </form>

      <div className="mt-auto pt-12 text-center">
        <button onClick={() => {setIsLogin(!isLogin); setError(null);}} className="text-sm font-bold text-slate-500 uppercase tracking-widest">
          {isLogin ? "Join the network" : "Existing user? Sign in"}
        </button>
      </div>
    </div>
  );
};

export default Auth;
