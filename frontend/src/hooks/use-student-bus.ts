import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { getSession } from "@/lib/auth";

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
        // Fetch student's assigned bus
        const { data: student } = await supabase
          .from("students")
          .select("assigned_bus_id")
          .eq("id", session.userId)
          .maybeSingle<{ assigned_bus_id: string | null }>();

        if (!student?.assigned_bus_id) {
          if (isMounted) { setBusInfo(null); setLoading(false); }
          return;
        }

        // Fetch bus details + assigned driver
        const { data: bus } = await supabase
          .from("buses")
          .select("id, bus_number, route_name, assigned_driver_id")
          .eq("id", student.assigned_bus_id)
          .maybeSingle<{
            id: string;
            bus_number: string;
            route_name: string;
            assigned_driver_id: string | null;
          }>();

        if (!isMounted) return;

        if (bus) {
          setBusInfo({
            busId: bus.id,
            busNumber: bus.bus_number,
            routeName: bus.route_name,
            driverUserId: bus.assigned_driver_id,
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

    // Re-check every 15 s in case admin reassigns the bus or driver
    const timer = window.setInterval(() => void load(), 15000);

    return () => {
      isMounted = false;
      window.clearInterval(timer);
    };
  }, []);

  return { busInfo, loading };
}
