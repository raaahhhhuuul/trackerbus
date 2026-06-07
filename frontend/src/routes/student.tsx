import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertCircle, Bus, Check, ChevronDown, ChevronUp, Clock, Gauge,
  MapPin, Radio, RefreshCcw, Route as RouteIcon, Search, X,
} from "lucide-react";
import { getHomeRouteForRole, getSession } from "@/lib/auth";
import { GlobalChennaiMap } from "@/components/global-chennai-map";
import { getBuses, type AdminBus } from "@/lib/admin-console";
import { useLiveTracking } from "../hooks/use-live-tracking";
import { useRoleNotifications } from "../hooks/use-role-notifications";
import { useStudentLocation } from "../hooks/use-student-location";
import { useStudentBus } from "../hooks/use-student-bus";
import { clearStudentRoute, saveStudentRoute, type StudentRouteRecord } from "../lib/student-route";
import { getActiveTripSummary, getDriverTripStartLocation, type ActiveTripSummary } from "../lib/live-tracking";
import { haversineKm } from "@/lib/utils";

export function StudentDashboard() {
  const navigate = useNavigate();
  const [studentName, setStudentName] = useState("Student");
  const [sheetOpen, setSheetOpen] = useState(true);

  // Bus-browser state — all ephemeral (resets on re-login / page refresh)
  const [browserOpen, setBrowserOpen] = useState(false);
  const [allBuses, setAllBuses] = useState<AdminBus[]>([]);
  const [busesLoading, setBusesLoading] = useState(false);
  const [routeFilter, setRouteFilter] = useState("All");
  const [busSearch, setBusSearch] = useState("");
  const [overrideBusId, setOverrideBusId] = useState<string | null>(null);

  const { busInfo, loading: busLoading } = useStudentBus();

  // The "effective" bus: either the student's own or a temporary override
  const effectiveBusInfo = useMemo(() => {
    if (!overrideBusId) return busInfo;
    const found = allBuses.find((b) => b.id === overrideBusId);
    if (!found) return busInfo;
    return {
      busId: found.id,
      busNumber: found.busNumber,
      routeName: found.routeName,
      driverUserId: found.assignedDriverId,
    };
  }, [overrideBusId, allBuses, busInfo]);

  const isOnOverride = Boolean(overrideBusId && overrideBusId !== busInfo?.busId);

  const { tracking, loading } = useLiveTracking(effectiveBusInfo?.driverUserId);
  const { notifications } = useRoleNotifications("student");
  const { location: studentLocation, error: studentLocationError } = useStudentLocation({ watch: false });

  const sLat = studentLocation?.latitude;
  const sLng = studentLocation?.longitude;
  const [routeSummary, setRouteSummary] = useState<StudentRouteRecord | null>(null);
  const [driverStartLocation, setDriverStartLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [activeTripSummary, setActiveTripSummary] = useState<ActiveTripSummary | null>(null);
  const lastFetchRef = useRef<{
    timestamp: number; driverLat: number; driverLng: number;
    studentLat: number; studentLng: number;
  } | null>(null);

  useEffect(() => {
    const session = getSession();
    if (!session) { navigate("/login", { replace: true }); return; }
    if (session.role !== "student") navigate(getHomeRouteForRole(session.role), { replace: true });
  }, [navigate]);

  useEffect(() => {
    const session = getSession();
    if (session) {
      setStudentName(session.displayName || session.loginId || session.email.split("@")[0] || "Student");
    }
  }, []);

  // Load all buses once for the browser panel
  useEffect(() => {
    let mounted = true;
    setBusesLoading(true);
    getBuses()
      .then((buses) => { if (mounted) setAllBuses(buses); })
      .catch(() => {})
      .finally(() => { if (mounted) setBusesLoading(false); });
    return () => { mounted = false; };
  }, []);

  const isTrackingActive = tracking?.isActive ?? false;
  const isActive = isTrackingActive || Boolean(activeTripSummary);
  const activeBusNumber = activeTripSummary?.busNumber;
  const activeDriverName = activeTripSummary?.driverName;
  const activeStartedAt = tracking?.startedAt ?? activeTripSummary?.startedAt ?? null;

  const routeEtaText = useMemo(() => {
    if (!routeSummary) return null;
    return `${Math.max(1, Math.round(routeSummary.etaMinutes))} min`;
  }, [routeSummary]);

  const lastUpdated = tracking?.updatedAt ? formatRelativeTime(tracking.updatedAt) : null;

  useEffect(() => {
    let mounted = true;
    const sync = async () => {
      const next = await getActiveTripSummary();
      if (mounted) setActiveTripSummary(next);
    };
    void sync();
    const t = window.setInterval(() => void sync(), 5000);
    return () => { mounted = false; window.clearInterval(t); };
  }, []);

  useEffect(() => {
    const driverUserId = tracking?.driverUserId ?? activeTripSummary?.driverUserId;
    if (!isActive || !driverUserId) { setDriverStartLocation(null); return; }
    let mounted = true;
    const load = async () => {
      const remote = await getDriverTripStartLocation(driverUserId);
      if (!mounted) return;
      setDriverStartLocation(
        remote
          ? { lat: remote.latitude, lng: remote.longitude }
          : { lat: tracking?.latitude ?? 0, lng: tracking?.longitude ?? 0 },
      );
    };
    void load();
    return () => { mounted = false; };
  }, [
    activeTripSummary?.driverUserId, tracking?.driverUserId,
    tracking?.latitude, tracking?.longitude, isActive,
  ]);

  useEffect(() => {
    if (!tracking?.isActive || sLat === undefined || sLng === undefined) {
      setRouteSummary(null); clearStudentRoute(); return;
    }
    const prev = lastFetchRef.current;
    const now = Date.now();
    const moved = prev
      ? haversineKm(prev.driverLat, prev.driverLng, tracking.latitude, tracking.longitude) * 1000
      : Infinity;
    const movedStudent = prev
      ? haversineKm(prev.studentLat, prev.studentLng, sLat!, sLng!) * 1000
      : Infinity;
    if (prev && now - prev.timestamp < 5000 && moved < 8 && movedStudent < 8) return;

    lastFetchRef.current = {
      timestamp: now, driverLat: tracking.latitude, driverLng: tracking.longitude,
      studentLat: sLat!, studentLng: sLng!,
    };

    const controller = new AbortController();
    let mounted = true;

    const saveFallback = () => {
      const d = haversineKm(tracking.latitude, tracking.longitude, sLat!, sLng!);
      const speed = Math.max(tracking.speedKmh, 18);
      const dur = (d / speed) * 60;
      const fallback: StudentRouteRecord = {
        driverLatitude: tracking.latitude, driverLongitude: tracking.longitude,
        studentLatitude: sLat!, studentLongitude: sLng!,
        driverStartLatitude: driverStartLocation?.lat ?? null,
        driverStartLongitude: driverStartLocation?.lng ?? null,
        distanceKm: d, durationMin: dur,
        etaMinutes: Math.max(1, dur),
        path: [[tracking.latitude, tracking.longitude], [sLat!, sLng!]],
        updatedAt: new Date().toISOString(),
      };
      if (mounted) { setRouteSummary(fallback); saveStudentRoute(fallback); }
    };

    const fetch_ = async () => {
      try {
        const url = `https://router.project-osrm.org/route/v1/driving/` +
          `${tracking.longitude},${tracking.latitude};${sLng},${sLat}?overview=full&geometries=geojson`;
        const res = await fetch(url, { signal: controller.signal });
        if (!res.ok) { saveFallback(); return; }
        const data = await res.json() as {
          routes?: Array<{ distance: number; duration: number; geometry: { coordinates: Array<[number, number]> } }>;
        };
        const r = data.routes?.[0];
        if (!r) { saveFallback(); return; }
        const next: StudentRouteRecord = {
          driverLatitude: tracking.latitude, driverLongitude: tracking.longitude,
          studentLatitude: sLat!, studentLongitude: sLng!,
          driverStartLatitude: driverStartLocation?.lat ?? null,
          driverStartLongitude: driverStartLocation?.lng ?? null,
          distanceKm: r.distance / 1000, durationMin: r.duration / 60,
          etaMinutes: Math.max(1, r.duration / 60),
          path: r.geometry.coordinates.map(([lon, lat]) => [lat, lon]),
          updatedAt: new Date().toISOString(),
        };
        if (mounted) { setRouteSummary(next); saveStudentRoute(next); }
      } catch {
        if (!controller.signal.aborted) saveFallback();
      }
    };

    void fetch_();
    return () => { mounted = false; controller.abort(); };
  }, [
    tracking?.isActive, tracking?.latitude, tracking?.longitude, tracking?.speedKmh,
    sLat, sLng, driverStartLocation?.lat, driverStartLocation?.lng,
  ]);

  if (busLoading) {
    return (
      <div className="flex h-[calc(100vh-64px)] items-center justify-center">
        <div className="text-center space-y-3">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-primary border-t-transparent mx-auto" />
          <p className="text-sm font-semibold text-muted-foreground">Loading your bus...</p>
        </div>
      </div>
    );
  }

  if (!busInfo) {
    return (
      <div className="flex h-[calc(100vh-64px)] items-center justify-center p-4">
        <div className="w-full max-w-sm rounded-3xl border border-warning/30 bg-warning/5 p-8 text-center space-y-4">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-warning/10">
            <AlertCircle className="h-8 w-8 text-warning" />
          </div>
          <div>
            <h2 className="font-display text-xl font-bold">No Bus Assigned</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Hi {studentName}! Your account is approved but admin hasn't assigned you to a bus yet.
            </p>
          </div>
          <div className="rounded-xl border border-border bg-card/50 p-3 text-left">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Status</p>
            <div className="mt-1 flex items-center gap-2">
              <span className="h-2 w-2 rounded-full status-warning" />
              <span className="text-sm font-medium">Waiting for assignment</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Derived data for the browser panel
  const uniqueRoutes = useMemo(
    () => Array.from(new Set(allBuses.map((b) => b.routeName))).sort(),
    [allBuses],
  );
  const filteredBuses = useMemo(() => {
    let list = allBuses;
    if (routeFilter !== "All") list = list.filter((b) => b.routeName === routeFilter);
    if (busSearch.trim()) {
      const q = busSearch.trim().toLowerCase();
      list = list.filter(
        (b) => b.busNumber.toLowerCase().includes(q) || b.routeName.toLowerCase().includes(q),
      );
    }
    return list;
  }, [allBuses, routeFilter, busSearch]);

  /* ── Main layout: map fills screen, bottom sheet overlay ── */
  return (
    <div className="relative h-[calc(100vh-64px)] overflow-hidden">
      {/* Full-screen map — pass override so map tracks the selected bus's driver */}
      <GlobalChennaiMap
        driverUserIdOverride={isOnOverride ? (effectiveBusInfo?.driverUserId ?? null) : undefined}
      />

      {/* Top info bar */}
      <div className="pointer-events-none absolute left-0 right-0 top-0 z-[500] flex items-center justify-between gap-2 px-3 pt-3">
        <div className={`glass rounded-xl px-3 py-2 ${isOnOverride ? "ring-1 ring-accent/50" : ""}`}>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            {isOnOverride ? "Viewing" : "Your Bus"}
          </p>
          <p className={`font-display text-sm font-bold font-mono ${isOnOverride ? "text-accent" : ""}`}>
            {effectiveBusInfo?.busNumber ?? busInfo.busNumber}
          </p>
        </div>
        <div className="glass rounded-xl px-3 py-2 text-center">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Route</p>
          <p className="text-sm font-bold truncate max-w-[130px]">
            {effectiveBusInfo?.routeName ?? busInfo.routeName}
          </p>
        </div>
        {isActive ? (
          <div className="glass rounded-xl px-3 py-2">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Status</p>
            <div className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full status-online" />
              <p className="text-sm font-bold text-success">Live</p>
            </div>
          </div>
        ) : (
          <div className="glass rounded-xl px-3 py-2">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Status</p>
            <p className="text-sm font-bold text-muted-foreground">Idle</p>
          </div>
        )}
        {/* Browse bus button */}
        <button
          type="button"
          onClick={() => { setBrowserOpen(true); setSheetOpen(false); }}
          className="pointer-events-auto glass rounded-xl px-3 py-2 transition-all hover:ring-1 hover:ring-primary/40 active:scale-95"
          title="Browse all buses"
        >
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Switch</p>
          <div className="flex items-center gap-1 mt-0.5">
            <Bus className="h-3.5 w-3.5 text-primary" />
            <RefreshCcw className="h-3 w-3 text-muted-foreground" />
          </div>
        </button>
      </div>

      {/* Override banner — shown when viewing a non-default bus */}
      {isOnOverride && (
        <div className="pointer-events-auto absolute left-3 right-3 top-[70px] z-[500] flex items-center justify-between gap-2 rounded-xl border border-accent/30 bg-accent/10 px-3 py-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-accent" />
            <p className="text-xs font-semibold text-accent truncate">
              Temporary view · {effectiveBusInfo?.busNumber} · {effectiveBusInfo?.routeName}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setOverrideBusId(null)}
            className="flex-shrink-0 flex items-center gap-1 text-[10px] font-bold text-accent hover:text-foreground transition-colors"
          >
            <RefreshCcw className="h-3 w-3" />
            Reset
          </button>
        </div>
      )}

      {/* ─── Bus Browser Panel ─────────────────────────────────── */}

      {/* Backdrop — dims the map when browser is open */}
      {browserOpen && (
        <div
          className="absolute inset-0 z-[590] bg-black/60"
          onClick={() => setBrowserOpen(false)}
        />
      )}

      {/* Slide-up panel */}
      <div
        className={`absolute bottom-0 left-0 right-0 z-[600] transition-transform duration-300 ease-in-out ${
          browserOpen ? "translate-y-0" : "translate-y-full"
        }`}
        style={{ height: "82vh" }}
      >
        <div className="glass flex h-full flex-col rounded-t-3xl border-t border-border/50 overflow-hidden">
          {/* Drag handle */}
          <div className="flex flex-shrink-0 justify-center pb-2 pt-3">
            <div className="h-1 w-10 rounded-full bg-border" />
          </div>

          {/* Header */}
          <div className="flex flex-shrink-0 items-start justify-between px-4 pb-3">
            <div>
              <h3 className="font-display text-base font-bold">All Buses</h3>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {busesLoading ? "Loading…" : `${allBuses.length} buses · tap to switch`}
              </p>
            </div>
            <div className="flex items-center gap-3">
              {isOnOverride && (
                <button
                  type="button"
                  onClick={() => { setOverrideBusId(null); setBrowserOpen(false); }}
                  className="flex items-center gap-1.5 text-xs font-semibold text-accent hover:underline"
                >
                  <RefreshCcw className="h-3 w-3" />
                  Back to my bus
                </button>
              )}
              <button
                type="button"
                onClick={() => setBrowserOpen(false)}
                className="rounded-xl p-1.5 text-muted-foreground transition-colors hover:bg-surface/60 hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Search bar */}
          <div className="flex-shrink-0 px-4 pb-3">
            <div className="flex items-center gap-2 rounded-xl border border-border/60 bg-surface/60 px-3 py-2.5">
              <Search className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
              <input
                type="text"
                value={busSearch}
                onChange={(e) => setBusSearch(e.target.value)}
                placeholder="Search bus or route…"
                className="flex-1 bg-transparent text-sm placeholder:text-muted-foreground focus:outline-none"
              />
              {busSearch && (
                <button type="button" onClick={() => setBusSearch("")}>
                  <X className="h-3.5 w-3.5 text-muted-foreground" />
                </button>
              )}
            </div>
          </div>

          {/* Route filter tabs */}
          <div className="flex-shrink-0 px-4 pb-3">
            <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
              {["All", ...uniqueRoutes].map((route) => (
                <button
                  key={route}
                  type="button"
                  onClick={() => setRouteFilter(route)}
                  className={`flex-shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold transition-all ${
                    routeFilter === route
                      ? "bg-primary text-white shadow-glow"
                      : "bg-surface/60 text-muted-foreground hover:bg-surface"
                  }`}
                >
                  {route === "All" ? "All Routes" : route}
                </button>
              ))}
            </div>
          </div>

          {/* Bus list */}
          <div className="flex-1 overflow-y-auto px-4 pb-6 space-y-2">
            {busesLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="h-7 w-7 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              </div>
            ) : filteredBuses.length === 0 ? (
              <div className="py-12 text-center text-sm text-muted-foreground">
                No buses match your search.
              </div>
            ) : (
              filteredBuses.map((bus) => {
                const isOwnBus = bus.id === busInfo?.busId;
                const isCurrentlyViewing =
                  (overrideBusId === bus.id) || (!overrideBusId && isOwnBus);
                return (
                  <button
                    key={bus.id}
                    type="button"
                    onClick={() => {
                      setOverrideBusId(isOwnBus ? null : bus.id);
                      setBrowserOpen(false);
                      setSheetOpen(true);
                    }}
                    className={`w-full rounded-2xl border px-4 py-3 text-left transition-all active:scale-[0.98] ${
                      isCurrentlyViewing
                        ? "border-primary/50 bg-primary/10"
                        : "border-border/50 bg-card/60 hover:border-primary/25 hover:bg-primary/5"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono text-sm font-bold">{bus.busNumber}</span>
                          {isOwnBus && (
                            <span className="rounded-full bg-yellow-500/20 px-2 py-0.5 text-[10px] font-bold text-yellow-400">
                              My Bus
                            </span>
                          )}
                          {isCurrentlyViewing && !isOwnBus && (
                            <span className="rounded-full bg-primary/20 px-2 py-0.5 text-[10px] font-bold text-primary">
                              Viewing
                            </span>
                          )}
                        </div>
                        <p className="mt-0.5 truncate text-xs text-muted-foreground">
                          {bus.routeName}
                        </p>
                      </div>
                      <div className="flex flex-shrink-0 items-center gap-2">
                        {bus.assignedDriverId ? (
                          <span className="flex items-center gap-1 text-[11px] font-semibold text-success">
                            <span className="h-1.5 w-1.5 rounded-full bg-success" />
                            Driver
                          </span>
                        ) : (
                          <span className="text-[11px] text-muted-foreground">No driver</span>
                        )}
                        {isCurrentlyViewing && (
                          <Check className="h-4 w-4 flex-shrink-0 text-primary" />
                        )}
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* ─── Bottom sheet ──────────────────────────────────────── */}
      {/* Bottom sheet */}
      <div
        className={`absolute bottom-0 left-0 right-0 z-[500] transition-transform duration-300 ${
          sheetOpen && !browserOpen ? "translate-y-0" : "translate-y-[calc(100%-64px)]"
        }`}
      >
        <div className="glass border-t border-border/50 rounded-t-3xl overflow-hidden">
          {/* Sheet handle + toggle */}
          <button
            type="button"
            onClick={() => setSheetOpen((v) => !v)}
            className="flex w-full flex-col items-center gap-1 px-4 pb-2 pt-3"
          >
            <div className="h-1 w-10 rounded-full bg-border" />
            <div className="flex w-full items-center justify-between">
              <div className="flex items-center gap-2">
                {isActive && (
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-75" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
                  </span>
                )}
                <span className="font-display text-sm font-bold">
                  {isActive
                    ? isTrackingActive
                      ? `${tracking!.speedKmh.toFixed(0)} km/h · ${routeEtaText ? `ETA ${routeEtaText}` : "On route"}`
                      : "Trip active"
                    : "Waiting for trip"}
                </span>
              </div>
              {sheetOpen ? (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronUp className="h-4 w-4 text-muted-foreground" />
              )}
            </div>
          </button>

          {/* Sheet content */}
          <div className="px-4 pb-6 space-y-3">
            {/* Live stats */}
            {isTrackingActive && tracking ? (
              <div className="grid grid-cols-4 gap-2">
                <MiniStat icon={<Gauge className="h-3.5 w-3.5" />} label="Speed" value={`${tracking.speedKmh.toFixed(0)}`} unit="km/h" color="accent" />
                <MiniStat icon={<RouteIcon className="h-3.5 w-3.5" />} label="Dist" value={tracking.distanceKm.toFixed(1)} unit="km" color="primary" />
                <MiniStat icon={<MapPin className="h-3.5 w-3.5" />} label="ETA" value={routeEtaText ?? "—"} unit="" color="success" />
                <MiniStat icon={<Clock className="h-3.5 w-3.5" />} label="Updated" value={lastUpdated ?? "—"} unit="" color="muted" />
              </div>
            ) : isActive ? (
              <div className="flex items-center gap-2.5 rounded-xl border border-success/25 bg-success/8 px-3 py-2.5">
                <Radio className="h-4 w-4 text-success shrink-0" />
                <div>
                  <p className="text-xs font-semibold text-success">Trip Started</p>
                  <p className="text-[10px] text-muted-foreground">
                    {activeBusNumber ? `Bus ${activeBusNumber}` : "Assigned bus"} is en route.
                    {activeDriverName ? ` Driver: ${activeDriverName}.` : ""} Live GPS syncing...
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2.5 rounded-xl border border-border bg-muted/30 px-3 py-2.5">
                <Bus className="h-4 w-4 text-muted-foreground shrink-0" />
                <p className="text-xs text-muted-foreground">
                  {busInfo.driverUserId
                    ? "Driver assigned. Waiting for trip to start."
                    : "No driver assigned to your bus yet."}
                </p>
              </div>
            )}

            {/* Route info when active and location known */}
            {isTrackingActive && routeSummary && studentLocation ? (
              <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 space-y-1">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-primary">Route to You</p>
                <div className="flex gap-4 text-xs text-muted-foreground">
                  <span>{routeSummary.distanceKm.toFixed(2)} km remaining</span>
                  <span>ETA {routeEtaText}</span>
                </div>
              </div>
            ) : studentLocationError && isActive ? (
              <p className="text-[10px] text-warning text-center">
                Enable location for precise ETA.
              </p>
            ) : null}

            {/* Notifications */}
            {notifications.length > 0 && (
              <div className="space-y-2">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Notifications
                </p>
                {notifications.slice(0, 2).map((note) => (
                  <div key={note.id} className="rounded-xl border border-border/50 bg-card/60 p-2.5">
                    <p className="text-xs font-semibold">{note.title}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">{note.message}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function MiniStat({
  icon, label, value, unit, color,
}: {
  icon: React.ReactNode; label: string; value: string; unit: string;
  color: "accent" | "primary" | "success" | "muted";
}) {
  const colorMap = {
    accent:  "text-accent",
    primary: "text-primary",
    success: "text-success",
    muted:   "text-muted-foreground",
  };
  return (
    <div className="rounded-xl border border-border/50 bg-card/60 p-2.5 text-center">
      <div className={`flex justify-center ${colorMap[color]}`}>{icon}</div>
      <p className="mt-0.5 text-[8px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="font-display text-sm font-bold leading-none mt-0.5 tabular-nums">{value}</p>
      {unit && <p className="text-[9px] text-muted-foreground">{unit}</p>}
    </div>
  );
}

function formatRelativeTime(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 5) return "now";
  if (diff < 60) return `${diff}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  return `${Math.floor(diff / 3600)}h`;
}
