import React, { useState, useEffect, useRef, useCallback, Suspense } from 'react';
import Auth from './components/Auth';
import Navigation from './components/Navigation';
import { ThemeToggle } from './components/ui/theme-toggle';
import InstallPrompt from './components/InstallPrompt';

// Lazy-load heavy tab components for code-splitting
const Dashboard = React.lazy(() => import('./components/Dashboard'));
const Tracker = React.lazy(() => import('./components/Tracker'));
const Emissions = React.lazy(() => import('./components/Emissions'));
const AIAdvisor = React.lazy(() => import('./components/AIAdvisor'));
const Profile = React.lazy(() => import('./components/Profile'));
const Challenges = React.lazy(() => import('./components/Challenges'));
import { cloud } from './services/cloudService';
import { getAIAnalytics } from './services/geminiService';
import { mlBackend } from './services/mlBackendService';
import { restoreDailyReminder } from './services/notificationService';
import { Trip, UtilityBill, UserProfile, AIInsight, CustomVehicle, VehicleType, LeaderboardEntry } from './services/types';

// Reverse geocode lat/lng to city name using a free API (no key required)
const reverseGeocodeCity = async (lat: number, lng: number): Promise<string> => {
  try {
    const resp = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`,
      { headers: { 'Accept-Language': 'en', 'User-Agent': 'EcoPulse/2.0' } }
    );
    const data = await resp.json();
    // Prioritise city-level names; avoid hyper-local suburbs / villages
    return (
      data?.address?.city ||
      data?.address?.town ||
      data?.address?.city_district ||
      data?.address?.state_district ||
      data?.address?.county ||
      ''
    );
  } catch {
    return '';
  }
};

const IS_DEV = Boolean(import.meta.env.DEV);
const SEED_TEST_DATA =
  IS_DEV && String(import.meta.env.VITE_SEED_TEST_DATA || '').toLowerCase() === 'true';
const CLEAR_SEED_DATA =
  IS_DEV && String(import.meta.env.VITE_CLEAR_SEED_DATA || '').toLowerCase() === 'true';
const AUTO_ANALYZE =
  IS_DEV && String(import.meta.env.VITE_AUTO_ANALYZE || '').toLowerCase() === 'true';
const SEED_PREFIX = 'seed-ecopulse';
const SEED_VEHICLES: VehicleType[] = ['Car', 'Bus', 'Train', 'Bike', 'Walking'];
const SEED_FACTORS: Record<VehicleType, number> = {
  Car: 0.19,
  Bus: 0.015,
  Train: 0.008,
  Bike: 0,
  Walking: 0,
  Custom: 0.19
};
const SEED_DISTANCES = [3.8, 5.4, 7.2, 9.6, 12.3, 4.5, 6.8, 8.1];
const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December'
];

const buildSeedTrips = (seedTag: string, days: number = 20): Trip[] => {
  const today = new Date();
  const trips: Trip[] = [];
  for (let i = 0; i < days; i += 1) {
    const offset = days - 1 - i;
    const tripDate = new Date(
      Date.UTC(
        today.getUTCFullYear(),
        today.getUTCMonth(),
        today.getUTCDate() - offset,
        12,
        0,
        0
      )
    );
    const vehicle = SEED_VEHICLES[i % SEED_VEHICLES.length];
    const distance = SEED_DISTANCES[i % SEED_DISTANCES.length];
    const factor = SEED_FACTORS[vehicle] ?? 0.1;
    const co2 = Number((distance * factor).toFixed(3));
    trips.push({
      id: `${seedTag}-trip-${i + 1}`,
      vehicle,
      distance,
      date: tripDate.toISOString(),
      co2
    });
  }
  return trips;
};

const buildSeedBills = (seedTag: string): UtilityBill[] => {
  const base = new Date();
  const bills: UtilityBill[] = [];
  for (let offset = 0; offset < 2; offset += 1) {
    const billDate = new Date(
      Date.UTC(base.getUTCFullYear(), base.getUTCMonth() - offset, 5, 12, 0, 0)
    );
    const monthIndex = billDate.getUTCMonth();
    const year = billDate.getUTCFullYear();
    const units = offset === 0 ? 220 : 260;
    const co2 = Number((units * 0.45).toFixed(2));
    bills.push({
      id: `${seedTag}-bill-${year}-${monthIndex + 1}`,
      month: MONTHS[monthIndex],
      year,
      units,
      co2,
      date: billDate.toISOString()
    });
  }
  return bills;
};

function App() {
  const [currentUser, setCurrentUser] = useState<{ id: string; username: string } | null>(null);
  const [activeTab, setActiveTab] = useState<'home' | 'track' | 'emissions' | 'ai' | 'profile' | 'challenges'>('home');
  const [trips, setTrips] = useState<Trip[]>([]);
  const [bills, setBills] = useState<UtilityBill[]>([]);
  const [insight, setInsight] = useState<AIInsight | null>(null);
  const [loadingInsight, setLoadingInsight] = useState(false);
  const [authReady, setAuthReady] = useState(false);
  const [userCity, setUserCity] = useState<string>('');
  const cityFetchedRef = useRef(false);
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
    availableVehicles: []
  });
  const [availableVehicles, setAvailableVehicles] = useState<VehicleType[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const analysisInFlightRef = useRef(false);

  // Lazily detect city when AI tab opens (silent — no permission prompt forced)
  const detectCity = useCallback(() => {
    if (cityFetchedRef.current || userCity) return;
    cityFetchedRef.current = true;
    // Load from localStorage cache first
    const cached = localStorage.getItem('ecopulse_user_city');
    if (cached) { setUserCity(cached); return; }
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const city = await reverseGeocodeCity(pos.coords.latitude, pos.coords.longitude);
        if (city) {
          setUserCity(city);
          localStorage.setItem('ecopulse_user_city', city);
        }
      },
      () => { /* permission denied — silently ignore */ },
      { timeout: 8000, maximumAge: 86400000 }
    );
  }, [userCity]);

  // Trigger city detection whenever the AI tab becomes active
  useEffect(() => {
    if (activeTab === 'ai') detectCity();
  }, [activeTab, detectCity]);

  const applySeedData = async (userId: string, baseTrips: Trip[], baseBills: UtilityBill[]) => {
    const seedTag = `${SEED_PREFIX}-${userId}`;
    const seedKey = `ecopulse_seeded_${userId}`;
    const isSeededTrip = (trip: Trip) => trip.id.startsWith(seedTag);
    const isSeededBill = (bill: UtilityBill) => bill.id.startsWith(seedTag);
    const seededTrips = baseTrips.filter(isSeededTrip);
    const seededBills = baseBills.filter(isSeededBill);

    if (CLEAR_SEED_DATA) {
      await Promise.all(
        seededTrips.map((trip) =>
          cloud.deleteTrip(userId, trip.id).catch((error) =>
            console.warn('Failed to delete seeded trip:', error)
          )
        )
      );
      await Promise.all(
        seededBills.map((bill) =>
          cloud.deleteBill(userId, bill.id).catch((error) =>
            console.warn('Failed to delete seeded bill:', error)
          )
        )
      );
      localStorage.removeItem(seedKey);
      return {
        trips: baseTrips.filter((trip) => !isSeededTrip(trip)),
        bills: baseBills.filter((bill) => !isSeededBill(bill))
      };
    }

    if (!SEED_TEST_DATA) {
      return { trips: baseTrips, bills: baseBills };
    }

    if (localStorage.getItem(seedKey)) {
      return { trips: baseTrips, bills: baseBills };
    }

    if (baseTrips.length > 0 || baseBills.length > 0) {
      return { trips: baseTrips, bills: baseBills };
    }

    const seedTrips = buildSeedTrips(seedTag);
    const seedBills = buildSeedBills(seedTag);

    localStorage.setItem(seedKey, 'in_progress');

    try {
      await Promise.all(seedTrips.map((trip) => cloud.insertTrip(userId, trip)));
      await Promise.all(seedBills.map((bill) => cloud.insertBill(userId, bill)));
      localStorage.setItem(seedKey, 'true');
      return { trips: seedTrips, bills: seedBills };
    } catch (error) {
      localStorage.removeItem(seedKey);
      console.warn('Failed to seed test data:', error);
      return { trips: baseTrips, bills: baseBills };
    }
  };

  const runAnalysis = async ({
    tripsOverride,
    billsOverride,
    activateTab = false,
    runMl = false,
    useRemoteRecommendations = false
  }: {
    tripsOverride?: Trip[];
    billsOverride?: UtilityBill[];
    activateTab?: boolean;
    runMl?: boolean;
    useRemoteRecommendations?: boolean;
  } = {}) => {
    if (analysisInFlightRef.current && !activateTab) return false;
    analysisInFlightRef.current = true;

    const analysisTrips = tripsOverride ?? trips;
    const analysisBills = billsOverride ?? bills;

    if (activateTab) {
      setActiveTab('ai');
    }

    setLoadingInsight(true);

    try {
      const localInsight = await getAIAnalytics(analysisTrips, analysisBills, undefined, {
        skipRemote: true
      });
      setInsight(localInsight);

      let overrides: { forecast7Day?: number; clusterLabel?: string; method?: string } | undefined;

      if (runMl && currentUser && mlBackend.isEnabled()) {
        try {
          const tripSpanDays = getTripSpanDays(analysisTrips);
          const canTrain = tripSpanDays >= 14;
          const canCluster = analysisTrips.length >= 10;

          await mlBackend.syncAll(currentUser.id, analysisTrips, analysisBills);

          let prediction: any;
          let clustering: any;

          if (canTrain) {
            await mlBackend.train(currentUser.id);
            prediction = await mlBackend.predict(currentUser.id);
          }

          if (canCluster) {
            clustering = await mlBackend.cluster();
          }

          const clusterMatch = clustering?.clusters?.find(
            (entry: any) => entry.user_id === currentUser.id
          );

          if (prediction?.forecast_7_day || clusterMatch?.cluster_label) {
            overrides = {
              forecast7Day: prediction?.forecast_7_day,
              clusterLabel: clusterMatch?.cluster_label,
              method: prediction?.forecast_7_day ? 'Random Forest' : undefined
            };
          }
        } catch (error) {
          console.warn('ML backend analytics failed, using local heuristics:', error);
        }
      }

      if (overrides || useRemoteRecommendations) {
        const refreshedInsight = await getAIAnalytics(analysisTrips, analysisBills, overrides, {
          skipRemote: !useRemoteRecommendations
        });
        setInsight(refreshedInsight);
      }
    } catch (error) {
      console.error('Error getting AI analytics:', error);
    } finally {
      setLoadingInsight(false);
      analysisInFlightRef.current = false;
    }

    return true;
  };

  const getTripSpanDays = (items: Trip[]) => {
    if (items.length === 0) return 0;
    let min = Number.POSITIVE_INFINITY;
    let max = Number.NEGATIVE_INFINITY;
    for (const trip of items) {
      const day = (trip.date || '').split('T')[0];
      const [year, month, date] = day.split('-').map(Number);
      if (!year || !month || !date) continue;
      const ts = Date.UTC(year, month - 1, date);
      if (ts < min) min = ts;
      if (ts > max) max = ts;
    }
    if (!Number.isFinite(min) || !Number.isFinite(max)) return 0;
    const dayMs = 24 * 60 * 60 * 1000;
    return Math.floor((max - min) / dayMs) + 1;
  };

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

  // Restore session + register service worker
  useEffect(() => {
    // Register PWA service worker
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => undefined);
    }
    // Restore daily notification reminder if previously set
    restoreDailyReminder();

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
        const seeded = (SEED_TEST_DATA || CLEAR_SEED_DATA)
          ? await applySeedData(currentUser.id, data.trips, data.bills)
          : { trips: data.trips, bills: data.bills };
        setTrips(seeded.trips);
        setBills(seeded.bills);
        setUserProfile({
          ...data.profile,
          customVehicles: data.customVehicles
        });
        const legacyDefaults = ['Car', 'Bike', 'Bus', 'Train', 'Walking'];
        const filteredVehicles = (data.profile.availableVehicles || []).filter(v => !legacyDefaults.includes(v));
        setAvailableVehicles(filteredVehicles);
        if (AUTO_ANALYZE) {
          await runAnalysis({
            tripsOverride: seeded.trips,
            billsOverride: seeded.bills,
            runMl: true,
            useRemoteRecommendations: true
          });
        }
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
    const nextPoints = userProfile.points + 10;
    setTrips(prev => [trip, ...prev]);
    setUserProfile(prev => ({ ...prev, points: prev.points + 10 }));
    if (currentUser) {
      cloud.insertTrip(currentUser.id, trip).catch((error) => console.error('Failed to save trip:', error));
      cloud.saveProfile(currentUser.id, { points: nextPoints }).catch((error) => console.error('Failed to save points:', error));
      refreshLeaderboard(currentUser.id).catch(() => undefined);
      mlBackend.syncTrip(currentUser.id, trip).catch((error) =>
        console.warn('ML backend trip sync failed:', error)
      );
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
    const nextPoints = userProfile.points + 20;
    // Remove existing bill for same month
    setBills(prev => {
      const filtered = prev.filter(b => !(b.month === month && b.year === year));
      return [newBill, ...filtered];
    });
    setUserProfile(prev => ({ ...prev, points: prev.points + 20 }));
    if (currentUser) {
      cloud.insertBill(currentUser.id, newBill).catch((error) => console.error('Failed to save bill:', error));
      cloud.saveProfile(currentUser.id, { points: nextPoints }).catch((error) => console.error('Failed to save points:', error));
      refreshLeaderboard(currentUser.id).catch(() => undefined);
      mlBackend.syncBill(currentUser.id, newBill).catch((error) =>
        console.warn('ML backend bill sync failed:', error)
      );
    }
  };

  const handleDeleteBill = (id: string) => {
    setBills(prev => prev.filter(b => b.id !== id));
    if (currentUser) {
      cloud.deleteBill(currentUser.id, id).catch((error) => console.error('Failed to delete bill:', error));
    }
  };

  const handleFinishDay = async () => {
    try {
      await runAnalysis({
        activateTab: true,
        runMl: true,
        useRemoteRecommendations: true
      });

      // Update streak and loggedDays
      const today = new Date().toISOString().split('T')[0];
      const todayTrips = trips.filter(t => t.date.split('T')[0] === today);
      const alreadyLogged = (userProfile.loggedDays || []).includes(today);
      if (todayTrips.length > 0 && !alreadyLogged) {
        const nextStreak = userProfile.streak + 1;
        const nextPoints = userProfile.points + 50;
        setUserProfile(prev => ({
          ...prev,
          streak: prev.streak + 1,
          points: prev.points + 50,
          loggedDays: Array.from(new Set([...(prev.loggedDays || []), today]))
        }));
        if (currentUser) {
          cloud
            .saveProfile(currentUser.id, { streak: nextStreak, points: nextPoints })
            .catch((error) => console.error('Failed to update streak:', error));
          refreshLeaderboard(currentUser.id).catch(() => undefined);
        }
      }
    } catch (error) {
      console.error("Error getting AI analytics:", error);
    }
  };

  const handleUpdateProfile = (updates: Partial<UserProfile>) => {
    setUserProfile(prev => ({ ...prev, ...updates }));
    if (currentUser) {
      cloud.saveProfile(currentUser.id, updates).catch((error) => console.error('Failed to save profile:', error));
    }
  };

  const handleAddCustomVehicle = (vehicle: CustomVehicle) => {
    const existing = (userProfile.customVehicles || []).some(
      (v) => v.name.trim().toLowerCase() === vehicle.name.trim().toLowerCase()
    );
    if (existing) {
      console.warn(`Custom vehicle '${vehicle.name}' already exists. Skipping insert.`);
      return;
    }
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
      setTrips(prev => prev.filter(t => !(t.vehicle === 'Custom' && t.customVehicleName === vehicleName)));
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

      // Also delete all trips with this vehicle type (use snapshot for cloud deletes)
      const removedTrips = trips.filter(t => t.vehicle === vehicleType);
      setTrips(prev => prev.filter(t => t.vehicle !== vehicleType));
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
    <div className="min-h-screen text-slate-900 dark:text-slate-100 transition-colors duration-300">
      <div className="mesh-bg" />
      <div className="max-w-md mx-auto pb-32">
        {/* Install prompt banner */}
        <InstallPrompt />

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
              <ThemeToggle
                className=""
                isDark={userProfile.darkMode}
                onToggle={() => handleUpdateProfile({ darkMode: !userProfile.darkMode })}
              />
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
          <Suspense fallback={
            <div className="flex items-center justify-center py-20">
              <div className="w-8 h-8 border-3 border-emerald-500 border-t-transparent rounded-full animate-spin" />
            </div>
          }>
            {activeTab === 'home' && (
              <Dashboard
                trips={trips}
                bills={bills}
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
                bills={bills}
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
              <AIAdvisor
                insight={insight}
                loading={loadingInsight}
                userCity={userCity}
                mostUsedVehicle={insight?.patterns?.mostUsedVehicle}
              />
            )}
            {activeTab === 'challenges' && currentUser && (
              <Challenges
                userId={currentUser.id}
                userCO2ThisWeek={(() => {
                  const cutoff = new Date();
                  cutoff.setDate(cutoff.getDate() - 7);
                  return trips.filter(t => new Date(t.date) >= cutoff).reduce((s, t) => s + t.co2, 0);
                })()}
              />
            )}
            {activeTab === 'profile' && (
              <Profile
                user={userProfile}
                trips={trips}
                bills={bills}
                onUpdateProfile={handleUpdateProfile}
                rankings={leaderboard}
              />
            )}
          </Suspense>
        </main>

        {/* Navigation */}
        <Navigation activeTab={activeTab} onTabChange={setActiveTab} />
      </div>
    </div>
  );
}

export default App;
