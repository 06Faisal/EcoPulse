import React, { useState, useRef, useEffect } from 'react';
import { VehicleType, Trip, UtilityBill, CustomVehicle } from '../services/types';
import { predictEmissionFactor, verifyBillImage } from '../services/geminiService';

// Haversine formula for distance calculation
const calculateHaversineDistance = (
  coord1: { lat: number; lng: number },
  coord2: { lat: number; lng: number }
): number => {
  const R = 6371; // Earth's radius in kilometers
  const toRad = (degrees: number) => (degrees * Math.PI) / 180;
  const dLat = toRad(coord2.lat - coord1.lat);
  const dLng = toRad(coord2.lng - coord1.lng);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(coord1.lat)) *
      Math.cos(toRad(coord2.lat)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

const vehicleIcons: Record<VehicleType, string> = {
  Car: 'fa-car-side',
  Bus: 'fa-bus',
  Train: 'fa-train',
  Bike: 'fa-bicycle',
  Walking: 'fa-person-walking',
  Custom: 'fa-car-side'
};

const inferIconFromName = (name: string) => {
  const label = name.toLowerCase();
  if (label.includes('bus')) return 'fa-bus';
  if (label.includes('train') || label.includes('metro') || label.includes('rail')) return 'fa-train';
  if (label.includes('bike') || label.includes('bicycle') || label.includes('cycle')) return 'fa-bicycle';
  if (label.includes('walk')) return 'fa-person-walking';
  if (label.includes('scooter') || label.includes('motor')) return 'fa-motorcycle';
  if (label.includes('truck')) return 'fa-truck';
  if (label.includes('van')) return 'fa-van-shuttle';
  if (label.includes('taxi')) return 'fa-taxi';
  if (label.includes('car')) return 'fa-car-side';
  return null;
};

const getCustomVehicleIcon = (name: string, category?: CustomVehicle['category']) => {
  const fromName = inferIconFromName(name);
  if (fromName) return fromName;

  if (category === 'public') return 'fa-bus';
  if (category === 'personal') return 'fa-car-side';

  return 'fa-car-side';
};

const getTripIcon = (trip: Trip, customVehicles: CustomVehicle[]) => {
  if (trip.vehicle === 'Custom') {
    const match = customVehicles.find(
      (v) => v.name.toLowerCase() === (trip.customVehicleName || '').toLowerCase()
    );
    const label = trip.customVehicleName || trip.vehicle;
    return getCustomVehicleIcon(label, match?.category);
  }
  return vehicleIcons[trip.vehicle] || 'fa-location-arrow';
};

interface TrackerProps {
  trips: Trip[];
  bills: UtilityBill[];
  customVehicles: CustomVehicle[];
  availableVehicles?: VehicleType[]; // NEW: List of available base vehicles
  onAddTrip: (trip: Trip) => void;
  onDeleteTrip: (id: string) => void;
  onUpdateElectricity: (kwh: number, month: string) => void;
  onDeleteBill: (id: string) => void;
  onFinishDay: () => void;
  onAddCustomVehicle: (vehicle: CustomVehicle) => void;
  onDeleteCustomVehicle: (name: string) => void;
  onDeleteBaseVehicle?: (vehicleType: VehicleType) => void; // NEW: Handler for deleting base vehicles
}

const Tracker: React.FC<TrackerProps> = ({ 
  trips, 
  bills, 
  customVehicles,
  availableVehicles = [], // Base vehicles disabled; custom-only
  onAddTrip, 
  onDeleteTrip, 
  onUpdateElectricity, 
  onDeleteBill, 
  onFinishDay,
  onAddCustomVehicle,
  onDeleteCustomVehicle,
  onDeleteBaseVehicle // NEW
}) => {
  const [activeCategory, setActiveCategory] = useState<'travel' | 'electricity'>('travel');
  const [activeFeedTab, setActiveFeedTab] = useState<'trips' | 'utilities'>('trips');
  const [distance, setDistance] = useState<string>('');
  const [kwhInput, setKwhInput] = useState<string>('');
  const [selectedMonth, setSelectedMonth] = useState<string>(new Date().toLocaleString('default', { month: 'long' }));
  const [vehicle, setVehicle] = useState<VehicleType>('Car');
  const [selectedCustomVehicle, setSelectedCustomVehicle] = useState<string>('');
  const [scanning, setScanning] = useState(false);
  
  // Tracking mode
  const [trackingMode, setTrackingMode] = useState<'manual' | 'automatic'>('manual');
  const [isTracking, setIsTracking] = useState(false);
  const [startLocation, setStartLocation] = useState<{lat: number, lng: number} | null>(null);
  const [currentDistance, setCurrentDistance] = useState(0);
  const watchIdRef = useRef<number | null>(null);
  
  // Custom vehicle modal - UPDATED: Predict emission factor via API
  const [showCustomVehicleModal, setShowCustomVehicleModal] = useState(false);
  const [customVehicleName, setCustomVehicleName] = useState('');
  const [customVehicleType, setCustomVehicleType] = useState('');
  const [customVehicleMake, setCustomVehicleMake] = useState('');
  const [customVehicleModel, setCustomVehicleModel] = useState('');
  const [customVehicleYear, setCustomVehicleYear] = useState('');
  const [customFuelType, setCustomFuelType] = useState('');
  const [isPredictingFactor, setIsPredictingFactor] = useState(false);

  const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  
  // Custom-only vehicle chips
  const vehicleChips = customVehicles.map((cv) => ({
    kind: 'custom' as const,
    key: `custom-${cv.name}`,
    label: cv.name,
    icon: getCustomVehicleIcon(cv.name, cv.category),
    customName: cv.name
  }));

  // NEW: Update selected vehicle if it gets removed
  useEffect(() => {
    if (vehicle !== 'Custom') {
      setVehicle('Custom');
    }
  }, [vehicle]);

  const handleSaveCustomVehicle = async () => {
    if (!customVehicleName.trim()) {
      alert('Please enter a vehicle name');
      return;
    }

    setIsPredictingFactor(true);

    try {
      const vehicleDescriptor = [
        customVehicleMake,
        customVehicleModel,
        customVehicleYear
      ].filter(Boolean).join(' ').trim();

      const queryName = vehicleDescriptor || customVehicleName.trim();
      const prediction = await predictEmissionFactor(
        queryName,
        customVehicleType || undefined,
        customFuelType || undefined
      );

      const newVehicle: CustomVehicle = {
        name: customVehicleName.trim(),
        factor: prediction.factor,
        category: (prediction.category as any) || (customFuelType as any) || 'gas'
      };
      
      onAddCustomVehicle(newVehicle);
      
      // Reset form
      setCustomVehicleName('');
      setCustomVehicleType('');
      setCustomVehicleMake('');
      setCustomVehicleModel('');
      setCustomVehicleYear('');
      setCustomFuelType('');
      setShowCustomVehicleModal(false);
    } catch (error) {
      console.error('Failed to predict emission factor:', error);
      alert('Unable to estimate emission factor. Please try again.');
    } finally {
      setIsPredictingFactor(false);
    }
  };

  const getEmissionFactor = (vehicleType: VehicleType, customVehicleName?: string): number => {
    if (vehicleType === 'Custom' && customVehicleName) {
      const custom = customVehicles.find(v => v.name === customVehicleName);
      return custom?.factor || 0.15;
    }
    
    const factors: Record<string, number> = {
      'Car': 0.19,
      'Bus': 0.08,
      'Train': 0.04,
      'Bike': 0.01,
      'Walking': 0
    };
    
    return factors[vehicleType] || 0.15;
  };

  const handleAddTrip = () => {
    const d = parseFloat(distance);
    if (isNaN(d) || d <= 0) return;
    
    const isCustom = vehicle === 'Custom';
    const customName = isCustom ? selectedCustomVehicle : undefined;
    if (isCustom && !customName) {
      alert('Please select a custom vehicle first.');
      return;
    }
    const factor = getEmissionFactor(vehicle, customName);
    
    onAddTrip({
      id: Date.now().toString(),
      vehicle,
      customVehicleName: customName,
      distance: d,
      date: new Date().toISOString(),
      co2: Number(d * factor)
    });
    
    setDistance('');
  };

  // Start automatic tracking
  const startAutoTracking = () => {
    if (!navigator.geolocation) {
      alert('Geolocation is not supported by your browser');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setStartLocation({
          lat: position.coords.latitude,
          lng: position.coords.longitude
        });
        setCurrentDistance(0);
        setIsTracking(true);

        // Watch position changes
        const watchId = navigator.geolocation.watchPosition(
          (pos) => {
            if (startLocation) {
              // Use Haversine formula for distance calculation
              const dist = calculateHaversineDistance(
                { lat: startLocation.lat, lng: startLocation.lng },
                { lat: pos.coords.latitude, lng: pos.coords.longitude }
              );
              setCurrentDistance(dist);
            }
          },
          (error) => console.error('Tracking error:', error),
          { enableHighAccuracy: true, maximumAge: 10000, timeout: 5000 }
        );

        watchIdRef.current = watchId;
      },
      (error) => {
        alert('Unable to get your location. Please enable location services.');
        console.error('Location error:', error);
      }
    );
  };

  // Stop automatic tracking and log trip
  const stopAutoTracking = () => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }

    if (currentDistance > 0.1) { // Minimum 100m
      const isCustom = vehicle === 'Custom';
      const customName = isCustom ? selectedCustomVehicle : undefined;
      if (isCustom && !customName) {
        alert('Please select a custom vehicle first.');
        return;
      }
      const factor = getEmissionFactor(vehicle, customName);
      
      onAddTrip({
        id: Date.now().toString(),
        vehicle,
        customVehicleName: customName,
        distance: Number(currentDistance.toFixed(2)),
        date: new Date().toISOString(),
        co2: Number((currentDistance * factor).toFixed(2))
      });
    }

    setIsTracking(false);
    setStartLocation(null);
    setCurrentDistance(0);
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, []);

  const handleAddBill = () => {
    const k = parseFloat(kwhInput);
    if (isNaN(k) || k <= 0) return;
    onUpdateElectricity(k, selectedMonth);
    setKwhInput('');
  };

  const handleKeyDown = (e: React.KeyboardEvent, action: () => void) => {
    if (e.key === 'Enter') action();
  };

  const handleBillUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setScanning(true);
    const reader = new FileReader();
    reader.onloadend = async () => {
      const result = await verifyBillImage(reader.result as string);
      if (result && result.units > 0) {
        if (result.isAnomalous) {
          alert(`Warning: Anomaly detected. ${result.reasoning || 'Please verify manually.'}`);
        }
        onUpdateElectricity(Number(result.units), selectedMonth);
      }
      setScanning(false);
    };
    reader.readAsDataURL(file);
  };

  return (
    <>
      <div className="space-y-8 pb-24 pt-4 animate-in slide-in-from-bottom-4">
        <div className="flex bg-white dark:bg-slate-900 p-1.5 rounded-2xl shadow-lg border border-slate-100 dark:border-slate-800">
          <button 
            onClick={() => setActiveCategory('travel')} 
            className={`flex-1 py-3.5 rounded-xl font-black text-xs uppercase tracking-widest transition-all ${activeCategory === 'travel' ? 'bg-slate-900 dark:bg-emerald-500 text-white shadow-lg' : 'text-slate-400'}`}
          >
            <i className="fa-solid fa-car-side mr-2"></i> Travel
          </button>
          <button 
            onClick={() => setActiveCategory('electricity')} 
            className={`flex-1 py-3.5 rounded-xl font-black text-xs uppercase tracking-widest transition-all ${activeCategory === 'electricity' ? 'bg-slate-900 dark:bg-emerald-500 text-white shadow-lg' : 'text-slate-400'}`}
          >
            <i className="fa-solid fa-bolt mr-2"></i> Energy
          </button>
        </div>

        {activeCategory === 'travel' ? (
          <div className="glass p-6 rounded-[2rem] shadow-lg space-y-6 bg-white dark:bg-slate-900/40 border-white/5">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-[11px] font-black text-slate-400 uppercase tracking-[0.16em]">Select Transport</h3>
              <button
                onClick={() => setShowCustomVehicleModal(true)}
                className="text-[10px] font-black text-emerald-500 uppercase tracking-widest flex items-center gap-1 hover:text-emerald-600 transition-colors"
              >
                <i className="fa-solid fa-plus"></i> Add Custom
              </button>
            </div>

            {/* TRACKING MODE SELECTION */}
            <div className="flex bg-slate-100 dark:bg-slate-800 p-1.5 rounded-2xl gap-2">
              <button
                onClick={() => {
                  setTrackingMode('manual');
                  if (isTracking) stopAutoTracking();
                }}
                className={`flex-1 py-3 rounded-xl font-black text-xs uppercase tracking-widest transition-all flex items-center justify-center gap-2 ${
                  trackingMode === 'manual' 
                    ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-lg' 
                    : 'text-slate-400'
                }`}
              >
                <i className="fa-solid fa-keyboard"></i>
                Manual
              </button>
              <button
                onClick={() => setTrackingMode('automatic')}
                className={`flex-1 py-3 rounded-xl font-black text-xs uppercase tracking-widest transition-all flex items-center justify-center gap-2 ${
                  trackingMode === 'automatic' 
                    ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-lg' 
                    : 'text-slate-400'
                }`}
              >
                <i className="fa-solid fa-location-crosshairs"></i>
                Automatic
              </button>
            </div>

            {/* VEHICLE CHIPS (BASE + CUSTOM) */}
            <div className="flex gap-2 overflow-x-auto overflow-y-visible pb-2 no-scrollbar">
              {customVehicles.length === 0 && (
                <div className="w-full">
                  <div className="flex items-center justify-between gap-3 p-4 bg-slate-50 dark:bg-slate-800/60 rounded-2xl border border-slate-200 dark:border-slate-700">
                    <div>
                      <div className="text-[11px] font-black text-slate-400 uppercase tracking-[0.16em]">No Vehicles Yet</div>
                      <div className="text-xs text-slate-600 dark:text-slate-300 font-medium mt-1">
                        Add your first custom vehicle to start logging trips.
                      </div>
                    </div>
                    <button
                      onClick={() => setShowCustomVehicleModal(true)}
                      className="px-3 py-2 bg-emerald-500 text-white text-[10px] font-black uppercase tracking-[0.12em] rounded-xl shadow-lg"
                    >
                      Add
                    </button>
                  </div>
                </div>
              )}
              {vehicleChips.map((chip) => (
                <div key={chip.key} className="relative flex-shrink-0 group">
                  <button
                    onClick={() => {
                      setVehicle('Custom');
                      setSelectedCustomVehicle(chip.customName);
                    }}
                    className={`px-5 py-3 pr-10 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2 ${
                      vehicle === 'Custom' && selectedCustomVehicle === chip.customName
                        ? 'bg-emerald-600 text-white shadow-lg'
                        : 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    <i className={`fa-solid ${chip.icon}`}></i> {chip.label}
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (confirm(`Delete ${chip.label}?`)) {
                        onDeleteCustomVehicle(chip.customName);
                        if (selectedCustomVehicle === chip.customName) {
                          setSelectedCustomVehicle('');
                          setVehicle('Custom');
                        }
                      }
                    }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 w-5 h-5 bg-white text-rose-500 rounded-md flex items-center justify-center opacity-100 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100 transition-opacity shadow-md border border-rose-100"
                    title={`Delete ${chip.label}`}
                  >
                    <i className="fa-solid fa-trash fa-xs"></i>
                  </button>
                </div>
              ))}
            </div>
            
            {/* DISTANCE INPUT - Different for Manual vs Automatic */}
            {trackingMode === 'manual' ? (
              <div className="relative">
                <input 
                  type="number" 
                  value={distance} 
                  onChange={(e) => setDistance(e.target.value)} 
                  onKeyDown={(e) => handleKeyDown(e, handleAddTrip)}
                  placeholder="Distance (km)" 
                  className="w-full bg-slate-50 dark:bg-slate-800 rounded-2xl p-6 text-3xl font-black text-center text-slate-800 dark:text-white outline-none focus:ring-4 focus:ring-emerald-500/10" 
                />
                <div className="absolute right-6 top-1/2 -translate-y-1/2 text-slate-400 font-black text-xs uppercase">km</div>
              </div>
            ) : (
              <div className="space-y-4">
                {!isTracking ? (
                  <div className="p-6 bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-500/10 dark:to-teal-500/10 rounded-2xl border-2 border-dashed border-emerald-300 dark:border-emerald-500/30 text-center">
                    <div className="w-16 h-16 bg-emerald-500 rounded-2xl flex items-center justify-center text-white mx-auto mb-4 shadow-lg">
                      <i className="fa-solid fa-route text-2xl"></i>
                    </div>
                    <h4 className="text-sm font-black text-slate-800 dark:text-white mb-2">Ready to Track</h4>
                    <p className="text-[11px] text-slate-500 dark:text-slate-300 font-medium">
                      GPS will calculate distance automatically
                    </p>
                  </div>
                ) : (
                  <div className="p-6 bg-slate-900 dark:bg-emerald-500 text-white rounded-2xl text-center animate-in zoom-in-95">
                    <div className="text-[10px] font-black uppercase tracking-widest mb-2 opacity-80 flex items-center justify-center gap-2">
                      <i className="fa-solid fa-satellite-dish animate-pulse"></i> 
                      Live Tracking
                    </div>
                    <div className="text-5xl font-black">{currentDistance.toFixed(2)}</div>
                    <div className="text-sm font-bold opacity-70 uppercase mt-1">kilometers</div>
                    <div className="mt-4 flex items-center justify-center gap-2 text-[10px] font-bold bg-white/10 px-4 py-2 rounded-full">
                      <i className="fa-solid fa-circle text-red-400 animate-pulse"></i>
                      Recording with {vehicle === 'Custom' ? selectedCustomVehicle : vehicle}
                    </div>
                  </div>
                )}
              </div>
            )}
            
            {vehicle === 'Custom' && selectedCustomVehicle && null}
            
            
            {/* ACTION BUTTON */}
            {trackingMode === 'manual' ? (
              <button 
                onClick={handleAddTrip} 
                className="w-full bg-slate-900 dark:bg-emerald-500 text-white py-4 px-5 rounded-2xl font-black uppercase tracking-[0.18em] shadow-xl active:scale-95 transition-transform"
              >
                Log Trip
              </button>
            ) : (
              !isTracking ? (
                <button 
                  onClick={startAutoTracking} 
                  className="w-full bg-emerald-500 text-white py-4 px-5 rounded-2xl font-black uppercase tracking-[0.18em] shadow-xl active:scale-95 transition-transform flex items-center justify-center gap-3"
                >
                  <i className="fa-solid fa-play"></i>
                  Start Tracking
                </button>
              ) : (
                <button 
                  onClick={stopAutoTracking} 
                  className="w-full bg-rose-500 text-white py-4 px-5 rounded-2xl font-black uppercase tracking-[0.18em] shadow-xl active:scale-95 transition-transform flex items-center justify-center gap-3"
                >
                  <i className="fa-solid fa-stop"></i>
                  Stop & Log Trip
                </button>
              )
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="glass p-6 rounded-[2rem] space-y-5 bg-white dark:bg-slate-900/40 border-white/5">
              <div className="flex gap-2 mb-2">
                <select 
                  value={selectedMonth} 
                  onChange={(e) => setSelectedMonth(e.target.value)} 
                  className="flex-1 bg-slate-50 dark:bg-slate-800 p-4 rounded-xl text-xs font-black uppercase tracking-widest outline-none border-none text-slate-500 dark:text-slate-400"
                >
                  {months.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
              <div className="relative">
                <input 
                  type="number" 
                  value={kwhInput} 
                  onChange={(e) => setKwhInput(e.target.value)} 
                  onKeyDown={(e) => handleKeyDown(e, handleAddBill)}
                  placeholder="Consumption" 
                  className="w-full bg-slate-50 dark:bg-slate-800 p-6 rounded-2xl text-2xl font-black text-center text-slate-800 dark:text-white outline-none" 
                />
                <div className="absolute right-6 top-1/2 -translate-y-1/2 text-slate-400 font-black text-xs uppercase">kWh</div>
              </div>
              <button 
                onClick={handleAddBill} 
                className="w-full bg-slate-900 dark:bg-emerald-500 text-white py-4 px-5 rounded-2xl font-black uppercase tracking-[0.18em] shadow-lg"
              >
                Save Manually
              </button>
            </div>
            
            <div className="glass p-10 rounded-[2rem] border-2 border-dashed border-slate-200 dark:border-slate-800 flex flex-col items-center justify-center bg-white/30 dark:bg-slate-900/20">
               {scanning ? (
                 <div className="flex flex-col items-center gap-2">
                   <div className="w-10 h-10 border-4 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin"></div>
                   <span className="text-[10px] font-black text-emerald-500 uppercase">AI Regional Sync...</span>
                 </div>
               ) : (
                 <label className="flex flex-col items-center cursor-pointer text-center">
                    <div className="w-16 h-16 bg-white dark:bg-slate-800 rounded-full flex items-center justify-center text-slate-400 mb-4 shadow-lg">
                      <i className="fa-solid fa-camera text-2xl"></i>
                    </div>
                    <span className="text-[11px] font-black text-slate-500 uppercase tracking-[0.16em]">Scan Utility Bill</span>
                    <input type="file" accept="image/*" className="hidden" onChange={handleBillUpload} />
                 </label>
               )}
            </div>
          </div>
        )}

        <div className="space-y-4">
          <div className="flex items-center justify-between ml-1">
            <h3 className="text-[11px] font-black text-slate-400 uppercase tracking-[0.16em]">Vault Activity</h3>
            <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-lg">
              <button 
                onClick={() => setActiveFeedTab('trips')} 
                className={`px-3 py-1 text-[10px] font-black rounded-md uppercase transition-all ${activeFeedTab === 'trips' ? 'bg-white dark:bg-slate-700 text-slate-800 dark:text-white' : 'text-slate-400'}`}
              >
                Trips
              </button>
              <button 
                onClick={() => setActiveFeedTab('utilities')} 
                className={`px-3 py-1 text-[10px] font-black rounded-md uppercase transition-all ${activeFeedTab === 'utilities' ? 'bg-white dark:bg-slate-700 text-slate-800 dark:text-white' : 'text-slate-400'}`}
              >
                Bills
              </button>
            </div>
          </div>

          {activeFeedTab === 'trips' ? (
            trips.filter(t => {
              const tripDate = new Date(t.date).toISOString().split('T')[0];
              const today = new Date().toISOString().split('T')[0];
              return tripDate === today;
            }).length === 0 ? <div className="p-8 text-center text-[11px] font-bold text-slate-400 uppercase">No Trips Today</div> :
            <div className="space-y-3">
              {trips.filter(t => {
                const tripDate = new Date(t.date).toISOString().split('T')[0];
                const today = new Date().toISOString().split('T')[0];
                return tripDate === today;
              }).slice(0, 10).map(t => {
                // Get the appropriate icon for the vehicle
                const vehicleIcon = getTripIcon(t, customVehicles);
                
                return (
                <div key={t.id} className="glass p-4 rounded-2xl flex items-center justify-between group bg-white dark:bg-slate-900/40">
                  <div className="flex items-center gap-4">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${t.vehicle === 'Custom' ? 'bg-amber-500/10 text-amber-500' : 'bg-emerald-500/10 text-emerald-500'}`}>
                      <i className={`fa-solid ${vehicleIcon}`}></i>
                    </div>
                    <div>
                      <h4 className="font-black text-slate-800 dark:text-white text-xs">
                        {t.vehicle === 'Custom' ? t.customVehicleName : t.vehicle} Trip
                        {t.vehicle === 'Custom' && (
                          <i className="fa-solid fa-star text-amber-500 text-[8px] ml-1"></i>
                        )}
                      </h4>
                      <p className="text-[11px] font-bold text-slate-400 uppercase">
                        {t.distance} km | {t.co2.toFixed(2)} kg CO2 | {new Date(t.date).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <button 
                    onClick={() => onDeleteTrip(t.id)} 
                    className="text-rose-500 p-2 opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <i className="fa-solid fa-trash"></i>
                  </button>
                </div>
              )})}
            </div>
          ) : (
            bills.length === 0 ? <div className="p-8 text-center text-[11px] font-bold text-slate-400 uppercase">No Bills</div> :
            <div className="space-y-3">
              {bills.map(b => (
                <div key={b.id} className="glass p-4 rounded-2xl flex items-center justify-between group bg-white dark:bg-slate-900/40 border-l-4 border-l-blue-500">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-500">
                      <i className="fa-solid fa-bolt"></i>
                    </div>
                    <div>
                      <h4 className="font-black text-slate-800 dark:text-white text-xs">
                        {b.month} Bill
                        {b.isAnomalous && (
                          <i className="fa-solid fa-exclamation-triangle text-amber-500 text-[8px] ml-1"></i>
                        )}
                      </h4>
                      <p className="text-[11px] font-bold text-slate-400 uppercase">{b.units} kWh</p>
                    </div>
                  </div>
                  <button 
                    onClick={() => onDeleteBill(b.id)} 
                    className="text-rose-500 p-2 opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <i className="fa-solid fa-trash"></i>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <button 
          onClick={onFinishDay} 
          className="w-full bg-emerald-500 text-white py-4 px-5 rounded-[2rem] font-black text-sm uppercase tracking-[0.18em] shadow-xl flex items-center justify-center gap-4 active:scale-95 transition-transform mt-4"
        >
          ML Analysis <i className="fa-solid fa-magnifying-glass-chart"></i>
        </button>
      </div>

      {/* Custom Vehicle Modal - UPDATED: AI-predicted emission factor */}
      {showCustomVehicleModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white dark:bg-slate-900 rounded-[2rem] p-6 max-w-md w-full shadow-xl animate-in zoom-in-95 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-black text-slate-800 dark:text-white">Add Custom Vehicle</h2>
              <button 
                onClick={() => {
                  setShowCustomVehicleModal(false);
                  setCustomVehicleName('');
                  setCustomVehicleType('');
                  setCustomVehicleMake('');
                  setCustomVehicleModel('');
                  setCustomVehicleYear('');
                  setCustomFuelType('');
                  setIsPredictingFactor(false);
                }}
                className="w-8 h-8 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-400 flex items-center justify-center"
              >
                <i className="fa-solid fa-times"></i>
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-[11px] font-black text-slate-400 uppercase tracking-[0.16em] mb-2 block">
                  Vehicle Name *
                </label>
                <input
                  type="text"
                  value={customVehicleName}
                  onChange={(e) => setCustomVehicleName(e.target.value)}
                  placeholder="e.g., My Tesla Model 3, Honda Civic 2020"
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-4 rounded-xl font-bold text-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-black text-slate-400 uppercase tracking-[0.16em] mb-2 block">
                    Make (Optional)
                  </label>
                  <input
                    type="text"
                    value={customVehicleMake}
                    onChange={(e) => setCustomVehicleMake(e.target.value)}
                    placeholder="e.g., Honda"
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-4 rounded-xl font-bold text-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-black text-slate-400 uppercase tracking-[0.16em] mb-2 block">
                    Model (Optional)
                  </label>
                  <input
                    type="text"
                    value={customVehicleModel}
                    onChange={(e) => setCustomVehicleModel(e.target.value)}
                    placeholder="e.g., Civic"
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-4 rounded-xl font-bold text-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-black text-slate-400 uppercase tracking-[0.16em] mb-2 block">
                    Year (Optional)
                  </label>
                  <input
                    type="text"
                    value={customVehicleYear}
                    onChange={(e) => setCustomVehicleYear(e.target.value)}
                    placeholder="e.g., 2020"
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-4 rounded-xl font-bold text-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-black text-slate-400 uppercase tracking-[0.16em] mb-2 block">
                    Vehicle Type
                  </label>
                  <select
                    value={customVehicleType}
                    onChange={(e) => setCustomVehicleType(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-4 rounded-xl font-bold text-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="">Select</option>
                    <option value="car">Car</option>
                    <option value="suv">SUV</option>
                    <option value="truck">Truck</option>
                    <option value="motorcycle">Motorcycle</option>
                    <option value="scooter">Scooter</option>
                    <option value="van">Van</option>
                    <option value="other">Other</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-[11px] font-black text-slate-400 uppercase tracking-[0.16em] mb-2 block">
                  Fuel Type
                </label>
                <select
                  value={customFuelType}
                  onChange={(e) => setCustomFuelType(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-4 rounded-xl font-bold text-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="">Select fuel type</option>
                  <option value="electric">Electric</option>
                  <option value="hybrid">Hybrid</option>
                  <option value="gas">Gasoline</option>
                  <option value="diesel">Diesel</option>
                  <option value="cng">CNG</option>
                  <option value="lpg">LPG</option>
                </select>
              </div>

              {isPredictingFactor && (
                <div className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-[0.16em] text-center">
                  Estimating emissions from API...
                </div>
              )}

              <button
                onClick={handleSaveCustomVehicle}
                disabled={!customVehicleName.trim() || isPredictingFactor}
                className="w-full bg-emerald-500 text-white py-4 px-5 rounded-xl font-black uppercase tracking-[0.16em] disabled:opacity-50 disabled:cursor-not-allowed shadow-lg active:scale-95 transition-transform"
              >
                <i className={`fa-solid ${isPredictingFactor ? 'fa-spinner animate-spin' : 'fa-check'} mr-2`}></i>
                {isPredictingFactor ? 'Estimating Emissions...' : 'Save Vehicle'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default Tracker;
