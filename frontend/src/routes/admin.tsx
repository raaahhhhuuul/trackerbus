import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { BellRing, Bus, ChartColumnBig, UserRoundCog } from "lucide-react";
import { toast } from "sonner";

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
  type NotificationTargetRole,
  type OperationQueueItem,
} from "@/lib/admin-console";

export function AdminDashboard() {
  const navigate = useNavigate();
  const [pendingApprovals, setPendingApprovals] = useState<PendingLoginApproval[]>([]);
  const [buses, setBuses] = useState<AdminBus[]>([]);
  const [drivers, setDrivers] = useState<ApprovedDriver[]>([]);
  const [students, setStudents] = useState<import("@/lib/admin-console").ApprovedStudent[]>([]);
  const [operationQueue, setOperationQueue] = useState<OperationQueueItem[]>([]);
  const [activeTrips, setActiveTrips] = useState<ActiveTripAdminItem[]>([]);
  const [notifications, setNotifications] = useState<AdminNotification[]>([]);

  const [showBusList, setShowBusList] = useState(false);
  const [assigningBusId, setAssigningBusId] = useState<string | null>(null);
  const [assigningStudentId, setAssigningStudentId] = useState<string | null>(null);

  const [notificationTitle, setNotificationTitle] = useState("");
  const [notificationMessage, setNotificationMessage] = useState("");
  const [notificationTarget, setNotificationTarget] = useState<NotificationTargetRole>("all");
  const [sendingNotification, setSendingNotification] = useState(false);

  useEffect(() => {
    const session = getSession();
    if (!session) {
      navigate("/login", { replace: true });
      return;
    }
    if (session.role !== "admin") {
      navigate(getHomeRouteForRole(session.role), { replace: true });
    }
  }, [navigate]);

  const activeBusCount = useMemo(
    () => Math.max(activeTrips.length, buses.filter((bus) => bus.status === "active").length),
    [activeTrips.length, buses],
  );

  const loadAdminData = useCallback(async () => {
    try {
      console.log("ADMIN FETCH START");
      const [pending, busRows, driverRows, studentRows, queueRows, notificationRows, activeTripRows] = await Promise.all([
        getPendingApprovals(),
        getBuses(),
        getApprovedDrivers(),
        getApprovedStudents(),
        getOperationQueue(),
        getAdminNotifications(),
        getActiveTrips(),
      ]);

      setPendingApprovals(pending);
      setBuses(busRows);
      setDrivers(driverRows);
      setStudents(studentRows);
      setOperationQueue(queueRows);
      setNotifications(notificationRows);
      setActiveTrips(activeTripRows);
    } catch (error) {
      toast.error("Unable to load admin dashboard", {
        description: error instanceof Error ? error.message : "Please refresh and try again.",
      });
    }
  }, []);

  const refreshLiveSections = useCallback(async () => {
    try {
      const [busRows, studentRows, queueRows, notificationRows, activeTripRows] = await Promise.all([
        getBuses(),
        getApprovedStudents(),
        getOperationQueue(),
        getAdminNotifications(),
        getActiveTrips(),
      ]);

      setBuses(busRows);
      setStudents(studentRows);
      setOperationQueue(queueRows);
      setNotifications(notificationRows);
      setActiveTrips(activeTripRows);
    } catch {
      // Avoid toast spam during polling failures.
    }
  }, []);

  useEffect(() => {
    void loadAdminData();
  }, [loadAdminData]);

  useEffect(() => {
    if (buses.length !== 0) return;
    let isMounted = true;

    const seedIfNeeded = async () => {
      try {
        await seedDefaultBuses(48);
        const latestBuses = await getBuses();
        if (isMounted) setBuses(latestBuses);
      } catch {
        // Ignore: bus seeding requires admin write access.
      }
    };

    void seedIfNeeded();

    return () => {
      isMounted = false;
    };
  }, [buses.length]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      void refreshLiveSections();
    }, 5000);

    return () => window.clearInterval(timer);
  }, [refreshLiveSections]);

  const handleApprove = async (requestId: string, email: string) => {
    try {
      const approved = await approveUser(requestId);
      if (!approved) {
        toast.error("Approval failed", { description: "Request not found." });
        return;
      }

      setPendingApprovals((current) => current.filter((user) => user.requestId !== requestId));

      const latestDrivers = await getApprovedDrivers();
      setDrivers(latestDrivers);
      const latestStudents = await getApprovedStudents();
      setStudents(latestStudents);

      toast.success("Login approved", { description: `${email} can now sign in.` });
    } catch (error) {
      toast.error("Approval failed", {
        description: error instanceof Error ? error.message : "Please try again.",
      });
    }
  };

  const handleAssignDriver = async (busId: string, driverUserId: string | null) => {
    try {
      console.log("admin handleAssignDriver:", { busId, driverUserId });
      setAssigningBusId(busId);
      const result = await assignDriverToBus(busId, driverUserId);
      if (result && typeof result === "object" && "ok" in result && result.ok === false) {
        toast.error("Unable to assign driver", {
          description: "The bus assignment table is not available yet.",
        });
        return;
      }
      const latestBuses = await getBuses();
      setBuses(latestBuses);
      toast.success("Driver assignment updated");
    } catch (error) {
      toast.error("Unable to assign driver", {
        description: error instanceof Error ? error.message : "Please try again.",
      });
    } finally {
      setAssigningBusId(null);
    }
  };

  const handleAssignStudentBus = async (studentId: string, busId: string | null) => {
    try {
      setAssigningStudentId(studentId);
      const result = await assignStudentToBus(studentId, busId);
      if (!result.ok) {
        toast.error("Unable to assign bus to student", { description: result.error });
        return;
      }
      const latestStudents = await getApprovedStudents();
      setStudents(latestStudents);
      toast.success("Student bus assignment updated");
    } catch (error) {
      toast.error("Unable to assign bus to student", {
        description: error instanceof Error ? error.message : "Please try again.",
      });
    } finally {
      setAssigningStudentId(null);
    }
  };

  const handleSendNotification = async () => {
    try {
      setSendingNotification(true);
      const result = await sendAdminNotification({
        title: notificationTitle,
        message: notificationMessage,
        targetRole: notificationTarget,
      });

      if (result && typeof result === "object" && "ok" in result && result.ok === false) {
        toast.error("Unable to send notification", {
          description: "The notifications table is not available yet.",
        });
        return;
      }

      setNotificationTitle("");
      setNotificationMessage("");
      const latestNotifications = await getAdminNotifications();
      setNotifications(latestNotifications);

      toast.success("Notification sent");
    } catch (error) {
      toast.error("Unable to send notification", {
        description: error instanceof Error ? error.message : "Please try again.",
      });
    } finally {
      setSendingNotification(false);
    }
  };


  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-4 sm:px-5 sm:py-5">
      <header className="mb-4 rounded-2xl border border-border bg-card p-4 shadow-card sm:mb-5 sm:p-5">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Admin console
        </p>
        <h1 className="mt-1 font-display text-2xl font-bold tracking-tight sm:text-3xl">
          Transit Operations Overview
        </h1>
        <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground">
          Manage approvals, buses, assignments, operations, and notifications.
        </p>
      </header>

      <section className="grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => setShowBusList((current) => !current)}
          className="text-left"
        >
          <MetricCard
            icon={<Bus className="h-5 w-5" />}
            label="Active buses"
            value={`${activeBusCount}`}
            helper={showBusList ? "Hide all buses" : "Click to view all buses"}
          />
        </button>
        <MetricCard
          icon={<UserRoundCog className="h-5 w-5" />}
          label="Approved drivers"
          value={`${drivers.length}`}
          helper="Available for assignment"
        />
      </section>

      {showBusList && (
        <section className="mt-4 rounded-2xl border border-border bg-card p-4 shadow-card sm:p-5">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="font-display text-xl font-bold">All Available Buses</h2>
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {buses.length} total
            </span>
          </div>

          {buses.length === 0 ? (
            <div className="rounded-2xl border border-border bg-surface p-4 text-sm text-muted-foreground">
              No buses available yet.
            </div>
          ) : (
            <div className="space-y-2">
              {buses.map((bus) => (
                <div key={bus.id} className="rounded-xl border border-border bg-surface p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-foreground">{bus.busNumber}</p>
                      <p className="text-xs text-muted-foreground">
                        {bus.routeName} · {bus.plate}
                      </p>
                    </div>
                    <span className="rounded-full border border-border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      {bus.status}
                    </span>
                  </div>
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    Assigned driver: {bus.assignedDriverName ?? "Unassigned"}
                  </p>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      <section className="mt-4 rounded-2xl border border-border bg-card p-4 shadow-card sm:p-5">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="font-display text-xl font-bold">Pending Login Approvals</h2>
          <span className="rounded-full bg-warning/15 px-3 py-1 text-xs font-semibold text-warning">
            {pendingApprovals.length} pending
          </span>
        </div>

        {pendingApprovals.length === 0 ? (
          <div className="rounded-2xl border border-border bg-surface p-4 text-sm text-muted-foreground">
            No pending login requests at the moment.
          </div>
        ) : (
          <div className="space-y-3">
            {pendingApprovals.map((user) => (
              <div
                key={user.requestId}
                className="rounded-xl border border-border bg-surface p-3.5"
              >
                <div>
                  <p className="text-sm font-semibold text-foreground">{user.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {user.role.toUpperCase()} · {user.email}
                  </p>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Requested: {new Date(user.requestedAt).toLocaleString()}
                  </p>
                </div>
                <div className="mt-2.5">
                  <button
                    type="button"
                    onClick={() => {
                      void handleApprove(user.requestId, user.email);
                    }}
                    className="rounded-full bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
                  >
                    Approve Login
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <div className="mt-4 grid gap-4">
        <section className="rounded-2xl border border-border bg-card p-4 shadow-card sm:p-5">
          <div className="mb-3 flex items-center gap-2">
            <UserRoundCog className="h-5 w-5 text-primary" />
            <h2 className="font-display text-xl font-bold">Assign Driver</h2>
          </div>

          {buses.length === 0 ? (
            <p className="rounded-xl border border-border bg-surface p-3 text-sm text-muted-foreground">
              No buses available yet.
            </p>
          ) : drivers.length === 0 ? (
            <p className="rounded-xl border border-border bg-surface p-3 text-sm text-muted-foreground">
              No approved drivers available yet.
            </p>
          ) : (
            <div className="space-y-2.5">
              {buses.map((bus) => (
                <div key={bus.id} className="rounded-xl border border-border bg-surface p-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold">{bus.busNumber}</p>
                      <p className="text-xs text-muted-foreground">{bus.routeName}</p>
                    </div>
                    <span className="text-[11px] text-muted-foreground">{bus.plate}</span>
                  </div>

                  <select
                    className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm"
                    value={bus.assignedDriverId ?? ""}
                    onChange={(event) => {
                      const value = event.target.value.trim();
                      void handleAssignDriver(bus.id, value.length > 0 ? value : null);
                    }}
                    disabled={assigningBusId === bus.id}
                  >
                    <option value="">Unassigned</option>
                    {drivers.map((driver) => (
                      <option key={driver.id} value={driver.id}>
                        {driver.name}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-border bg-card p-4 shadow-card sm:p-5">
          <div className="mb-3 flex items-center gap-2">
            <UserRoundCog className="h-5 w-5 text-primary" />
            <h2 className="font-display text-xl font-bold">Assign Bus to Students</h2>
          </div>
          {students.length === 0 ? (
            <p className="rounded-xl border border-border bg-surface p-3 text-sm text-muted-foreground">
              No approved students yet.
            </p>
          ) : buses.length === 0 ? (
            <p className="rounded-xl border border-border bg-surface p-3 text-sm text-muted-foreground">
              No buses available to assign.
            </p>
          ) : (
            <div className="space-y-2">
              {(students as ApprovedStudent[]).map((student) => (
                <div key={student.id} className="rounded-xl border border-border bg-surface p-3">
                  <div className="mb-2">
                    <p className="text-sm font-semibold text-foreground">{student.name}</p>
                    <p className="text-xs text-muted-foreground">{student.email}</p>
                  </div>
                  <select
                    className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm"
                    value={student.assignedBusId ?? ""}
                    onChange={(event) => {
                      const value = event.target.value.trim();
                      void handleAssignStudentBus(student.id, value.length > 0 ? value : null);
                    }}
                    disabled={assigningStudentId === student.id}
                  >
                    <option value="">No bus assigned</option>
                    {buses.map((bus) => (
                      <option key={bus.id} value={bus.id}>
                        {bus.busNumber} — {bus.routeName}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-border bg-card p-4 shadow-card sm:p-5">
          <div className="mb-3 flex items-center gap-2">
            <Bus className="h-5 w-5 text-primary" />
            <h2 className="font-display text-xl font-bold">Active Trips</h2>
          </div>
          {activeTrips.length === 0 ? (
            <p className="rounded-xl border border-border bg-surface p-3 text-sm text-muted-foreground">
              No trips are active right now.
            </p>
          ) : (
            <div className="space-y-2.5">
              {activeTrips.map((trip) => (
                <div key={`${trip.driverUserId}-${trip.createdAt}`} className="rounded-xl border border-border bg-surface p-3.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-foreground">
                      {trip.busNumber ? `Bus ${trip.busNumber}` : "Assigned bus active"}
                    </p>
                    <span className="rounded-full border border-success/30 bg-success/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-success">
                      Active
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Driver {trip.driverName} · Started {new Date(trip.createdAt).toLocaleString()}
                  </p>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Distance {trip.distanceKm.toFixed(2)} km · Speed {trip.speedKmh.toFixed(0)} km/h
                  </p>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-border bg-card p-4 shadow-card sm:p-5">
          <div className="mb-3 flex items-center gap-2">
            <ChartColumnBig className="h-5 w-5 text-primary" />
            <h2 className="font-display text-xl font-bold">Operations Queue</h2>
          </div>
          {operationQueue.length === 0 ? (
            <p className="rounded-xl border border-border bg-surface p-3 text-sm text-muted-foreground">
              Waiting for live trip events. Driver trip start/end will appear here.
            </p>
          ) : (
            <div className="space-y-2.5">
              {operationQueue.map((eventItem) => (
                <div
                  key={eventItem.id}
                  className="rounded-xl border border-border bg-surface p-3.5"
                >
                  <p className="text-sm font-semibold">
                    {eventItem.eventType === "trip_started" ? "Trip started" : "Trip ended"}
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span>{eventItem.driverName}</span>
                    <span>•</span>
                    <span>{eventItem.busNumber ?? "No bus assigned"}</span>
                    <span>•</span>
                    <span>{new Date(eventItem.createdAt).toLocaleString()}</span>
                  </div>
                  <div className="mt-1 text-[11px] text-muted-foreground">
                    Distance {eventItem.distanceKm.toFixed(2)} km · Speed{" "}
                    {eventItem.speedKmh.toFixed(0)} km/h
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-border bg-card p-4 shadow-card sm:p-5">
          <div className="mb-3 flex items-center gap-2">
            <BellRing className="h-5 w-5 text-primary" />
            <h2 className="font-display text-xl font-bold">Notifications</h2>
          </div>

          <div className="rounded-xl border border-border bg-surface p-3">
            <div className="grid gap-2 sm:grid-cols-2">
              <input
                value={notificationTitle}
                onChange={(event) => setNotificationTitle(event.target.value)}
                className="rounded-lg border border-border bg-card px-3 py-2 text-sm"
                placeholder="Title"
              />
              <select
                value={notificationTarget}
                onChange={(event) =>
                  setNotificationTarget(event.target.value as NotificationTargetRole)
                }
                className="rounded-lg border border-border bg-card px-3 py-2 text-sm"
              >
                <option value="all">Students + Drivers</option>
                <option value="student">Students only</option>
                <option value="driver">Drivers only</option>
              </select>
            </div>
            <textarea
              value={notificationMessage}
              onChange={(event) => setNotificationMessage(event.target.value)}
              className="mt-2 min-h-20 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm"
              placeholder="Notification message"
            />
            <button
              type="button"
              onClick={() => {
                void handleSendNotification();
              }}
              disabled={sendingNotification}
              className="mt-2 rounded-full bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {sendingNotification ? "Sending..." : "Send Notification"}
            </button>
          </div>

          <div className="mt-3 space-y-2.5">
            {notifications.length === 0 ? (
              <p className="rounded-xl border border-border bg-surface p-3 text-sm text-muted-foreground">
                No notifications sent yet.
              </p>
            ) : (
              notifications.map((note) => (
                <div key={note.id} className="rounded-xl border border-border bg-surface p-3.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-foreground">{note.title}</p>
                    <span className="rounded-full border border-border px-2.5 py-1 text-[11px] uppercase tracking-wider text-muted-foreground">
                      {note.targetRole}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{note.message}</p>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {new Date(note.createdAt).toLocaleString()}
                  </p>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function MetricCard({
  icon,
  label,
  value,
  helper,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  helper: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-3.5 shadow-card transition-colors hover:border-primary/35">
      <div className="flex items-center gap-2 text-primary">
        {icon}
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
      </div>
      <p className="mt-1.5 font-display text-2xl font-bold">{value}</p>
      <p className="text-xs text-muted-foreground">{helper}</p>
    </div>
  );
}
