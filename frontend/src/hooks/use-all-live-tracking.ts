import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export interface ActiveDriverPos {
  driverUserId: string;
  latitude: number;
  longitude: number;
  speedKmh: number;
  updatedAt: string;
}

/** Polls driver_live_tracking for all currently-active drivers every `refreshMs` ms. */
export function useAllLiveTracking(refreshMs = 5000) {
  const [positions, setPositions] = useState<ActiveDriverPos[]>([]);

  useEffect(() => {
    let mounted = true;
    const sync = async () => {
      const { data } = await supabase
        .from("driver_live_tracking")
        .select("user_id, latitude, longitude, speed_kmh, updated_at")
        .eq("is_active", true);
      if (!mounted || !data) return;
      setPositions(
        (data as Array<{
          user_id: string;
          latitude: number;
          longitude: number;
          speed_kmh: number;
          updated_at: string;
        }>).map((r) => ({
          driverUserId: r.user_id,
          latitude: r.latitude,
          longitude: r.longitude,
          speedKmh: r.speed_kmh,
          updatedAt: r.updated_at,
        })),
      );
    };
    void sync();
    const t = window.setInterval(() => void sync(), refreshMs);
    return () => { mounted = false; window.clearInterval(t); };
  }, [refreshMs]);

  return positions;
}
