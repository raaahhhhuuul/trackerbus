import { useEffect, useState } from "react";
import {
  getCachedDriverTracking,
  getLatestDriverTracking,
  getTrackingForDriver,
  subscribeToDriverTracking,
  type LiveTrackingRecord,
} from "@/lib/live-tracking";

export function useLiveTracking(driverUserId?: string | null, refreshMs = 3000) {
  const [tracking, setTracking] = useState<LiveTrackingRecord | null>(() =>
    getCachedDriverTracking(),
  );
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    const sync = async () => {
      const latest = driverUserId
        ? await getTrackingForDriver(driverUserId)
        : await getLatestDriverTracking();
      if (!isMounted) return;
      setTracking(latest);
      setLoading(false);
    };

    void sync();

    // Only subscribe to global events when not filtering by driver
    let unsubscribe: (() => void) | undefined;
    if (!driverUserId) {
      unsubscribe = subscribeToDriverTracking((next) => {
        if (!isMounted) return;
        setTracking(next);
        setLoading(false);
      });
    }

    const timer = window.setInterval(() => {
      void sync();
    }, refreshMs);

    return () => {
      isMounted = false;
      unsubscribe?.();
      window.clearInterval(timer);
    };
  }, [driverUserId, refreshMs]);

  return { tracking, loading };
}
