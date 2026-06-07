import { useEffect, useState } from "react";
import { getNotificationsForRole } from "@/lib/admin-console";

export type AppRoleForNotifications = "student" | "driver";

export interface RoleNotification {
  id: string;
  title: string;
  message: string;
  targetRole: "all" | AppRoleForNotifications;
  createdAt: string;
}

export function useRoleNotifications(role: AppRoleForNotifications, refreshMs = 10000) {
  const [notifications, setNotifications] = useState<RoleNotification[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    const load = async () => {
      try {
        const next = await getNotificationsForRole(role);
        if (!isMounted) return;
        setNotifications(next);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    setLoading(true);
    void load();
    const timer = window.setInterval(() => {
      void load();
    }, refreshMs);

    return () => {
      isMounted = false;
      window.clearInterval(timer);
    };
  }, [refreshMs, role]);

  return { notifications, loading };
}
