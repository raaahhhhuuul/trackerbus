import { useEffect, useState } from "react";
import {
  getCachedStudentLocation,
  saveStudentLocation,
  subscribeToStudentLocation,
  type StudentLocationRecord,
} from "@/lib/student-location";

interface UseStudentLocationOptions {
  enabled?: boolean;
  watch?: boolean;
}

export function useStudentLocation(options: UseStudentLocationOptions = {}) {
  const enabled = options.enabled ?? true;
  const watch = options.watch ?? false;

  const [location, setLocation] = useState<StudentLocationRecord | null>(() =>
    getCachedStudentLocation(),
  );
  const [loading, setLoading] = useState(enabled && watch);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }

    const unsubscribe = subscribeToStudentLocation((next) => {
      setLocation(next);
      if (next) {
        setLoading(false);
      }
    });

    return unsubscribe;
  }, [enabled]);

  useEffect(() => {
    if (!enabled || !watch) {
      setLoading(false);
      return;
    }

    if (!navigator.geolocation) {
      setError("Geolocation is not supported in this browser.");
      setLoading(false);
      return;
    }

    setLoading(true);

    const onSuccess = (position: GeolocationPosition) => {
      const next = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: position.coords.accuracy ?? null,
        updatedAt: new Date(position.timestamp || Date.now()).toISOString(),
      };

      saveStudentLocation(next);
      setError(null);
      setLoading(false);
    };

    const onError = (positionError: GeolocationPositionError) => {
      setError(positionError.message);
      setLoading(false);
    };

    navigator.geolocation.getCurrentPosition(onSuccess, onError, {
      enableHighAccuracy: true,
      maximumAge: 10000,
      timeout: 15000,
    });

    const watchId = navigator.geolocation.watchPosition(onSuccess, onError, {
      enableHighAccuracy: true,
      maximumAge: 5000,
      timeout: 15000,
    });

    return () => {
      navigator.geolocation.clearWatch(watchId);
    };
  }, [enabled, watch]);

  return { location, loading, error };
}
