import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Activity,
  BellRing,
  Clock,
  Gauge,
  Loader2,
  Map,
  MapPin,
  Navigation,
  Route as RouteIcon,
  Satellite,
  Square,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { getHomeRouteForRole, getSession } from "@/lib/auth";
import { saveDriverTracking, stopDriverTracking } from "../lib/live-tracking";
import { useRoleNotifications } from "../hooks/use-role-notifications";
import { getAssignedBusForDriver } from "../lib/admin-console";
import { haversineKm } from "@/lib/utils";
import { DriverPositionMap } from "@/components/driver-position-map";

export function DriverPanel() {
  const navigate = useNavigate();
  const [active, setActive] = useState(false);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [speed, setSpeed] = useState(0);
  const [distance, setDistance] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [driverName, setDriverName] = useState("Driver");
  const [assignedBus, setAssignedBus] = useState<{ busNumber: string; routeName: string } | null>(null);
  const [assignmentLoading, setAssignmentLoading] = useState(true);
  const [assignedBusLabel, setAssignedBusLabel] = useState<string | null>(null);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const { notifications } = useRoleNotifications("driver");

  const watchIdRef = useRef<number | null>(null);
  const prevCoordsRef = useRef<{ lat: number; lng: number } | null>(null);
  const prevTimestampRef = useRef<number | null>(null);
  const startTimeRef = useRef<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const uploadRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const latestRef = useRef({ lat: 0, lng: 0, speed: 0, distance: 0, active: false });

  useEffect(() => {
    const session = getSession();
    if (!session) { navigate("/login", { replace: true }); return; }
    if (session.role !== "driver") navigate(getHomeRouteForRole(session.role), { replace: true });
  }, [navigate]);

  useEffect(() => {
    latestRef.current = { lat: coords?.lat ?? 0, lng: coords?.lng ?? 0, speed, distance, active };
  }, [coords, speed, distance, active]);

  useEffect(() => {
    const session = getSession();
    if (session) {
      setDriverName(session.displayName || session.loginId || session.email.split("@")[0] || "Driver");
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const local = getSession();
        const userId = local?.userId;
        if (!userId) { if (mounted) { setAssignedBus(null); setAssignmentLoading(false); } return; }
        const bus = await getAssignedBusForDriver(userId);
        if (!mounted) return;
        setAssignedBus(bus ? { busNumber: bus.busNumber, routeName: bus.routeName } : null);
        setAssignedBusLabel(bus ? `${bus.busNumber} · ${bus.routeName}` : null);
      } catch {
        if (mounted) { setAssignedBus(null); setAssignedBusLabel(null); }
      } finally {
        if (mounted) setAssignmentLoading(false);
      }
    };
    void load();
    const t = window.setInterval(() => void load(), 10000);
    return () => { mounted = false; window.clearInterval(t); };
  }, []);

  const cleanup = useCallback(() => {
    if (watchIdRef.current !== null) { navigator.geolocation.clearWatch(watchIdRef.current); watchIdRef.current = null; }
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    if (uploadRef.current) { clearInterval(uploadRef.current); uploadRef.current = null; }
  }, []);

  useEffect(() => cleanup, [cleanup]);

  const handleStart = () => {
    const confirmed = window.confirm("Share your live location with students and start this trip?");
    if (!confirmed) return;
    if (!navigator.geolocation) { toast.error("Geolocation not supported"); return; }

    toast.loading("Acquiring GPS…", { id: "gps-acquire" });

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        toast.dismiss("gps-acquire");
        const { latitude, longitude } = pos.coords;
        const initial = { lat: latitude, lng: longitude };
        setCoords(initial); setAccuracy(pos.coords.accuracy ?? null);
        prevCoordsRef.current = initial;
        prevTimestampRef.current = pos.timestamp || Date.now();
        setSpeed(0); setDistance(0); setElapsed(0);
        startTimeRef.current = new Date().toISOString();

        try {
          await saveDriverTracking({ latitude, longitude, speedKmh: 0, distanceKm: 0, isActive: true, startedAt: startTimeRef.current });
        } catch (error) {
          startTimeRef.current = null;
          toast.error("Trip could not be started", { description: error instanceof Error ? error.message : "Unable to sync." });
          return;
        }

        setActive(true);
        toast.success("Trip started", { description: "Students can see your live trip." });

        watchIdRef.current = navigator.geolocation.watchPosition(
          (position) => {
            const { latitude: lat, longitude: lng, speed: gpsSpeed, accuracy: acc } = position.coords;
            const newCoords = { lat, lng };
            const sampleTime = position.timestamp || Date.now();
            setCoords(newCoords);
            if (acc !== null) setAccuracy(acc);
            if (prevCoordsRef.current) {
              const seg = haversineKm(prevCoordsRef.current.lat, prevCoordsRef.current.lng, lat, lng);
              const seconds = Math.max((sampleTime - (prevTimestampRef.current ?? sampleTime)) / 1000, 1);
              if (seg > 0.003) setDistance((d) => d + seg);
              if ((gpsSpeed === null || gpsSpeed < 0) && seg > 0.0002) {
                setSpeed(Math.max(0, Math.min(120, Math.round((seg / seconds) * 3600))));
              }
            }
            prevCoordsRef.current = newCoords;
            prevTimestampRef.current = sampleTime;
            if (gpsSpeed !== null && gpsSpeed >= 0) setSpeed(Math.max(0, Math.round(gpsSpeed * 3.6)));
          },
          () => toast.error("GPS update failed", { description: "Trying automatically." }),
          { enableHighAccuracy: true, maximumAge: 2000, timeout: 15000 },
        );

        timerRef.current = setInterval(() => setElapsed((e) => e + 1), 1000);
        uploadRef.current = setInterval(() => {
          const l = latestRef.current;
          if (!l.active || l.lat === 0) return;
          saveDriverTracking({ latitude: l.lat, longitude: l.lng, speedKmh: l.speed, distanceKm: l.distance, isActive: true, startedAt: startTimeRef.current }).catch(() => undefined);
        }, 3000);
      },
      (err) => { toast.dismiss("gps-acquire"); toast.error("Location denied", { description: err.message }); },
      { enableHighAccuracy: true, timeout: 15000 },
    );
  };

  const handleEnd = () => {
    cleanup();
    prevCoordsRef.current = null; prevTimestampRef.current = null;
    setActive(false);
    stopDriverTracking(distance, speed).catch(() => undefined);
    toast("Trip ended", { description: `Total: ${distance.toFixed(2)} km` });
  };

  const formatTime = (t: number) => {
    const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
    const mm = String(m).padStart(2, "0"), ss = String(s).padStart(2, "0");
    return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
  };

  /* Loading state */
  if (assignmentLoading) {
    return (
      <div className="flex h-[calc(100vh-64px)] items-center justify-center">
        <div className="text-center space-y-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto" />
          <p className="text-sm font-semibold text-muted-foreground">Loading assignment...</p>
        </div>
      </div>
    );
  }

  /* No bus assigned */
  if (!assignedBus) {
    return (
      <div className="flex h-[calc(100vh-64px)] items-center justify-center p-4">
        <div className="w-full max-w-sm space-y-4">
          <div className="rounded-3xl border border-warning/30 bg-warning/5 p-8 text-center space-y-4">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-warning/10">
              <Activity className="h-8 w-8 text-warning" />
            </div>
            <div>
              <h2 className="font-display text-xl font-bold">Waiting for Assignment</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Hi {driverName}! Your login is approved. Admin needs to assign you a bus before you can start trips.
              </p>
            </div>
          </div>
          {notifications.length > 0 && (
            <div className="rounded-2xl border border-border bg-card p-4 space-y-2">
              <div className="flex items-center gap-2">
                <BellRing className="h-4 w-4 text-primary" />
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Notifications</p>
              </div>
              {notifications.slice(0, 3).map((note) => (
                <div key={note.id} className="rounded-xl border border-border/50 bg-surface p-3">
                  <p className="text-sm font-semibold">{note.title}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{note.message}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  /* ── Main Driver Panel ── */
  return (
    <div className="h-[calc(100vh-64px)] overflow-y-auto">
      <div className="mx-auto max-w-lg px-4 py-5 space-y-4">

        {/* Bus info header */}
        <div className="gradient-card rounded-3xl border border-border/50 p-5 shadow-card">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Driver Console
              </p>
              <h1 className="font-display text-xl font-bold mt-0.5">{driverName}</h1>
              {assignedBusLabel && (
                <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                  <RouteIcon className="h-3 w-3" />
                  {assignedBusLabel}
                </p>
              )}
            </div>
            <div
              className={`flex flex-col items-center justify-center rounded-2xl px-3 py-2 min-w-[64px] ${
                active ? "bg-success/15 border border-success/30" : "bg-muted border border-border/50"
              }`}
            >
              <span
                className={`inline-block h-2 w-2 rounded-full mb-1 ${active ? "status-online" : "status-offline"}`}
              />
              <span className={`text-[10px] font-bold uppercase tracking-wider ${active ? "text-success" : "text-muted-foreground"}`}>
                {active ? "Live" : "Off"}
              </span>
            </div>
          </div>
        </div>

        {/* Trip control — big button card */}
        <div className={`relative overflow-hidden rounded-3xl border p-6 shadow-card transition-all duration-500 ${
          active
            ? "border-success/30 bg-success/5 glow-pulse"
            : "border-border/50 gradient-card"
        }`}>
          {/* Timer */}
          <div className="text-center mb-4">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              {active ? "Trip duration" : "Ready to start"}
            </p>
            <p className="font-display text-5xl font-bold tabular-nums mt-1">
              {formatTime(elapsed)}
            </p>
          </div>

          {/* Start / End button */}
          <div className="flex justify-center">
            {active ? (
              <button
                onClick={handleEnd}
                className="flex items-center gap-2.5 rounded-2xl border border-destructive/30 bg-destructive/10 px-8 py-3.5 text-sm font-bold text-destructive transition-all hover:bg-destructive/20 active:scale-95"
              >
                <Square className="h-5 w-5 fill-current" />
                End Trip
              </button>
            ) : (
              <button
                onClick={handleStart}
                className="relative flex items-center gap-2.5 rounded-2xl gradient-primary px-8 py-3.5 text-sm font-bold text-white shadow-glow transition-all hover:opacity-90 active:scale-95"
              >
                {/* Pulse ring on button */}
                <span className="absolute -inset-1 rounded-2xl border border-primary/40 pulse-ring" />
                <Zap className="h-5 w-5 fill-current" />
                Start Trip
              </button>
            )}
          </div>

          {active && (
            <div className="mt-3 flex items-center justify-center gap-1.5">
              <Navigation className="h-3 w-3 text-success" />
              <p className="text-xs font-medium text-success">Broadcasting live location every 3s</p>
            </div>
          )}
        </div>

        {/* Live map */}
        <div className="rounded-2xl border border-border/50 gradient-card overflow-hidden shadow-card">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-border/30">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10">
              <Map className="h-3.5 w-3.5 text-primary" />
            </div>
            <p className="text-sm font-bold">Live Location</p>
            {active && (
              <span className="ml-auto flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-success">
                <span className="inline-block h-1.5 w-1.5 rounded-full status-online" />
                Broadcasting
              </span>
            )}
          </div>
          <div className="p-2">
            <DriverPositionMap coords={coords} active={active} />
          </div>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-2 gap-3">
          <StatTile icon={<Gauge className="h-4 w-4" />} label="Speed" value={`${speed}`} suffix="km/h" color="accent" active={active} />
          <StatTile icon={<RouteIcon className="h-4 w-4" />} label="Distance" value={distance.toFixed(2)} suffix="km" color="primary" active={active} />
          <StatTile icon={<Clock className="h-4 w-4" />} label="Duration" value={formatTime(elapsed)} suffix="" color="success" active={active} />
          <StatTile
            icon={<Satellite className="h-4 w-4" />}
            label="GPS"
            value={active ? "Live" : "Off"}
            suffix={accuracy !== null && active ? `±${Math.round(accuracy)}m` : ""}
            color={active ? "success" : "muted"}
            active={active}
          />
        </div>

        {/* GPS coordinates */}
        <div className="rounded-2xl border border-border/50 gradient-card p-4">
          <div className="flex items-center gap-2 mb-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/10">
              <MapPin className="h-4 w-4 text-primary" />
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Live GPS</p>
              <p className="text-sm font-bold">
                {active ? (
                  <span className="text-gradient">Streaming</span>
                ) : (
                  <span className="text-muted-foreground">Paused</span>
                )}
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-xl bg-muted/50 p-3">
              <p className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">Latitude</p>
              <p className="mt-0.5 font-mono text-sm font-bold tabular-nums">
                {coords ? `${coords.lat.toFixed(5)}°` : "—"}
              </p>
            </div>
            <div className="rounded-xl bg-muted/50 p-3">
              <p className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">Longitude</p>
              <p className="mt-0.5 font-mono text-sm font-bold tabular-nums">
                {coords ? `${coords.lng.toFixed(5)}°` : "—"}
              </p>
            </div>
          </div>
        </div>

        {/* Notifications */}
        {notifications.length > 0 && (
          <div className="rounded-2xl border border-border/50 bg-card p-4 space-y-2">
            <div className="flex items-center gap-2">
              <BellRing className="h-4 w-4 text-primary" />
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Notifications
              </p>
            </div>
            {notifications.slice(0, 3).map((note) => (
              <div key={note.id} className="rounded-xl border border-border/40 bg-surface p-3">
                <p className="text-sm font-semibold">{note.title}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{note.message}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function StatTile({
  icon, label, value, suffix, color, active,
}: {
  icon: React.ReactNode; label: string; value: string; suffix: string;
  color: "accent" | "primary" | "success" | "muted"; active: boolean;
}) {
  const colorMap = {
    accent:  "text-accent  bg-accent/10",
    primary: "text-primary bg-primary/10",
    success: "text-success bg-success/10",
    muted:   "text-muted-foreground bg-muted/50",
  };
  return (
    <div className={`rounded-2xl border border-border/50 p-4 transition-all ${active ? "gradient-card shadow-card" : "bg-card/50"}`}>
      <div className={`inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[10px] font-semibold ${colorMap[color]}`}>
        {icon}
        <span className="uppercase tracking-wider">{label}</span>
      </div>
      <div className="mt-2 flex items-baseline gap-1">
        <span className="font-display text-2xl font-bold tabular-nums">{value}</span>
        {suffix && <span className="text-xs font-medium text-muted-foreground">{suffix}</span>}
      </div>
    </div>
  );
}
