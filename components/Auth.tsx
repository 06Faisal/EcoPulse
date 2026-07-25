import React, { useState } from 'react';
import { cloud } from '../services/cloudService';
import { UserProfile } from '../services/types';

interface AuthProps {
  onLogin: (payload: { id: string; username: string }) => void;
}

const MIN_PASSWORD_LENGTH = 8;

const HIGHLIGHTS = [
  { icon: 'fa-route', title: 'Log in seconds', copy: 'Trips and utility bills, tracked without the spreadsheet.' },
  { icon: 'fa-brain', title: 'AI that explains', copy: 'Forecasts and recommendations grounded in your own history.' },
  { icon: 'fa-trophy', title: 'Stay accountable', copy: 'Streaks, goals and challenges that keep the habit going.' }
];

const Auth: React.FC<AuthProps> = ({ onLogin }) => {
  const [isLogin, setIsLogin] = useState(true);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (username.trim().length < 3) return setError('Username must be at least 3 characters.');

    // Length is a policy for *new* passwords only. Applying it at sign-in
    // rejects valid existing credentials created under the old 6-character
    // rule and locks those accounts out of the app entirely.
    if (!isLogin && password.length < MIN_PASSWORD_LENGTH) {
      return setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
    }
    if (!password) return setError('Enter your password.');

    setBusy(true);
    try {
      if (isLogin) {
        onLogin(await cloud.signIn(username, password));
      } else {
        const starterProfile: UserProfile = {
          name: username,
          avatarId: 'fa-user-astronaut',
          points: 0,
          level: 'Eco Explorer',
          dailyGoal: 10,
          rank: 1,
          streak: 0,
          darkMode: true,
          customVehicles: [],
          availableVehicles: ['Car', 'Bike', 'Bus', 'Train', 'Walking']
        };
        onLogin(await cloud.signUp(username, password, starterProfile));
      }
    } catch (err: any) {
      setError(err?.message || 'Authentication failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-slate-50 dark:bg-slate-950 overflow-y-auto">
      <div className="min-h-full lg:grid lg:grid-cols-2">
        {/* ── Brand panel: desktop only ─────────────────────────────────── */}
        <aside className="hidden lg:flex flex-col justify-between bg-slate-900 text-white p-12 xl:p-16 relative overflow-hidden">
          <div className="absolute -top-24 -right-24 w-96 h-96 bg-emerald-500/20 blur-3xl rounded-full" aria-hidden="true" />

          <div className="relative flex items-center gap-3">
            <div className="w-12 h-12 bg-emerald-500 rounded-2xl flex items-center justify-center text-2xl shadow-xl">
              <i className="fa-solid fa-leaf" aria-hidden="true" />
            </div>
            <span className="text-lg font-bold tracking-tight">EcoPulse AI</span>
          </div>

          <div className="relative max-w-md">
            <h2 className="text-4xl xl:text-5xl font-bold tracking-tight leading-[1.1]">
              Understand your carbon footprint.
            </h2>
            <p className="text-slate-300 font-medium mt-4 leading-relaxed">
              EcoPulse turns everyday travel and energy use into a picture you can act on.
            </p>

            <ul className="mt-10 space-y-6">
              {HIGHLIGHTS.map((item) => (
                <li key={item.title} className="flex gap-4">
                  <span className="w-10 h-10 shrink-0 rounded-xl bg-white/10 flex items-center justify-center text-emerald-400">
                    <i className={`fa-solid ${item.icon}`} aria-hidden="true" />
                  </span>
                  <span>
                    <span className="block font-bold text-sm">{item.title}</span>
                    <span className="block text-sm text-slate-400 font-medium leading-relaxed">{item.copy}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <p className="relative text-[0.625rem] text-slate-500 font-semibold uppercase tracking-[0.08em]">
            &copy; {new Date().getFullYear()} EcoPulse AI
          </p>
        </aside>

        {/* ── Form panel ────────────────────────────────────────────────── */}
        <main className="flex items-center justify-center px-6 py-16 sm:px-10">
          <div className="w-full max-w-sm">
            <div className="mb-10 lg:hidden">
              <div className="w-16 h-16 bg-emerald-500 rounded-3xl flex items-center justify-center text-white text-3xl mb-6 shadow-xl">
                <i className="fa-solid fa-leaf" aria-hidden="true" />
              </div>
              <h1 className="text-3xl font-bold text-slate-800 dark:text-white tracking-tight">EcoPulse AI</h1>
            </div>

            <h2 className="text-2xl font-bold text-slate-800 dark:text-white tracking-tight">
              {isLogin ? 'Welcome back' : 'Create your account'}
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 font-medium mt-1.5">
              {isLogin
                ? 'Sign in to pick up where you left off.'
                : 'Start tracking your footprint in under a minute.'}
            </p>

            <form onSubmit={handleSubmit} className="space-y-4 mt-8">
              {error && (
                <div
                  role="alert"
                  className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-2xl text-rose-600 dark:text-rose-400 text-xs font-bold"
                >
                  {error}
                </div>
              )}

              <div>
                <label
                  htmlFor="username"
                  className="block text-[0.6875rem] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-[0.08em] mb-2"
                >
                  Username
                </label>
                <input
                  id="username"
                  name="username"
                  type="text"
                  required
                  autoComplete="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="ecowarrior"
                  className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 px-4 py-3.5 rounded-2xl font-semibold text-slate-800 dark:text-white"
                />
              </div>

              <div>
                <label
                  htmlFor="password"
                  className="block text-[0.6875rem] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-[0.08em] mb-2"
                >
                  Password
                </label>
                {/* minLength applies to sign-up only; on sign-in the browser
                    would otherwise block submission of existing short passwords. */}
                <input
                  id="password"
                  name="password"
                  type="password"
                  required
                  minLength={isLogin ? undefined : MIN_PASSWORD_LENGTH}
                  autoComplete={isLogin ? 'current-password' : 'new-password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  aria-describedby={isLogin ? undefined : 'password-hint'}
                  className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 px-4 py-3.5 rounded-2xl font-semibold text-slate-800 dark:text-white"
                />
                {!isLogin && (
                  <p id="password-hint" className="text-[0.6875rem] text-slate-400 font-medium mt-2">
                    At least {MIN_PASSWORD_LENGTH} characters.
                  </p>
                )}
              </div>

              <button
                type="submit"
                disabled={busy}
                className="w-full bg-slate-900 dark:bg-emerald-500 hover:bg-slate-800 dark:hover:bg-emerald-400 disabled:opacity-60 disabled:cursor-not-allowed text-white py-4 px-5 rounded-2xl font-bold text-sm uppercase tracking-[0.08em] shadow-xl transition-colors"
              >
                {busy ? 'Please wait…' : isLogin ? 'Sign in' : 'Create account'}
              </button>
            </form>

            <p className="mt-8 text-center text-sm text-slate-500 dark:text-slate-400 font-medium">
              {isLogin ? "Don't have an account?" : 'Already registered?'}{' '}
              <button
                type="button"
                onClick={() => {
                  setIsLogin(!isLogin);
                  setError(null);
                }}
                className="font-bold text-emerald-600 dark:text-emerald-400 hover:underline inline-flex items-center justify-center min-h-[44px] px-2"
              >
                {isLogin ? 'Sign up' : 'Sign in'}
              </button>
            </p>
          </div>
        </main>
      </div>
    </div>
  );
};

export default Auth;
