import React, { useState, useEffect } from 'react';
import Auth from './components/Auth';
import Dashboard from './components/Dashboard';
import Tracker from './components/Tracker';
import Emissions from './components/Emissions';
import AIAdvisor from './components/AIAdvisor';
import Profile from './components/Profile';
import Navigation from './components/Navigation';
import { cloud } from './services/cloudService';
import { getAIAnalytics } from './services/geminiService';
import { Trip, UtilityBill, UserProfile, AIInsight, CustomVehicle, VehicleType, LeaderboardEntry } from './services/types';

function App() {
  const [currentUser, setCurrentUser] = useState<{ id: string; username: string } | null>(null);
  const [activeTab, setActiveTab] = useState<'home' | 'track' | 'emissions' | 'ai' | 'profile'>('home');
  const [trips, setTrips] = useState<Trip[]>([]);
  const [bills, setBills] = useState<UtilityBill[]>([]);
  const [insight, setInsight] = useState<AIInsight | null>(null);
  const [loadingInsight, setLoadingInsight] = useState(false);
  const [authReady, setAuthReady] = useState(false);
  const [userProfile, setUserProfile] = useState<UserProfile>({
    name: 'Alex Green',
    avatarId: 'fa-user-astronaut',
    points: 1250,
    level: 'Eco Warrior',
    dailyGoal: 10,
    rank: 28,
    streak: 3,
    darkMode: false,
    customVehicles: [],
    availableVehicles: ['Car', 'Bike', 'Bus', 'Train', 'Walking']
  });
  const [availableVehicles, setAvailableVehicles] = useState<VehicleType[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);

  const refreshLeaderboard = async (userId: string) => {
    try {
      const board = await cloud.fetchLeaderboard(userId);
      setLeaderboard(board);
      const myRank = board.find(r => r.isUser)?.rank || 1;
      setUserProfile(prev => ({ ...prev, rank: myRank }));
    } catch (error) {
      console.error('Failed to refresh leaderboard:', error);
    }
  };

  // Restore session
  useEffect(() => {
    const restore = async () => {
      try {
        const sessionUser = await cloud.getSessionUser();
        if (sessionUser) {
          const { profile } = await cloud.fetchUserData(sessionUser.id);
          setCurrentUser({ id: sessionUser.id, username: profile.name });
        }
      } catch (error) {
        console.error('Failed to restore session:', error);
      } finally {
        setAuthReady(true);
      }
    };
    restore();
  }, []);

  // Load user data on login
  useEffect(() => {
    if (!currentUser) return;
    const load = async () => {
      try {
        const data = await cloud.fetchUserData(currentUser.id);
        setTrips(data.trips);
        setBills(data.bills);
        setUserProfile({
          ...data.profile,
          customVehicles: data.customVehicles
        });
        setAvailableVehicles(data.profile.availableVehicles || ['Car', 'Bike', 'Bus', 'Train', 'Walking']);
        await refreshLeaderboard(currentUser.id);
      } catch (error) {
        console.error('Failed to load user data:', error);
      }
    };
    load();
  }, [currentUser]);

  // Dark mode
  useEffect(() => {
    if (userProfile.darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [userProfile.darkMode]);

  useEffect(() => {
    let lastScrollY = window.scrollY;
    let ticking = false;

    const updateScrollDirection = () => {
      const currentY = window.scrollY;
      const direction = currentY > lastScrollY ? 'down' : 'up';
      document.documentElement.setAttribute('data-scroll-direction', direction);
      lastScrollY = currentY;
      ticking = false;
    };

    updateScrollDirection();

    const handleScroll = () => {
      if (!ticking) {
        window.requestAnimationFrame(updateScrollDirection);
        ticking = true;
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      window.removeEventListener('scroll', handleScroll);
    };
  }, []);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const direction =
              document.documentElement.getAttribute('data-scroll-direction') || 'down';
            entry.target.setAttribute('data-reveal', direction);
            entry.target.classList.add('is-visible');
          } else {
            entry.target.classList.remove('is-visible');
          }
        });
      },
      { threshold: 0.2, rootMargin: '0px 0px -12% 0px' }
    );

    const observed = new Set<Element>();

    const scan = () => {
      document.querySelectorAll<HTMLElement>('.glass').forEach((card) => {
        if (!card.classList.contains('reveal-on-scroll')) {
          card.classList.add('reveal-on-scroll');
        }
        if (!observed.has(card)) {
          observed.add(card);
          observer.observe(card);
        }
      });
    };

    scan();

    const mutationObserver = new MutationObserver(scan);
    mutationObserver.observe(document.body, { childList: true, subtree: true });

    return () => {
      mutationObserver.disconnect();
      observed.forEach((card) => observer.unobserve(card));
      observer.disconnect();
      observed.clear();
    };
  }, []);

  // Soft glow tracking for cards
  useEffect(() => {
    const handlers = new Map<
      HTMLElement,
      { move: (e: PointerEvent) => void; leave: () => void; up: () => void; down: (e: PointerEvent) => void }
    >();
    const timeouts = new Map<HTMLElement, number>();

    const attach = (card: HTMLElement) => {
      if (handlers.has(card)) return;

      const handleMove = (event: PointerEvent) => {
        const rect = card.getBoundingClientRect();
        const x = ((event.clientX - rect.left) / rect.width) * 100;
        const y = ((event.clientY - rect.top) / rect.height) * 100;
        card.style.setProperty('--glow-x', `${x}%`);
        card.style.setProperty('--glow-y', `${y}%`);
        card.style.setProperty('--glow-intensity', '1');
      };

      const clearGlow = () => {
        card.style.setProperty('--glow-intensity', '0');
      };

      const handleUp = () => clearGlow();
      const handleLeave = () => clearGlow();

      const handleDown = (event: PointerEvent) => {
        handleMove(event);
        if (timeouts.has(card)) {
          window.clearTimeout(timeouts.get(card));
        }
        const timeoutId = window.setTimeout(() => {
          clearGlow();
          timeouts.delete(card);
        }, 900);
        timeouts.set(card, timeoutId);
      };

      card.addEventListener('pointermove', handleMove);
      card.addEventListener('pointerdown', handleDown);
      card.addEventListener('pointerleave', handleLeave);
      card.addEventListener('pointerup', handleUp);
      card.addEventListener('pointercancel', handleUp);

      handlers.set(card, { move: handleMove, leave: handleLeave, up: handleUp, down: handleDown });
    };

    const scan = () => {
      document.querySelectorAll<HTMLElement>('.glass').forEach(attach);
    };

    scan();

    const observer = new MutationObserver(scan);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      handlers.forEach((handler, card) => {
        card.removeEventListener('pointermove', handler.move);
        card.removeEventListener('pointerdown', handler.down);
        card.removeEventListener('pointerleave', handler.leave);
        card.removeEventListener('pointerup', handler.up);
        card.removeEventListener('pointercancel', handler.up);
      });
      timeouts.forEach((timeoutId) => window.clearTimeout(timeoutId));
      timeouts.clear();
      handlers.clear();
    };
  }, []);

  const handleLogin = (payload: { id: string; username: string }) => {
    setCurrentUser(payload);
  };

  const handleLogout = () => {
    cloud.signOut().catch((error) => console.error('Sign out failed:', error));
    setCurrentUser(null);
    setActiveTab('home');
    setTrips([]);
    setBills([]);
    setInsight(null);
    setLeaderboard([]);
  };

  const handleAddTrip = (trip: Trip) => {
    setTrips(prev => [trip, ...prev]);
    setUserProfile(prev => ({ ...prev, points: prev.points + 10 }));
    if (currentUser) {
      cloud.insertTrip(currentUser.id, trip).catch((error) => console.error('Failed to save trip:', error));
      const nextPoints = userProfile.points + 10;
      cloud.saveProfile(currentUser.id, { points: nextPoints }).catch((error) => console.error('Failed to save points:', error));
      refreshLeaderboard(currentUser.id).catch(() => undefined);
    }
  };

  const handleDeleteTrip = (id: string) => {
    setTrips(prev => prev.filter(t => t.id !== id));
    if (currentUser) {
      cloud.deleteTrip(currentUser.id, id).catch((error) => console.error('Failed to delete trip:', error));
    }
  };

  const handleUpdateElectricity = (kwh: number, month: string) => {
    const year = new Date().getFullYear();
    const co2 = kwh * 0.45;
    const newBill: UtilityBill = {
      id: Date.now().toString(),
      month,
      year,
      units: kwh,
      co2,
      date: new Date().toISOString()
    };
    
    // Remove existing bill for same month
    setBills(prev => {
      const filtered = prev.filter(b => b.month !== month);
      return [newBill, ...filtered];
    });
    setUserProfile(prev => ({ ...prev, points: prev.points + 20 }));
    if (currentUser) {
      cloud.insertBill(currentUser.id, newBill).catch((error) => console.error('Failed to save bill:', error));
      const nextPoints = userProfile.points + 20;
      cloud.saveProfile(currentUser.id, { points: nextPoints }).catch((error) => console.error('Failed to save points:', error));
      refreshLeaderboard(currentUser.id).catch(() => undefined);
    }
  };

  const handleDeleteBill = (id: string) => {
    setBills(prev => prev.filter(b => b.id !== id));
    if (currentUser) {
      cloud.deleteBill(currentUser.id, id).catch((error) => console.error('Failed to delete bill:', error));
    }
  };

  const handleFinishDay = async () => {
    setLoadingInsight(true);
    setActiveTab('ai');
    
    try {
      const result = await getAIAnalytics(trips, bills);
      setInsight(result);
      
      // Update streak
      const today = new Date().toISOString().split('T')[0];
      const todayTrips = trips.filter(t => t.date.split('T')[0] === today);
      if (todayTrips.length > 0) {
        setUserProfile(prev => ({
          ...prev,
          streak: prev.streak + 1,
          points: prev.points + 50
        }));
        if (currentUser) {
          const nextStreak = userProfile.streak + 1;
          const nextPoints = userProfile.points + 50;
          cloud
            .saveProfile(currentUser.id, { streak: nextStreak, points: nextPoints })
            .catch((error) => console.error('Failed to update streak:', error));
          refreshLeaderboard(currentUser.id).catch(() => undefined);
        }
      }
    } catch (error) {
      console.error("Error getting AI analytics:", error);
    } finally {
      setLoadingInsight(false);
    }
  };

  const handleUpdateProfile = (updates: Partial<UserProfile>) => {
    setUserProfile(prev => ({ ...prev, ...updates }));
    if (currentUser) {
      cloud.saveProfile(currentUser.id, updates).catch((error) => console.error('Failed to save profile:', error));
    }
  };

  const handleAddCustomVehicle = (vehicle: CustomVehicle) => {
    if (currentUser) {
      cloud.insertCustomVehicle(currentUser.id, vehicle).catch((error) => console.error('Failed to save vehicle:', error));
      setUserProfile(prev => ({
        ...prev,
        customVehicles: [...(prev.customVehicles || []), vehicle]
      }));
    }
  };

  const handleDeleteCustomVehicle = (vehicleName: string) => {
    if (currentUser) {
      cloud.deleteCustomVehicle(currentUser.id, vehicleName).catch((error) => console.error('Failed to delete vehicle:', error));
      setUserProfile(prev => ({
        ...prev,
        customVehicles: prev.customVehicles?.filter(v => v.name !== vehicleName) || []
      }));
      
      // Also remove any trips using this custom vehicle
      setTrips(trips.filter(t => !(t.vehicle === 'Custom' && t.customVehicleName === vehicleName)));
    }
  };

  const handleDeleteBaseVehicle = (vehicleType: VehicleType) => {
    if (currentUser) {
      // Remove from available vehicles
      const updatedVehicles = availableVehicles.filter(v => v !== vehicleType);
      setAvailableVehicles(updatedVehicles);
      setUserProfile(prev => ({ ...prev, availableVehicles: updatedVehicles }));
      cloud.saveProfile(currentUser.id, { availableVehicles: updatedVehicles }).catch((error) =>
        console.error('Failed to save available vehicles:', error)
      );
      
      // Also delete all trips with this vehicle type
      const removedTrips = trips.filter(t => t.vehicle === vehicleType);
      setTrips(trips.filter(t => t.vehicle !== vehicleType));
      removedTrips.forEach((trip) => {
        cloud.deleteTrip(currentUser.id, trip.id).catch((error) => console.error('Failed to delete trip:', error));
      });
    }
  };

  const totalElectricity = bills.length > 0 ? bills[0].units : 0;

  if (!authReady) {
    return <div className="min-h-screen bg-slate-50 dark:bg-slate-950" />;
  }

  if (!currentUser) {
    return <Auth onLogin={handleLogin} />;
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 transition-colors duration-300">
      <div className="max-w-md mx-auto pb-20">
        {/* Header */}
        <header className="sticky top-0 z-30 bg-white/80 dark:bg-slate-900/80 backdrop-blur-2xl border-b border-slate-100 dark:border-slate-800 px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-emerald-500 rounded-2xl flex items-center justify-center text-white shadow-md">
                <i className="fa-solid fa-leaf text-lg"></i>
              </div>
              <div>
                <h1 className="text-lg font-black text-slate-800 dark:text-white tracking-tight">EcoPulse AI</h1>
                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-[0.16em]">Sustainability</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => handleUpdateProfile({ darkMode: !userProfile.darkMode })}
                className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 flex items-center justify-center transition-colors"
              >
                <i className={`fa-solid ${userProfile.darkMode ? 'fa-sun' : 'fa-moon'}`}></i>
              </button>
              <button
                onClick={handleLogout}
                className="w-10 h-10 rounded-xl bg-rose-100 dark:bg-rose-500/10 text-rose-500 flex items-center justify-center transition-colors"
              >
                <i className="fa-solid fa-right-from-bracket"></i>
              </button>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="px-6">
          {activeTab === 'home' && (
            <Dashboard
              trips={trips}
              electricity={totalElectricity}
              insight={insight}
              user={userProfile}
              loading={loadingInsight}
            />
          )}
          {activeTab === 'track' && (
            <Tracker
              trips={trips}
              bills={bills}
              customVehicles={userProfile.customVehicles || []}
              availableVehicles={availableVehicles}
              onAddTrip={handleAddTrip}
              onDeleteTrip={handleDeleteTrip}
              onUpdateElectricity={handleUpdateElectricity}
              onDeleteBill={handleDeleteBill}
              onFinishDay={handleFinishDay}
              onAddCustomVehicle={handleAddCustomVehicle}
              onDeleteCustomVehicle={handleDeleteCustomVehicle}
              onDeleteBaseVehicle={handleDeleteBaseVehicle}
            />
          )}
          {activeTab === 'emissions' && (
            <Emissions 
              trips={trips} 
              electricity={totalElectricity}
              onDeleteTripsByVehicle={(vehicleType) => {
                const updatedTrips = trips.filter(t => {
                  if (t.vehicle === 'Custom') {
                    return t.customVehicleName !== vehicleType;
                  }
                  return t.vehicle !== vehicleType;
                });
                setTrips(updatedTrips);
              }}
            />
          )}
          {activeTab === 'ai' && (
            <AIAdvisor insight={insight} loading={loadingInsight} />
          )}
          {activeTab === 'profile' && (
            <Profile
              user={userProfile}
              trips={trips}
              onUpdateProfile={handleUpdateProfile}
              rankings={leaderboard}
            />
          )}
        </main>

        {/* Navigation */}
        <Navigation activeTab={activeTab} onTabChange={setActiveTab} />
      </div>
    </div>
  );
}

export default App;
