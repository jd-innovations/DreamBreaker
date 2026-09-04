import { useCallback, useEffect, useState } from 'react';
import * as Location from 'expo-location';

export type Coordinates = {
  lat: number;
  lng: number;
};

export const FALLBACK_LOCATION: Coordinates = {
  lat: 27.4496,
  lng: -82.3787,
};

export const FALLBACK_LOCATION_LABEL = 'Lakewood Ranch';

export type CurrentLocationState = Coordinates & {
  permissionStatus: Location.PermissionStatus | null;
  loading: boolean;
  error: string | null;
  isFallback: boolean;
  refresh: () => Promise<void>;
};

function coordsFromPosition(position: Location.LocationObject): Coordinates {
  return {
    lat: position.coords.latitude,
    lng: position.coords.longitude,
  };
}

export function useCurrentLocation(): CurrentLocationState {
  const [coords, setCoords] = useState<Coordinates>(FALLBACK_LOCATION);
  const [permissionStatus, setPermissionStatus] = useState<Location.PermissionStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isFallback, setIsFallback] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      setPermissionStatus(permission.status);

      if (permission.status !== Location.PermissionStatus.GRANTED) {
        setCoords(FALLBACK_LOCATION);
        setIsFallback(true);
        setError('location_permission_denied');
        return;
      }

      const lastKnown = await Location.getLastKnownPositionAsync({
        maxAge: 5 * 60 * 1000,
        requiredAccuracy: 1500,
      });

      if (lastKnown) {
        setCoords(coordsFromPosition(lastKnown));
        setIsFallback(false);
      }

      const current = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      setCoords(coordsFromPosition(current));
      setIsFallback(false);
    } catch (err) {
      setCoords(FALLBACK_LOCATION);
      setIsFallback(true);
      setError(err instanceof Error ? err.message : 'location_unavailable');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return {
    ...coords,
    permissionStatus,
    loading,
    error,
    isFallback,
    refresh,
  };
}
