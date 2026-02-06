import { supabase } from './supabaseClient';
import { Trip, UtilityBill, UserProfile, CustomVehicle, VehicleType, LeaderboardEntry } from './types';

const usernameToEmail = (username: string) => `${username.toLowerCase()}@ecopulse.app`;

const mapProfileRow = (row: any): UserProfile => ({
  name: row.username,
  avatarId: row.avatar_id,
  points: row.points,
  level: row.level,
  dailyGoal: row.daily_goal,
  rank: row.rank ?? 1,
  streak: row.streak,
  darkMode: row.dark_mode,
  customVehicles: [],
  availableVehicles: row.available_vehicles || []
});

const mapTripRow = (row: any): Trip => ({
  id: row.id,
  vehicle: row.vehicle,
  customVehicleName: row.custom_vehicle_name || undefined,
  distance: row.distance,
  date: row.date,
  co2: row.co2,
  vehicleType: row.vehicle_type || undefined,
  fuelType: row.fuel_type || undefined,
  vehicleCondition: row.vehicle_condition || undefined,
  drivingStyle: row.driving_style || undefined,
  odometerKm: row.odometer_km ?? undefined,
  isAutomatic: row.is_automatic || undefined,
  confidence: row.confidence || undefined
});

const mapBillRow = (row: any): UtilityBill => ({
  id: row.id,
  month: row.month,
  year: row.year,
  units: row.units,
  co2: row.co2,
  date: row.date,
  isAnomalous: row.is_anomalous || undefined,
  confidence: row.confidence || undefined
});

const mapVehicleRow = (row: any): CustomVehicle => ({
  name: row.name,
  factor: row.factor,
  category: row.category || undefined,
  vehicleType: row.vehicle_type || undefined,
  fuelType: row.fuel_type || undefined,
  vehicleCondition: row.vehicle_condition || undefined,
  drivingStyle: row.driving_style || undefined,
  odometerKm: row.odometer_km ?? undefined,
  addedDate: row.added_date || undefined
});

export const cloud = {
  async getSessionUser() {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    return data.session?.user || null;
  },

  async signUp(username: string, password: string, profile: UserProfile) {
    const { data: existing } = await supabase
      .from('profiles')
      .select('id')
      .eq('username', username)
      .maybeSingle();
    if (existing) {
      throw new Error('Username already taken.');
    }

    const email = usernameToEmail(username);
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error || !data.user) throw error || new Error('Sign up failed.');

    const { error: profileError } = await supabase.from('profiles').insert({
      id: data.user.id,
      username,
      avatar_id: profile.avatarId,
      points: profile.points,
      level: profile.level,
      daily_goal: profile.dailyGoal,
      rank: profile.rank,
      streak: profile.streak,
      dark_mode: profile.darkMode,
      available_vehicles: profile.availableVehicles || []
    });
    if (profileError) throw profileError;

    return { id: data.user.id, username };
  },

  async signIn(username: string, password: string) {
    const email = usernameToEmail(username);
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error || !data.user) throw error || new Error('Sign in failed.');

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('username')
      .eq('id', data.user.id)
      .single();
    if (profileError || !profile) throw profileError || new Error('Profile not found.');

    return { id: data.user.id, username: profile.username };
  },

  async signOut() {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  },

  async fetchUserData(userId: string) {
    const [profileResult, tripsResult, billsResult, vehiclesResult] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', userId).single(),
      supabase.from('trips').select('*').eq('user_id', userId).order('date', { ascending: false }),
      supabase.from('bills').select('*').eq('user_id', userId).order('date', { ascending: false }),
      supabase.from('custom_vehicles').select('*').eq('user_id', userId).order('added_date', { ascending: false })
    ]);

    if (profileResult.error) throw profileResult.error;
    if (tripsResult.error) throw tripsResult.error;
    if (billsResult.error) throw billsResult.error;
    if (vehiclesResult.error) throw vehiclesResult.error;

    return {
      profile: mapProfileRow(profileResult.data),
      trips: tripsResult.data.map(mapTripRow),
      bills: billsResult.data.map(mapBillRow),
      customVehicles: vehiclesResult.data.map(mapVehicleRow)
    };
  },

  async saveProfile(userId: string, updates: Partial<UserProfile>) {
    const payload: Record<string, unknown> = {};
    if (updates.avatarId !== undefined) payload.avatar_id = updates.avatarId;
    if (updates.points !== undefined) payload.points = updates.points;
    if (updates.level !== undefined) payload.level = updates.level;
    if (updates.dailyGoal !== undefined) payload.daily_goal = updates.dailyGoal;
    if (updates.rank !== undefined) payload.rank = updates.rank;
    if (updates.streak !== undefined) payload.streak = updates.streak;
    if (updates.darkMode !== undefined) payload.dark_mode = updates.darkMode;
    if (updates.availableVehicles !== undefined) payload.available_vehicles = updates.availableVehicles;
    if (updates.name !== undefined) payload.username = updates.name;

    if (Object.keys(payload).length === 0) return;

    const { error } = await supabase.from('profiles').update(payload).eq('id', userId);
    if (error) throw error;
  },

  async insertTrip(userId: string, trip: Trip) {
    const { error } = await supabase.from('trips').insert({
      id: trip.id,
      user_id: userId,
      vehicle: trip.vehicle,
      custom_vehicle_name: trip.customVehicleName || null,
      distance: trip.distance,
      date: trip.date,
      co2: trip.co2,
      vehicle_type: trip.vehicleType || null,
      fuel_type: trip.fuelType || null,
      vehicle_condition: trip.vehicleCondition || null,
      driving_style: trip.drivingStyle || null,
      odometer_km: trip.odometerKm ?? null,
      is_automatic: trip.isAutomatic || null,
      confidence: trip.confidence || null
    });
    if (error) throw error;
  },

  async deleteTrip(userId: string, tripId: string) {
    const { error } = await supabase.from('trips').delete().eq('id', tripId).eq('user_id', userId);
    if (error) throw error;
  },

  async insertBill(userId: string, bill: UtilityBill) {
    const { error } = await supabase.from('bills').insert({
      id: bill.id,
      user_id: userId,
      month: bill.month,
      year: bill.year,
      units: bill.units,
      co2: bill.co2,
      date: bill.date,
      is_anomalous: bill.isAnomalous || null,
      confidence: bill.confidence || null
    });
    if (error) throw error;
  },

  async deleteBill(userId: string, billId: string) {
    const { error } = await supabase.from('bills').delete().eq('id', billId).eq('user_id', userId);
    if (error) throw error;
  },

  async insertCustomVehicle(userId: string, vehicle: CustomVehicle) {
    const { error } = await supabase.from('custom_vehicles').insert({
      user_id: userId,
      name: vehicle.name,
      factor: vehicle.factor,
      category: vehicle.category || null,
      vehicle_type: vehicle.vehicleType || null,
      fuel_type: vehicle.fuelType || null,
      vehicle_condition: vehicle.vehicleCondition || null,
      driving_style: vehicle.drivingStyle || null,
      odometer_km: vehicle.odometerKm ?? null,
      added_date: vehicle.addedDate || new Date().toISOString()
    });
    if (error) throw error;
  },

  async deleteCustomVehicle(userId: string, vehicleName: string) {
    const { error } = await supabase
      .from('custom_vehicles')
      .delete()
      .eq('user_id', userId)
      .eq('name', vehicleName);
    if (error) throw error;
  },

  async fetchLeaderboard(userId: string): Promise<LeaderboardEntry[]> {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, username, points, avatar_id')
      .order('points', { ascending: false });
    if (error || !data) throw error || new Error('Failed to load leaderboard.');

    return data.map((row: any, index: number) => ({
      name: row.username,
      points: row.points,
      rank: index + 1,
      avatar: row.avatar_id,
      isUser: row.id === userId
    }));
  }
};
