import { supabase } from './supabaseClient';
import { Trip, UtilityBill, UserProfile, CustomVehicle, VehicleType, LeaderboardEntry } from './types';

// Usernames are the login identity, so they must map 1:1 onto the synthetic
// email address. Normalising here (and storing the normalised form) prevents
// "Alice" and "alice" from resolving to the same auth account while occupying
// two different profile rows.
const USERNAME_PATTERN = /^[a-z0-9_.-]{3,24}$/;

export const normalizeUsername = (username: string) => username.trim().toLowerCase();

export const assertValidUsername = (username: string) => {
  const normalized = normalizeUsername(username);
  if (!USERNAME_PATTERN.test(normalized)) {
    throw new Error(
      'Username must be 3-24 characters using letters, numbers, dot, dash or underscore.'
    );
  }
  return normalized;
};

const usernameToEmail = (username: string) => `${normalizeUsername(username)}@ecopulse.app`;

/**
 * Surface a short, safe message to the UI and keep the database internals
 * (Postgres hints, constraint names, error codes) in the console for the
 * developer. Those details describe the schema and belong in logs, not on
 * screen in front of an unauthenticated visitor.
 */
const formatSupabaseError = (error: any) => {
  if (!error) return 'Something went wrong. Please try again.';
  console.error('[supabase]', {
    message: error.message,
    details: error.details,
    hint: error.hint,
    code: error.code
  });
  return error.message || 'Something went wrong. Please try again.';
};

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
    if (error) throw new Error(formatSupabaseError(error));
    return data.session?.user || null;
  },

  async signUp(username: string, password: string, profile: UserProfile) {
    const normalized = assertValidUsername(username);

    const { data: existing } = await supabase
      .from('profiles')
      .select('id')
      .eq('username', normalized)
      .maybeSingle();
    if (existing) {
      throw new Error('Username already taken.');
    }

    const email = usernameToEmail(normalized);
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error || !data.user) throw new Error(formatSupabaseError(error) || 'Sign up failed.');

    const { error: profileError } = await supabase.from('profiles').insert({
      id: data.user.id,
      username: normalized,
      avatar_id: profile.avatarId,
      points: profile.points,
      level: profile.level,
      daily_goal: profile.dailyGoal,
      rank: profile.rank,
      streak: profile.streak,
      dark_mode: profile.darkMode,
      available_vehicles: profile.availableVehicles || []
    });
    if (profileError) throw new Error(formatSupabaseError(profileError));

    return { id: data.user.id, username: normalized };
  },

  async signIn(username: string, password: string) {
    const email = usernameToEmail(username);
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error || !data.user) throw new Error(formatSupabaseError(error) || 'Sign in failed.');

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('username')
      .eq('id', data.user.id)
      .single();
    if (profileError || !profile) {
      throw new Error(formatSupabaseError(profileError) || 'Profile not found.');
    }

    return { id: data.user.id, username: profile.username };
  },

  async signOut() {
    const { error } = await supabase.auth.signOut();
    if (error) throw new Error(formatSupabaseError(error));
  },

  async fetchUserData(userId: string) {
    const [profileResult, tripsResult, billsResult, vehiclesResult] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', userId).single(),
      supabase.from('trips').select('*').eq('user_id', userId).order('date', { ascending: false }),
      supabase.from('bills').select('*').eq('user_id', userId).order('date', { ascending: false }),
      supabase.from('custom_vehicles').select('*').eq('user_id', userId).order('added_date', { ascending: false })
    ]);

    if (profileResult.error) throw new Error(formatSupabaseError(profileResult.error));
    if (tripsResult.error) throw new Error(formatSupabaseError(tripsResult.error));
    if (billsResult.error) throw new Error(formatSupabaseError(billsResult.error));
    if (vehiclesResult.error) throw new Error(formatSupabaseError(vehiclesResult.error));

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
    if (updates.level !== undefined) payload.level = updates.level;
    if (updates.dailyGoal !== undefined) payload.daily_goal = updates.dailyGoal;
    if (updates.rank !== undefined) payload.rank = updates.rank;
    if (updates.streak !== undefined) payload.streak = updates.streak;
    if (updates.darkMode !== undefined) payload.dark_mode = updates.darkMode;
    if (updates.availableVehicles !== undefined) payload.available_vehicles = updates.availableVehicles;

    // `username` and `points` are deliberately absent. Username is the login
    // identity (the auth email derives from it) and is pinned by a database
    // trigger. Points feed the leaderboard, so they are awarded only through
    // the award_points() function below — the `authenticated` role no longer
    // holds UPDATE on either column, so including them here would just fail.

    if (Object.keys(payload).length === 0) return;

    const { error } = await supabase.from('profiles').update(payload).eq('id', userId);
    if (error) throw new Error(formatSupabaseError(error));
  },

  /**
   * Award points for the row that earned them.
   *
   * The client cannot write `points` directly (the authenticated role has no
   * UPDATE on that column) and cannot choose the amount either: the server
   * derives it from `sourceType`, verifies the referenced trip or bill belongs
   * to the caller, and records the award in points_ledger. A unique constraint
   * there makes a repeated call a no-op, so the same trip can never pay twice.
   *
   * @param sourceType what earned the points.
   * @param sourceId   trip id, bill id, or the current UTC date for a streak.
   * @returns the new total, or null if the award was rejected.
   */
  async awardPoints(
    sourceType: 'trip' | 'bill' | 'streak',
    sourceId: string
  ): Promise<number | null> {
    const { data, error } = await supabase.rpc('award_points', {
      p_source_type: sourceType,
      p_source_id: sourceId
    });
    if (error) {
      console.error('[awardPoints]', formatSupabaseError(error));
      return null;
    }
    return typeof data === 'number' ? data : null;
  },

  async insertTrip(userId: string, trip: Trip) {
    const payload: Record<string, unknown> = {
      id: trip.id,
      user_id: userId,
      vehicle: trip.vehicle,
      custom_vehicle_name: trip.customVehicleName || null,
      distance: trip.distance,
      date: trip.date,
      co2: trip.co2
    };
    // Only include extended fields if they have values
    // (avoids errors if these columns don't exist in the DB yet)
    if (trip.vehicleType) payload.vehicle_type = trip.vehicleType;
    if (trip.fuelType) payload.fuel_type = trip.fuelType;
    if (trip.vehicleCondition) payload.vehicle_condition = trip.vehicleCondition;
    if (trip.drivingStyle) payload.driving_style = trip.drivingStyle;
    if (trip.odometerKm != null) payload.odometer_km = trip.odometerKm;
    if (trip.isAutomatic != null) payload.is_automatic = trip.isAutomatic;
    if (trip.confidence != null) payload.confidence = trip.confidence;

    const { error } = await supabase.from('trips').insert(payload);
    if (error) {
      console.error('[insertTrip] Failed to save trip to Supabase:', formatSupabaseError(error), payload);
      throw new Error(formatSupabaseError(error));
    }
  },

  async deleteTrip(userId: string, tripId: string) {
    const { error } = await supabase.from('trips').delete().eq('id', tripId).eq('user_id', userId);
    if (error) throw new Error(formatSupabaseError(error));
  },

  async insertBill(userId: string, bill: UtilityBill) {
    const payload: Record<string, unknown> = {
      id: bill.id,
      user_id: userId,
      month: bill.month,
      year: bill.year,
      units: bill.units,
      co2: bill.co2,
      date: bill.date
    };
    const { error } = await supabase.from('bills').insert(payload);
    if (error) throw new Error(formatSupabaseError(error));
  },

  async deleteBill(userId: string, billId: string) {
    const { error } = await supabase.from('bills').delete().eq('id', billId).eq('user_id', userId);
    if (error) throw new Error(formatSupabaseError(error));
  },

  async insertCustomVehicle(userId: string, vehicle: CustomVehicle) {
    const payload: Record<string, unknown> = {
      user_id: userId,
      name: vehicle.name,
      factor: vehicle.factor,
      category: vehicle.category || null,
      added_date: vehicle.addedDate || new Date().toISOString()
    };
    const { error } = await supabase.from('custom_vehicles').insert(payload);
    if (error) throw new Error(formatSupabaseError(error));
  },

  async deleteCustomVehicle(userId: string, vehicleName: string) {
    const { error } = await supabase
      .from('custom_vehicles')
      .delete()
      .eq('user_id', userId)
      .eq('name', vehicleName);
    if (error) throw new Error(formatSupabaseError(error));
  },

  async fetchLeaderboard(userId: string): Promise<LeaderboardEntry[]> {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, username, points, avatar_id')
      .order('points', { ascending: false });
    if (error || !data) {
      throw new Error(formatSupabaseError(error) || 'Failed to load leaderboard.');
    }

    return data.map((row: any, index: number) => ({
      name: row.username,
      points: row.points,
      rank: index + 1,
      avatar: row.avatar_id,
      isUser: row.id === userId
    }));
  }
};
