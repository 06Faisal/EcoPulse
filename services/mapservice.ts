const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '';

/**
 * Calculate distance between two coordinates using Google Maps Distance Matrix API
 * This is more accurate than Haversine as it considers actual road routes
 */
export const calculateRouteDistance = async (
  origin: { lat: number; lng: number },
  destination: { lat: number; lng: number }
): Promise<number> => {
  if (!GOOGLE_MAPS_API_KEY) {
    console.warn('Google Maps API key not found, falling back to Haversine formula');
    return calculateHaversineDistance(origin, destination);
  }

  try {
    const response = await fetch(
      `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${origin.lat},${origin.lng}&destinations=${destination.lat},${destination.lng}&key=${GOOGLE_MAPS_API_KEY}`
    );

    const data = await response.json();

    if (data.status === 'OK' && data.rows[0]?.elements[0]?.status === 'OK') {
      // Distance is returned in meters, convert to kilometers
      const distanceInMeters = data.rows[0].elements[0].distance.value;
      return distanceInMeters / 1000;
    } else {
      console.warn('Google Maps API error, falling back to Haversine');
      return calculateHaversineDistance(origin, destination);
    }
  } catch (error) {
    console.error('Error calling Google Maps API:', error);
    return calculateHaversineDistance(origin, destination);
  }
};

/**
 * Fallback: Calculate straight-line distance using Haversine formula
 * Used when Google Maps API is not available or fails
 */
export const calculateHaversineDistance = (
  coord1: { lat: number; lng: number },
  coord2: { lat: number; lng: number }
): number => {
  const R = 6371; // Earth's radius in kilometers
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

/**
 * Convert degrees to radians
 */
const toRad = (degrees: number): number => {
  return (degrees * Math.PI) / 180;
};

/**
 * Initialize Google Maps API (optional, for future features)
 * This can be used to load the Maps JavaScript API if needed
 */
export const initGoogleMaps = (): Promise<void> => {
  return new Promise((resolve, reject) => {
    if (window.google && window.google.maps) {
      resolve();
      return;
    }

    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_API_KEY}`;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Google Maps API'));
    document.head.appendChild(script);
  });
};

// Type augmentation for window.google
declare global {
  interface Window {
    google?: any;
  }
}










