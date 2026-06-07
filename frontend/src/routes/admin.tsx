import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  Bell,
  BellRing,
  Bus,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Gauge,
  LayoutGrid,
  Loader2,
  MapPin,
  RefreshCw,
  Route,
  Send,
  Shield,
  UserCheck,
  UserCog,
  UserRound,
  Users,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { AdminFleetMap } from "@/components/admin-fleet-map";
import {
  approveUser,
  getHomeRouteForRole,
  getPendingApprovals,
  getSession,
  type PendingLoginApproval,
} from "@/lib/auth";
import {
  assignDriverToBus,
  assignStudentToBus,
  getActiveTrips,
  getAdminNotifications,
  getAllDriverPositions,
  getApprovedDrivers,
  getApprovedStudents,
  getBuses,
  getOperationQueue,
  seedDefaultBuses,
  sendAdminNotification,
  type ActiveTripAdminItem,
  type AdminBus,
  type AdminNotification,
  type ApprovedDriver,
  type ApprovedStudent,
  type DriverPosition,
  type NotificationTargetRole,
  type OperationQueueItem,
} from "@/lib/admin-console";

type Tab = "fleet" | "approvals" | "assign" | "broadcast" | "ops";

const TABS: { id: Tab; label: string; icon: ReactNode }[] = [
  { id: "fleet",     label: "Fleet",     icon: <Bus className="h-4 w-4" /> },
  { id: "approvals", label: "Approvals", icon: <UserCheck className="h-4 w-4" /> },
  { id: "assign",    label: "Assign",    icon: <UserCog className="h-4 w-4" /> },
  { id: "broadcast", label: "Broadcast", icon: <Bell className="h-4 w-4" /> },
  { id: "ops",       label: "Ops",       icon: <Zap className="h-4 w-4" /> },
];

export function AdminDashboard() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<Tab>("fleet");
  const [sidebarOpen, setSidebarOpen] = useState(true);

  /* ── Data state ──────────────────────────────────── */
  const [pendingApprovals, setPendingApprovals] = useState<PendingLoginApproval[]>([]);
  const [buses, setBuses] = useState<AdminBus[]>([]);
  const [drivers, setDrivers] = useState<ApprovedDriver[]>([]);
  const [students, setStudents] = useState<ApprovedStudent[]>([]);
  const [operationQueue, setOperationQueue] = useState<OperationQueueItem[]>([]);
  const [activeTrips, setActiveTrips] = useState<ActiveTripAdminItem[]>([]);
  const [notifications, setNotifications] = useState<AdminNotification[]>([]);
  const [driverPositions, setDriverPositions] = useState<Record<string, DriverPosition>>({});
  const [adminLocation, setAdminLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [selectedBusId, setSelectedBusId] = useState<string | null>(null);
  const [assigningBusId, setAssigningBusId] = useState<string | null>(null);
  const [assigningStudentId, setAssigningStudentId] = useState<string | null>(null);
  const [notificationTitle, setNotificationTitle] = useState("");
  const [notificationMessage, setNotificationMessage] = useState("");
  const [notificationTarget, setNotificationTarget] = useState<NotificationTargetRole>("all");
  const [sendingNotification, setSendingNotification] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const locationWatchRef = useRef<number | null>(null);

  /* ── Auth guard ─────────────────────────────────── */
  useEffect(() => {
    const session = getSession();
    if (!session) { navigate("/login", { replace: true }); return; }
    if (session.role !== "admin") navigate(getHomeRouteForRole(session.role), { replace: true });
  }, [navigate]);

  /* ── Request admin geolocation ──────────────────── */
  useEffect(() => {
    if (!navigator.geolocation) return;
    locationWatchRef.current = navigator.geolocation.watchPosition(
      (pos) => setAdminLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => undefined,
      { enableHighAccuracy: true, maximumAge: 5000 },
    );
    return () => {
      if (locationWatchRef.current !== null) {
        navigator.geolocation.clearWatch(locationWatchRef.current);
      }
    };
  }, []);

  /* ── Derived ────────────────────────────────────── */
  const activeBusCount = useMemo(
    () => Math.max(activeTrips.length, buses.filter((b) => b.status === "active").length),
    [activeTrips.length, buses],
  );
  const activeLiveCount = useMemo(
    () => Object.values(driverPositions).filter((p) => p.isActive).length,
    [driverPositions],
  );
  const selectedBus = useMemo(
    () => buses.find((b) => b.id === selectedBusId) ?? null,
    [buses, selectedBusId],
  );

  /* ── Load ───────────────────────────────────────── */
  const loadAdminData = useCallback(async () => {
    try {
      const [
        pending, busRows, driverRows, studentRows,
        queueRows, notificationRows, activeTripRows, positions,
      ] = await Promise.all([
        getPendingApprovals(),
        getBuses(),
        getApprovedDrivers(),
        getApprovedStudents(),
        getOperationQueue(),
        getAdminNotifications(),
        getActiveTrips(),
        getAllDriverPositions(),
      ]);
      setPendingApprovals(pending);
      setBuses(busRows);
      setDrivers(driverRows);
      setStudents(studentRows);
      setOperationQueue(queueRows);
      setNotifications(notificationRows);
      setActiveTrips(activeTripRows);
      setDriverPositions(positions);
    } catch (error) {
      toast.error("Failed to load dashboard", {
        description: error instanceof Error ? error.message : "Please refresh.",
      });
    }
  }, []);

  const refreshLive = useCallback(async (showIndicator = false) => {
    if (showIndicator) setIsRefreshing(true);
    try {
      const [busRows, queueRows, activeTripRows, positions] = await Promise.all([
        getBuses(), getOperationQueue(), getActiveTrips(), getAllDriverPositions(),
      ]);
      setBuses(busRows);
      setOperationQueue(queueRows);
      setActiveTrips(activeTripRows);
      setDriverPositions(positions);
    } catch { /* silent */ } finally {
      if (showIndicator) setIsRefreshing(false);
    }
  }, []);

  useEffect(() => { void loadAdminData(); }, [loadAdminData]);

  useEffect(() => {
    if (buses.length !== 0) return;
    let mounted = true;
    const seed = async () => {
      try {
        await seedDefaultBuses(48);
        const latest = await getBuses();
        if (mounted) setBuses(latest);
      } catch { /* no write access */ }
    };
    void seed();
    return () => { mounted = false; };
  }, [buses.length]);

  useEffect(() => {
    const t = window.setInterval(() => void refreshLive(), 5000);
    return () => window.clearInterval(t);
  }, [refreshLive]);

  /* ── Handlers ───────────────────────────────────── */
  const handleApprove = async (requestId: string, email: string) => {
    try {
      const ok = await approveUser(requestId);
      if (!ok) { toast.error("Approval failed"); return; }
      setPendingApprovals((cur) => cur.filter((u) => u.requestId !== requestId));
      const [latestDrivers, latestStudents] = await Promise.all([
        getApprovedDrivers(), getApprovedStudents(),
      ]);
      setDrivers(latestDrivers);
      setStudents(latestStudents);
      toast.success("Approved", { description: `${email} can now sign in.` });
    } catch (e) {
      toast.error("Approval failed", { description: e instanceof Error ? e.message : "Try again." });
    }
  };

  const handleAssignDriver = async (busId: string, driverUserId: string | null) => {
    try {
      setAssigningBusId(busId);
      const result = await assignDriverToBus(busId, driverUserId);
      if (result && "ok" in result && result.ok === false) {
        toast.error("Assignment failed"); return;
      }
      const latest = await getBuses();
      setBuses(latest);
      toast.success("Driver assigned");
    } catch (e) {
      toast.error("Assignment failed", { description: e instanceof Error ? e.message : "" });
    } finally { setAssigningBusId(null); }
  };

  const handleAssignStudentBus = async (studentId: string, busId: string | null) => {
    try {
      setAssigningStudentId(studentId);
      const result = await assignStudentToBus(studentId, busId);
      if (!result.ok) { toast.error("Failed", { description: result.error }); return; }
      const latest = await getApprovedStudents();
      setStudents(latest);
      toast.success("Student bus updated");
    } catch (e) {
      toast.error("Failed", { description: e instanceof Error ? e.message : "" });
    } finally { setAssigningStudentId(null); }
  };

  const handleSendNotification = async () => {
    try {
      setSendingNotification(true);
      await sendAdminNotification({
        title: notificationTitle,
        message: notificationMessage,
        targetRole: notificationTarget,
      });
      setNotificationTitle("");
      setNotificationMessage("");
      const latest = await getAdminNotifications();
      setNotifications(latest);
      toast.success("Notification sent");
    } catch (e) {
      toast.error("Send failed", { description: e instanceof Error ? e.message : "" });
    } finally { setSendingNotification(false); }
  };

  /* ── Render ─────────────────────────────────────── */
  return (
    <div className="flex h-[calc(100vh-64px)] overflow-hidden bg-background">
      {/* Sidebar */}
      <aside
        className={`relative flex flex-col border-r border-border/50 bg-surface/80 backdrop-blur-xl transition-all duration-300 ${
          sidebarOpen ? "w-[320px] min-w-[320px]" : "w-0 min-w-0 overflow-hidden"
        }`}
      >
        {/* Header */}
        <div className="flex-shrink-0 border-b border-border/40 p-4">
          <div className="flex items-center gap-2 mb-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl gradient-primary shadow-glow flex-shrink-0">
              <Shield className="h-4 w-4 text-white" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Command Center
              </p>
              <p className="font-display text-sm font-bold truncate">Transit Operations</p>
            </div>
            <button
              onClick={() => void refreshLive(true)}
              className="ml-auto flex h-7 w-7 items-center justify-center rounded-lg hover:bg-secondary transition-colors flex-shrink-0"
              title="Refresh"
            >
              <RefreshCw className={`h-3.5 w-3.5 text-muted-foreground ${isRefreshing ? "animate-spin" : ""}`} />
            </button>
          </div>

          {/* Stats pills */}
          <div className="grid grid-cols-2 gap-2">
            <StatPill
              icon={<Bus className="h-3.5 w-3.5" />}
              label="Fleet"
              value={`${buses.length}`}
              color="primary"
            />
            <StatPill
              icon={<Zap className="h-3.5 w-3.5" />}
              label="Live"
              value={`${activeLiveCount}`}
              color="accent"
              pulse={activeLiveCount > 0}
            />
            <StatPill
              icon={<Users className="h-3.5 w-3.5" />}
              label="Drivers"
              value={`${drivers.length}`}
              color="success"
            />
            <StatPill
              icon={<AlertTriangle className="h-3.5 w-3.5" />}
              label="Pending"
              value={`${pendingApprovals.length}`}
              color={pendingApprovals.length > 0 ? "warning" : "muted"}
            />
          </div>
        </div>

        {/* Tabs nav */}
        <div className="flex-shrink-0 border-b border-border/40 px-3 pt-2 pb-0">
          <div className="flex gap-0.5">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex flex-1 flex-col items-center gap-1 rounded-t-lg px-1 py-2 text-[10px] font-semibold uppercase tracking-wider transition-colors ${
                  activeTab === tab.id
                    ? "bg-card text-primary border border-b-transparent border-border/40"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {tab.icon}
                <span className="hidden sm:block">{tab.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Tab content */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {activeTab === "fleet" && (
            <FleetTab
              buses={buses}
              driverPositions={driverPositions}
              activeTrips={activeTrips}
              selectedBusId={selectedBusId}
              onSelectBus={setSelectedBusId}
            />
          )}
          {activeTab === "approvals" && (
            <ApprovalsTab
              pendingApprovals={pendingApprovals}
              onApprove={handleApprove}
            />
          )}
          {activeTab === "assign" && (
            <AssignTab
              buses={buses}
              drivers={drivers}
              students={students}
              assigningBusId={assigningBusId}
              assigningStudentId={assigningStudentId}
              onAssignDriver={handleAssignDriver}
              onAssignStudentBus={handleAssignStudentBus}
            />
          )}
          {activeTab === "broadcast" && (
            <BroadcastTab
              notifications={notifications}
              notificationTitle={notificationTitle}
              notificationMessage={notificationMessage}
              notificationTarget={notificationTarget}
              sendingNotification={sendingNotification}
              onTitleChange={setNotificationTitle}
              onMessageChange={setNotificationMessage}
              onTargetChange={setNotificationTarget}
              onSend={handleSendNotification}
            />
          )}
          {activeTab === "ops" && (
            <OpsTab operationQueue={operationQueue} activeTrips={activeTrips} />
          )}
        </div>
      </aside>

      {/* Collapse toggle */}
      <button
        onClick={() => setSidebarOpen((v) => !v)}
        className="absolute left-0 top-1/2 z-[600] -translate-y-1/2 translate-x-0 flex h-8 w-5 items-center justify-center rounded-r-lg bg-card border border-l-0 border-border/60 text-muted-foreground hover:text-foreground transition-all"
        style={{ left: sidebarOpen ? "320px" : "0px" }}
        title={sidebarOpen ? "Collapse" : "Expand"}
      >
        {sidebarOpen ? <ChevronLeft className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
      </button>

      {/* Map area */}
      <div className="relative flex-1 overflow-hidden">
        <AdminFleetMap
          buses={buses}
          driverPositions={driverPositions}
          adminLocation={adminLocation}
          selectedBusId={selectedBusId}
          onBusClick={(id) => {
            setSelectedBusId((cur) => (cur === id ? null : id));
            setActiveTab("fleet");
            setSidebarOpen(true);
          }}
          className="h-full w-full"
        />

        {/* Selected bus info card */}
        {selectedBus && (
          <div className="absolute bottom-4 left-1/2 z-[500] -translate-x-1/2 w-[90%] max-w-sm slide-up">
            <div className="glass rounded-2xl border border-primary/30 p-4 shadow-glow">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-display text-lg font-bold">{selectedBus.busNumber}</p>
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <Route className="h-3 w-3" /> {selectedBus.routeName}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  {selectedBus.assignedDriverId && driverPositions[selectedBus.assignedDriverId]?.isActive ? (
                    <span className="flex items-center gap-1.5 rounded-full bg-accent/15 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-accent">
                      <span className="inline-block h-1.5 w-1.5 rounded-full status-online" />
                      Live
                    </span>
                  ) : (
                    <span className="rounded-full border border-border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Idle
                    </span>
                  )}
                  <button
                    onClick={() => setSelectedBusId(null)}
                    className="text-[10px] text-muted-foreground hover:text-foreground"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                <div className="rounded-xl bg-background/60 p-2">
                  <p className="text-[10px] text-muted-foreground">Plate</p>
                  <p className="text-xs font-bold font-mono">{selectedBus.plate}</p>
                </div>
                <div className="rounded-xl bg-background/60 p-2">
                  <p className="text-[10px] text-muted-foreground">Driver</p>
                  <p className="text-xs font-bold truncate">{selectedBus.assignedDriverName ?? "—"}</p>
                </div>
                <div className="rounded-xl bg-background/60 p-2">
                  <p className="text-[10px] text-muted-foreground">Speed</p>
                  <p className="text-xs font-bold">
                    {selectedBus.assignedDriverId && driverPositions[selectedBus.assignedDriverId]
                      ? `${driverPositions[selectedBus.assignedDriverId].speedKmh.toFixed(0)} km/h`
                      : "—"}
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Stat Pill ────────────────────────────────────── */
function StatPill({
  icon, label, value, color, pulse = false,
}: {
  icon: ReactNode; label: string; value: string;
  color: "primary" | "accent" | "success" | "warning" | "muted"; pulse?: boolean;
}) {
  const colorMap = {
    primary: "text-primary bg-primary/10 border-primary/20",
    accent:  "text-accent  bg-accent/10  border-accent/20",
    success: "text-success bg-success/10 border-success/20",
    warning: "text-warning bg-warning/10 border-warning/20",
    muted:   "text-muted-foreground bg-muted/50 border-border",
  };
  return (
    <div className={`flex items-center gap-2 rounded-xl border px-2.5 py-2 ${colorMap[color]}`}>
      <span className={pulse ? "ping-slow" : ""}>{icon}</span>
      <div className="min-w-0">
        <p className="text-[9px] font-semibold uppercase tracking-wider opacity-70">{label}</p>
        <p className="font-display text-sm font-bold leading-none">{value}</p>
      </div>
    </div>
  );
}

/* ── Fleet Tab ─────────────────────────────────────── */
function FleetTab({
  buses, driverPositions, activeTrips, selectedBusId, onSelectBus,
}: {
  buses: AdminBus[];
  driverPositions: Record<string, DriverPosition>;
  activeTrips: ActiveTripAdminItem[];
  selectedBusId: string | null;
  onSelectBus: (id: string) => void;
}) {
  const activeBusNumbers = useMemo(
    () => new Set(activeTrips.map((t) => t.busNumber).filter(Boolean) as string[]),
    [activeTrips],
  );

  return (
    <>
      {buses.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-4 text-center text-sm text-muted-foreground">
          Loading fleet...
        </div>
      ) : (
        buses.map((bus) => {
          const livPos = bus.assignedDriverId ? driverPositions[bus.assignedDriverId] : null;
          const isLive = Boolean(livPos?.isActive);
          const isActive = isLive || activeBusNumbers.has(bus.busNumber);
          const isSelected = bus.id === selectedBusId;

          return (
            <button
              key={bus.id}
              type="button"
              onClick={() => onSelectBus(bus.id)}
              className={`w-full rounded-xl border p-3 text-left transition-all ${
                isSelected
                  ? "border-primary/50 bg-primary/10 shadow-glow"
                  : isLive
                  ? "border-accent/30 bg-accent/5 hover:border-accent/50"
                  : "border-border/40 bg-card/60 hover:border-border"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-bold truncate">{bus.busNumber}</p>
                  <p className="text-[10px] text-muted-foreground truncate">{bus.routeName}</p>
                </div>
                <div className="flex flex-col items-end gap-1 flex-shrink-0">
                  {isLive ? (
                    <span className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider text-accent">
                      <span className="h-1.5 w-1.5 rounded-full status-online" />
                      {livPos!.speedKmh.toFixed(0)} km/h
                    </span>
                  ) : isActive ? (
                    <span className="text-[9px] font-bold uppercase tracking-wider text-success">Active</span>
                  ) : (
                    <span className="text-[9px] text-muted-foreground">Idle</span>
                  )}
                  {bus.assignedDriverName && (
                    <span className="text-[9px] text-muted-foreground truncate max-w-[80px]">
                      {bus.assignedDriverName}
                    </span>
                  )}
                </div>
              </div>
            </button>
          );
        })
      )}
    </>
  );
}

/* ── Approvals Tab ─────────────────────────────────── */
function ApprovalsTab({
  pendingApprovals, onApprove,
}: {
  pendingApprovals: PendingLoginApproval[];
  onApprove: (id: string, email: string) => void;
}) {
  if (pendingApprovals.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-xl border border-border bg-card p-6 text-center">
        <CheckCircle2 className="h-8 w-8 text-success" />
        <p className="text-sm font-semibold">All caught up</p>
        <p className="text-xs text-muted-foreground">No pending requests</p>
      </div>
    );
  }

  return (
    <>
      {pendingApprovals.map((user) => (
        <div key={user.requestId} className="rounded-xl border border-warning/25 bg-warning/5 p-3">
          <div className="flex items-start gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-warning/15 flex-shrink-0">
              <UserRound className="h-4 w-4 text-warning" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold truncate">{user.name}</p>
              <p className="text-[10px] text-muted-foreground truncate">{user.email}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                {user.role.toUpperCase()} · {new Date(user.requestedAt).toLocaleDateString()}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onApprove(user.requestId, user.email)}
            className="mt-2.5 flex w-full items-center justify-center gap-1.5 rounded-lg bg-success/15 border border-success/25 py-2 text-xs font-bold text-success hover:bg-success/25 transition-colors"
          >
            <CheckCircle2 className="h-3.5 w-3.5" /> Approve Login
          </button>
        </div>
      ))}
    </>
  );
}

/* ── Assign Tab ─────────────────────────────────────── */
function AssignTab({
  buses, drivers, students, assigningBusId, assigningStudentId,
  onAssignDriver, onAssignStudentBus,
}: {
  buses: AdminBus[]; drivers: ApprovedDriver[]; students: ApprovedStudent[];
  assigningBusId: string | null; assigningStudentId: string | null;
  onAssignDriver: (busId: string, driverId: string | null) => void;
  onAssignStudentBus: (studentId: string, busId: string | null) => void;
}) {
  const [view, setView] = useState<"drivers" | "students">("drivers");

  return (
    <>
      <div className="flex gap-1 rounded-xl bg-muted p-1">
        <button
          onClick={() => setView("drivers")}
          className={`flex-1 rounded-lg py-1.5 text-xs font-semibold transition-colors ${
            view === "drivers" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"
          }`}
        >
          Drivers
        </button>
        <button
          onClick={() => setView("students")}
          className={`flex-1 rounded-lg py-1.5 text-xs font-semibold transition-colors ${
            view === "students" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"
          }`}
        >
          Students
        </button>
      </div>

      {view === "drivers" ? (
        buses.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-4">No buses yet.</p>
        ) : drivers.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-4">No approved drivers yet.</p>
        ) : (
          buses.map((bus) => (
            <div key={bus.id} className="rounded-xl border border-border/50 bg-card/60 p-3">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <p className="text-xs font-bold">{bus.busNumber}</p>
                  <p className="text-[10px] text-muted-foreground">{bus.routeName}</p>
                </div>
                {assigningBusId === bus.id && <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />}
              </div>
              <select
                className="w-full rounded-lg border border-border/60 bg-background/60 px-2.5 py-1.5 text-xs focus:outline-none focus:border-primary"
                value={bus.assignedDriverId ?? ""}
                onChange={(e) => {
                  const v = e.target.value;
                  onAssignDriver(bus.id, v.length > 0 ? v : null);
                }}
                disabled={assigningBusId === bus.id}
              >
                <option value="">Unassigned</option>
                {drivers.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </div>
          ))
        )
      ) : (
        students.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-4">No approved students yet.</p>
        ) : (
          students.map((student) => (
            <div key={student.id} className="rounded-xl border border-border/50 bg-card/60 p-3">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <p className="text-xs font-bold truncate">{student.name}</p>
                  <p className="text-[10px] text-muted-foreground truncate">{student.email}</p>
                </div>
                {assigningStudentId === student.id && (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                )}
              </div>
              <select
                className="w-full rounded-lg border border-border/60 bg-background/60 px-2.5 py-1.5 text-xs focus:outline-none focus:border-primary"
                value={student.assignedBusId ?? ""}
                onChange={(e) => {
                  const v = e.target.value;
                  onAssignStudentBus(student.id, v.length > 0 ? v : null);
                }}
                disabled={assigningStudentId === student.id}
              >
                <option value="">No bus</option>
                {buses.map((b) => (
                  <option key={b.id} value={b.id}>{b.busNumber} — {b.routeName}</option>
                ))}
              </select>
            </div>
          ))
        )
      )}
    </>
  );
}

/* ── Broadcast Tab ──────────────────────────────────── */
function BroadcastTab({
  notifications, notificationTitle, notificationMessage, notificationTarget,
  sendingNotification, onTitleChange, onMessageChange, onTargetChange, onSend,
}: {
  notifications: AdminNotification[];
  notificationTitle: string; notificationMessage: string;
  notificationTarget: NotificationTargetRole; sendingNotification: boolean;
  onTitleChange: (v: string) => void; onMessageChange: (v: string) => void;
  onTargetChange: (v: NotificationTargetRole) => void; onSend: () => void;
}) {
  return (
    <>
      <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 space-y-2.5">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-primary">Compose</p>
        <input
          value={notificationTitle}
          onChange={(e) => onTitleChange(e.target.value)}
          className="w-full rounded-lg border border-border/60 bg-background/60 px-3 py-2 text-xs focus:outline-none focus:border-primary"
          placeholder="Title..."
        />
        <select
          value={notificationTarget}
          onChange={(e) => onTargetChange(e.target.value as NotificationTargetRole)}
          className="w-full rounded-lg border border-border/60 bg-background/60 px-3 py-2 text-xs focus:outline-none focus:border-primary"
        >
          <option value="all">All users</option>
          <option value="student">Students only</option>
          <option value="driver">Drivers only</option>
        </select>
        <textarea
          value={notificationMessage}
          onChange={(e) => onMessageChange(e.target.value)}
          className="w-full rounded-lg border border-border/60 bg-background/60 px-3 py-2 text-xs resize-none focus:outline-none focus:border-primary min-h-[72px]"
          placeholder="Message..."
        />
        <button
          type="button"
          onClick={onSend}
          disabled={sendingNotification || !notificationTitle || !notificationMessage}
          className="flex w-full items-center justify-center gap-1.5 rounded-lg gradient-primary py-2.5 text-xs font-bold text-white shadow-glow disabled:opacity-50 transition-opacity"
        >
          {sendingNotification ? (
            <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Sending...</>
          ) : (
            <><Send className="h-3.5 w-3.5" /> Send Broadcast</>
          )}
        </button>
      </div>

      {notifications.length > 0 && (
        <div className="space-y-2">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground px-1">
            Recent
          </p>
          {notifications.slice(0, 8).map((note) => (
            <div key={note.id} className="rounded-xl border border-border/40 bg-card/60 p-3">
              <div className="flex items-start justify-between gap-2">
                <p className="text-xs font-semibold truncate">{note.title}</p>
                <span className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground border border-border rounded-full px-1.5 py-0.5 flex-shrink-0">
                  {note.targetRole}
                </span>
              </div>
              <p className="mt-1 text-[10px] text-muted-foreground line-clamp-2">{note.message}</p>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

/* ── Ops Tab ─────────────────────────────────────────── */
function OpsTab({
  operationQueue, activeTrips,
}: {
  operationQueue: OperationQueueItem[];
  activeTrips: ActiveTripAdminItem[];
}) {
  return (
    <>
      {activeTrips.length > 0 && (
        <div className="space-y-2">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground px-1">
            Active Trips ({activeTrips.length})
          </p>
          {activeTrips.map((trip) => (
            <div
              key={`${trip.driverUserId}-${trip.createdAt}`}
              className="rounded-xl border border-success/25 bg-success/5 p-3"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-bold">
                  {trip.busNumber ? `Bus ${trip.busNumber}` : "Active bus"}
                </p>
                <span className="h-1.5 w-1.5 rounded-full status-online" />
              </div>
              <p className="text-[10px] text-muted-foreground mt-0.5">{trip.driverName}</p>
              <div className="mt-1.5 flex gap-2 text-[10px] text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Gauge className="h-3 w-3" /> {trip.speedKmh.toFixed(0)} km/h
                </span>
                <span className="flex items-center gap-1">
                  <Route className="h-3 w-3" /> {trip.distanceKm.toFixed(1)} km
                </span>
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" /> {new Date(trip.createdAt).toLocaleTimeString()}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="space-y-2">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground px-1">
          Event Log
        </p>
        {operationQueue.length === 0 ? (
          <div className="rounded-xl border border-border bg-card p-4 text-center">
            <MapPin className="h-6 w-6 text-muted-foreground mx-auto mb-2" />
            <p className="text-xs text-muted-foreground">No events yet</p>
          </div>
        ) : (
          operationQueue.map((ev) => (
            <div key={ev.id} className="rounded-xl border border-border/40 bg-card/60 p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span
                    className={`h-2 w-2 rounded-full flex-shrink-0 ${
                      ev.eventType === "trip_started" ? "status-online" : "status-offline"
                    }`}
                  />
                  <p className="text-xs font-semibold">
                    {ev.eventType === "trip_started" ? "Trip started" : "Trip ended"}
                  </p>
                </div>
                <span className="text-[9px] text-muted-foreground">
                  {new Date(ev.createdAt).toLocaleTimeString()}
                </span>
              </div>
              <p className="mt-0.5 text-[10px] text-muted-foreground">
                {ev.driverName} · {ev.busNumber ?? "No bus"} · {ev.distanceKm.toFixed(1)} km
              </p>
            </div>
          ))
        )}
      </div>
    </>
  );
}
