import { Trip, UtilityBill } from './types';

const ML_API_URL = import.meta.env.VITE_ML_API_URL || '/api';
const ML_ENABLED = String(import.meta.env.VITE_ML_ENABLED || '').toLowerCase() === 'true';

const buildUrl = (path: string) => {
  const base = ML_API_URL.replace(/\/+$/, '');
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `${base}${cleanPath}`;
};

const isEnabled = () => Boolean(ML_API_URL) && ML_ENABLED;

const safeJson = async (response: Response) => {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
};

const request = async (path: string, options?: RequestInit) => {
  if (!isEnabled()) {
    throw new Error('ML backend not configured.');
  }
  const response = await fetch(buildUrl(path), {
    headers: { 'Content-Type': 'application/json', ...(options?.headers || {}) },
    ...options
  });
  if (!response.ok) {
    const payload = await safeJson(response);
    const detail =
      typeof payload === 'string'
        ? payload
        : payload?.detail || payload?.message || JSON.stringify(payload);
    throw new Error(`ML backend ${response.status}: ${detail}`);
  }
  return safeJson(response);
};

export const mlBackend = {
  isEnabled,

  async syncTrip(userId: string, trip: Trip) {
    if (!isEnabled()) return;
    await request('/trips', {
      method: 'POST',
      body: JSON.stringify({
        user_id: userId,
        date: trip.date,
        distance: trip.distance,
        co2: trip.co2,
        vehicle: trip.vehicle === 'Custom' ? trip.customVehicleName || 'Custom' : trip.vehicle
      })
    });
  },

  async syncBill(userId: string, bill: UtilityBill) {
    if (!isEnabled()) return;
    await request('/bills', {
      method: 'POST',
      body: JSON.stringify({
        user_id: userId,
        date: bill.date,
        units: bill.units
      })
    });
  },

  async syncAll(userId: string, trips: Trip[], bills: UtilityBill[]) {
    if (!isEnabled()) return;
    for (const trip of trips) {
      await this.syncTrip(userId, trip);
    }
    for (const bill of bills) {
      await this.syncBill(userId, bill);
    }
  },

  async train(userId: string) {
    if (!isEnabled()) return null;
    return request('/train', { method: 'POST', body: JSON.stringify({ user_id: userId }) });
  },

  async predict(userId: string) {
    if (!isEnabled()) return null;
    return request('/predict', { method: 'POST', body: JSON.stringify({ user_id: userId }) });
  },

  async cluster() {
    if (!isEnabled()) return null;
    return request('/cluster', { method: 'GET' });
  }
};
