import { useEffect, useState } from "react";
import { getSession } from "@/lib/auth";
import { apiUrl } from "@/lib/api";

export interface StudentBusInfo {
  busId: string;
  busNumber: string;
  routeName: string;
  driverUserId: string | null;
}

export function useStudentBus() {
  const [busInfo, setBusInfo] = useState<StudentBusInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    const load = async () => {
      const session = getSession();
      if (!session?.userId) {
        if (isMounted) setLoading(false);
        return;
      }

      try {
        // Use backend API (service role) so Supabase RLS never blocks the read
        const res = await fetch(apiUrl("/api/student-bus"), {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ userId: session.userId }),
        });

        if (!isMounted) return;

        if (!res.ok) { setBusInfo(null); setLoading(false); return; }

        const payload = (await res.json()) as {
          ok: boolean;
          busId: string | null;
          busNumber: string | null;
          routeName: string | null;
          driverUserId: string | null;
        };

        if (!isMounted) return;

        if (payload.ok && payload.busId) {
          setBusInfo({
            busId: payload.busId,
            busNumber: payload.busNumber ?? payload.busId,
            routeName: payload.routeName ?? "Unknown Route",
            driverUserId: payload.driverUserId,
          });
        } else {
          setBusInfo(null);
        }
      } catch {
        if (isMounted) setBusInfo(null);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    void load();

    // Poll every 8 s so bus/driver reassignments are visible quickly
    const timer = window.setInterval(() => void load(), 8000);

    return () => {
      isMounted = false;
      window.clearInterval(timer);
    };
  }, []);

  return { busInfo, loading };
}
