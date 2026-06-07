import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Play,
  Square,
  MapPin,
  Gauge,
  Route as RouteIcon,
  Clock,
  Satellite,
  Navigation,
  BellRing,
} from "lucide-react";
import { toast } from "sonner";
import { StatusBadge } from "@/components/status-badge";
import { getHomeRouteForRole, getSession } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { saveDriverTracking, stopDriverTracking } from "../lib/live-tracking";
import { useRoleNotifications } from "../hooks/use-role-notifications";
import { getAssignedBusForDriver } from "../lib/admin-console";
import { haversineKm } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/*  Driver Panel                                                      */
/* ------------------------------------------------------------------ */
export function DriverPanel() {
  const navigate = useNavigate();
  const [active, setActive] = useState(false);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [speed, setSpeed] = useState(0);
  const [distance, setDistance] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [driverName, setDriverName] = useState("Driver");
  const [assignedBus, setAssignedBus] = useState<{
    busNumber: string;
    routeName: string;
  } | null>(null);
  const [assignmentLoading, setAssignmentLoading] = useState(true);
  const [assignedBusLabel, setAssignedBusLabel] = useState<string | null>(null);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const { notifications } = useRoleNotifications("driver");

  /* refs for async callbacks that need latest values */
  const watchIdRef = useRef<number | null>(null);
  const prevCoordsRef = useRef<{ lat: number; lng: number } | null>(null);
  const prevTimestampRef = useRef<number | null>(null);
  const startTimeRef = useRef<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const uploadRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const latestRef = useRef({
    lat: 0,
    lng: 0,
    speed: 0,
    distance: 0,
    active: false,
  });

  useEffect(() => {
    const session = getSession();
    if (!session) {
      navigate("/login", { replace: true });
      return;
    }
    if (session.role !== "driver") {
      navigate(getHomeRouteForRole(session.role), { replace: true });
    }
  }, [navigate]);

  /* sync refs with state so the upload interval always has fresh data */
  useEffect(() => {
    latestRef.current = {
      lat: coords?.lat ?? 0,
      lng: coords?.lng ?? 0,
      speed,
      distance,
      active,
    };
  }, [coords, speed, distance, active]);

  /* get driver name from session */
  useEffect(() => {
    const session = getSession();
    if (session) {
      setDriverName(session.displayName || session.loginId || session.email.split("@")[0] || "Driver");
    }
  }, []);

  useEffect(() => {
    let isMounted = true;

    const loadAssignedBus = async () => {
      try {
        const localSession = getSession();
        const {
          data: { session: supabaseSession },
        } = await supabase.auth.getSession();
        const userId = supabaseSession?.user.id ?? localSession?.userId;
        console.log("driver loadAssignedBus userId:", userId);
        if (!userId) {
          if (!isMounted) return;
          setAssignedBus(null);
          setAssignedBusLabel(null);
          setAssignmentLoading(false);
          return;
        }
        const bus = await getAssignedBusForDriver(userId);
        console.log("driver loadAssignedBus result:", bus);
        if (!isMounted) return;
        setAssignedBus(bus ? { busNumber: bus.busNumber, routeName: bus.routeName } : null);
        setAssignedBusLabel(bus ? `${bus.busNumber} · ${bus.routeName}` : null);
      } catch {
        if (!isMounted) return;
        setAssignedBus(null);
        setAssignedBusLabel(null);
      } finally {
        if (isMounted) {
          setAssignmentLoading(false);
        }
      }
    };

    void loadAssignedBus();
    const timer = window.setInterval(() => {
      void loadAssignedBus();
    }, 10000);

    return () => {
      isMounted = false;
      window.clearInterval(timer);
    };
  }, []);

  /* cleanup helper */
  const cleanup = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (uploadRef.current) {
      clearInterval(uploadRef.current);
      uploadRef.current = null;
    }
  }, []);

  useEffect(() => cleanup, [cleanup]);

  /* ---- Start Trip ---- */
  const handleStart = () => {
    const confirmed = window.confirm("Share your live location with students and start this trip?");
    if (!confirmed) return;

    if (!navigator.geolocation) {
      toast.error("Geolocation not supported", {
        description: "Your browser does not support GPS.",
      });
      return;
    }

    toast.loading("Acquiring GPS location…", { id: "gps-acquire" });

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        toast.dismiss("gps-acquire");
        const { latitude, longitude } = pos.coords;
        const initial = { lat: latitude, lng: longitude };

        setCoords(initial);
        setAccuracy(pos.coords.accuracy ?? null);
        prevCoordsRef.current = initial;
        prevTimestampRef.current = pos.timestamp || Date.now();
        setSpeed(0);
        setDistance(0);
        setElapsed(0);
        startTimeRef.current = new Date().toISOString();

        try {
          /* first push to supabase */
          await saveDriverTracking({
            latitude,
            longitude,
            speedKmh: 0,
            distanceKm: 0,
            isActive: true,
            startedAt: startTimeRef.current,
          });
        } catch (error) {
          startTimeRef.current = null;
          const message = error instanceof Error ? error.message : "Unable to sync live tracking.";
          toast.error("Trip could not be started", {
            description: message,
          });
          return;
        }

        setActive(true);
        toast.success("Trip started", {
          description: "Students can now see your live trip.",
        });

        /* continuous GPS watch */
        watchIdRef.current = navigator.geolocation.watchPosition(
          (position) => {
            const {
              latitude: lat,
              longitude: lng,
              speed: gpsSpeed,
              accuracy: acc,
            } = position.coords;
            const newCoords = { lat, lng };
            const sampleTime = position.timestamp || Date.now();

            setCoords(newCoords);
            if (acc !== null) setAccuracy(acc);

            /* accumulate distance and derive speed if sensor speed is missing */
            if (prevCoordsRef.current) {
              const seg = haversineKm(
                prevCoordsRef.current.lat,
                prevCoordsRef.current.lng,
                lat,
                lng,
              );
              const previousSampleTime = prevTimestampRef.current ?? sampleTime;
              const seconds = Math.max((sampleTime - previousSampleTime) / 1000, 1);

              if (seg > 0.003) {
                setDistance((d) => d + seg);
              }

              if ((gpsSpeed === null || gpsSpeed < 0) && seg > 0.0002) {
                const computedKmh = (seg / seconds) * 3600;
                setSpeed(Math.max(0, Math.min(120, Math.round(computedKmh))));
              }
            }

            prevCoordsRef.current = newCoords;
            prevTimestampRef.current = sampleTime;

            /* speed from GPS sensor (m/s → km/h) */
            if (gpsSpeed !== null && gpsSpeed >= 0) {
              setSpeed(Math.max(0, Math.round(gpsSpeed * 3.6)));
            }
          },
          () => {
            toast.error("Live GPS update failed", {
              description: "We could not refresh your location. Trying again automatically.",
            });
          },
          { enableHighAccuracy: true, maximumAge: 2000, timeout: 15000 },
        );

        /* elapsed timer — 1 s tick */
        timerRef.current = setInterval(() => setElapsed((e) => e + 1), 1000);

        /* push to supabase every 3 s */
        uploadRef.current = setInterval(() => {
          const l = latestRef.current;
          if (!l.active || l.lat === 0) return;
          saveDriverTracking({
            latitude: l.lat,
            longitude: l.lng,
            speedKmh: l.speed,
            distanceKm: l.distance,
            isActive: true,
            startedAt: startTimeRef.current,
          }).catch(() => undefined);
        }, 3000);
      },
      (err) => {
        toast.dismiss("gps-acquire");
        toast.error("Location access denied", { description: err.message });
      },
      { enableHighAccuracy: true, timeout: 15000 },
    );
  };

  /* ---- End Trip ---- */
  const handleEnd = () => {
    cleanup();
    prevCoordsRef.current = null;
    prevTimestampRef.current = null;
    setActive(false);
    stopDriverTracking(distance, speed).catch(() => undefined);
    toast("Trip ended", {
      description: `Total distance: ${distance.toFixed(2)} km`,
    });
  };

  /* ---- Format seconds → mm:ss or h:mm:ss ---- */
  const formatTime = (t: number) => {
    const h = Math.floor(t / 3600);
    const m = Math.floor((t % 3600) / 60);
    const s = t % 60;
    const mm = String(m).padStart(2, "0");
    const ss = String(s).padStart(2, "0");
    return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
  };

  if (assignmentLoading) {
    return (
      <div className="h-full">
        <div className="px-4 py-4 space-y-3 sm:px-5 sm:py-5">
          <div className="rounded-2xl border border-border bg-card p-5 shadow-card">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Driver Console
            </p>
            <h1 className="mt-1 font-display text-2xl font-bold tracking-tight sm:text-3xl">
              Welcome, {driverName}
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Checking your bus assignment...
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (!assignedBus) {
    return (
      <div className="h-full">
        <div className="px-4 py-4 space-y-3 sm:px-5 sm:py-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Driver Console
              </p>
              <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">
                Welcome, {driverName}
              </h1>
            </div>
            <StatusBadge status="inactive" />
          </div>

          <div className="rounded-2xl border border-warning/30 bg-warning/10 p-5 shadow-card">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-warning">
              Assignment Pending
            </p>
            <h2 className="mt-2 font-display text-2xl font-bold text-foreground">
              Wait till you are assigned to a bus.
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Your login is approved, but admin still needs to assign you a bus number and route
              before you can access the driver dashboard.
            </p>
          </div>

          <div className="rounded-2xl border border-border bg-card p-4 shadow-card">
            <div className="flex items-center gap-2">
              <BellRing className="h-4 w-4 text-primary" />
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Admin Notifications
              </p>
            </div>

            {notifications.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">No notifications right now.</p>
            ) : (
              <div className="mt-2 space-y-2">
                {notifications.slice(0, 3).map((note) => (
                  <div key={note.id} className="rounded-xl border border-border bg-surface p-3">
                    <p className="text-sm font-semibold">{note.title}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{note.message}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  /* ================================================================ */
  /*  RENDER — clean, simple sidebar                                  */
  /* ================================================================ */
  return (
    <div className="h-full">
      <div className="px-4 py-4 space-y-3 sm:px-5 sm:py-5">
        {/* ── Header ── */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Driver Console
            </p>
            <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">
              Welcome, {driverName}
            </h1>
            {assignedBusLabel ? (
              <p className="mt-1 text-xs font-medium text-muted-foreground">Assigned bus: {assignedBusLabel}</p>
            ) : null}
          </div>
          <StatusBadge status={active ? "active" : "inactive"} />
        </div>

        {/* ── Trip Control Card ── */}
        <div className="rounded-2xl border border-border bg-card p-4 shadow-card">
          <div className="flex items-center gap-2">
            <span
              className={`inline-flex h-2.5 w-2.5 rounded-full ${
                active ? "bg-success" : "bg-muted-foreground/40"
              }`}
            />
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              {active ? "Trip in progress" : "Ready to start"}
            </span>
          </div>

          <h2 className="mt-2 font-display text-3xl font-bold tabular-nums sm:text-4xl">
            {formatTime(elapsed)}
          </h2>

          <p className="mt-1 text-xs text-muted-foreground">
            Start Trip asks for your location and shares live movement with students.
          </p>

          <div className="mt-4">
            {active ? (
              <button
                onClick={handleEnd}
                className="flex items-center gap-2 rounded-full border border-destructive/30 bg-destructive/10 px-4 py-2 text-sm font-semibold text-destructive transition-colors hover:bg-destructive/20"
              >
                <Square className="h-4 w-4 fill-current" /> End Trip
              </button>
            ) : (
              <button
                onClick={handleStart}
                className="flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
              >
                <Play className="h-4 w-4 fill-current" /> Start Trip
              </button>
            )}
          </div>
        </div>

        {/* ── Stats Grid ── */}
        <div className="grid grid-cols-2 gap-3">
          <StatTile
            icon={<Gauge className="h-4 w-4" />}
            label="Speed"
            value={`${speed}`}
            suffix="km/h"
          />
          <StatTile
            icon={<RouteIcon className="h-4 w-4" />}
            label="Distance"
            value={distance.toFixed(2)}
            suffix="km"
          />
          <StatTile
            icon={<Clock className="h-4 w-4" />}
            label="Duration"
            value={formatTime(elapsed)}
            suffix=""
          />
          <StatTile
            icon={<Satellite className="h-4 w-4" />}
            label="GPS"
            value={active ? "Live" : "Off"}
            suffix={accuracy !== null && active ? `±${Math.round(accuracy)}m` : ""}
          />
        </div>

        {/* ── Live GPS Coordinates ── */}
        <div className="rounded-2xl border border-border bg-card p-4 shadow-card">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/10">
                <MapPin className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Live GPS
                </p>
                <p className="text-sm font-bold">Coordinates</p>
              </div>
            </div>
            <span className="font-mono text-[10px] font-semibold text-muted-foreground">
              {active ? "STREAMING" : "PAUSED"}
            </span>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-muted p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Latitude
              </p>
              <p className="mt-0.5 font-mono text-base font-bold tabular-nums">
                {coords ? coords.lat.toFixed(6) : "—"}°
              </p>
            </div>
            <div className="rounded-xl bg-muted p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Longitude
              </p>
              <p className="mt-0.5 font-mono text-base font-bold tabular-nums">
                {coords ? coords.lng.toFixed(6) : "—"}°
              </p>
            </div>
          </div>
        </div>

        {/* ── Tracking info note ── */}
        {active && (
          <div className="flex items-start gap-2 rounded-xl border border-success/30 bg-success/10 px-3 py-2.5">
            <Navigation className="mt-0.5 h-3.5 w-3.5 text-success shrink-0" />
            <p className="text-xs text-success font-medium">
              Your live location is being shared with students every 3 seconds.
            </p>
          </div>
        )}

        <div className="rounded-2xl border border-border bg-card p-4 shadow-card">
          <div className="flex items-center gap-2">
            <BellRing className="h-4 w-4 text-primary" />
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Admin Notifications
            </p>
          </div>

          {notifications.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">No notifications right now.</p>
          ) : (
            <div className="mt-2 space-y-2">
              {notifications.slice(0, 3).map((note) => (
                <div key={note.id} className="rounded-xl border border-border bg-surface p-3">
                  <p className="text-sm font-semibold">{note.title}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{note.message}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Stat tile                                                         */
/* ------------------------------------------------------------------ */
function StatTile({
  icon,
  label,
  value,
  suffix,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  suffix: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-3.5 shadow-card">
      <div className="flex items-center gap-1.5 text-muted-foreground">
        {icon}
        <span className="text-[10px] font-semibold uppercase tracking-wider">{label}</span>
      </div>
      <div className="mt-1.5 flex items-baseline gap-1">
        <span className="font-display text-xl font-bold">{value}</span>
        {suffix && <span className="text-xs font-medium text-muted-foreground">{suffix}</span>}
      </div>
    </div>
  );
}
