import { supabase } from "@/lib/supabase";
import { isMissingSupabaseTableError } from "@/lib/supabase-errors";
import { getLocalApprovedDriverAccounts } from "@/lib/auth";
import { apiUrl } from "@/lib/api";

export type BusStatus = "active" | "inactive" | "maintenance";
export type OperationEventType = "trip_started" | "trip_ended";
export type NotificationTargetRole = "all" | "student" | "driver";

export interface AdminBus {
  id: string;
  busNumber: string;
  routeName: string;
  plate: string;
  status: BusStatus;
  assignedDriverId: string | null;
  assignedDriverName: string | null;
  assignedDriverLoginId: string | null;
  updatedAt: string;
}

export interface ApprovedDriver {
  id: string;
  name: string;
  email: string;
  createdAt: string;
}

export interface ApprovedStudent {
  id: string;
  name: string;
  email: string;
  assignedBusId: string | null;
  createdAt: string;
}

export interface OperationQueueItem {
  id: string;
  eventType: OperationEventType;
  driverUserId: string;
  driverName: string;
  busId: string | null;
  busNumber: string | null;
  distanceKm: number;
  speedKmh: number;
  createdAt: string;
}

export interface AdminNotification {
  id: string;
  title: string;
  message: string;
  targetRole: NotificationTargetRole;
  createdAt: string;
}

export interface ActiveTripAdminItem {
  driverUserId: string;
  driverName: string;
  busNumber: string | null;
  distanceKm: number;
  speedKmh: number;
  createdAt: string;
}

export interface PendingLoginApproval {
  requestId: string;
  requestedAt: string;
  userId: string;
  role: "student" | "driver";
  name: string;
  email: string;
}

export async function getPendingApprovals(): Promise<PendingLoginApproval[]> {
  const { data, error } = await supabase
    .from("registrations")
    .select("id, user_id, name, email, role, requested_at")
    .eq("status", "pending")
    .order("requested_at", { ascending: false });

  if (error) {
    if (isMissingSupabaseTableError(error)) return [];
    throw new Error(error.message);
  }

  return (data ?? []).map((item: any) => ({
    requestId: item.id as string,
    requestedAt: item.requested_at as string,
    userId: item.user_id as string,
    role: item.role as "student" | "driver",
    name: String(item.name ?? "Unknown"),
    email: String(item.email ?? "N/A"),
  }));
}

export async function approveRequest(requestId: string): Promise<boolean> {
  const response = await fetch(apiUrl("/api/approve"), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id: requestId }),
  });

  const payload = (await response.json()) as { success: boolean; error?: string };
  if (!response.ok || !payload.success) {
    throw new Error(payload.error ?? "Approval failed");
  }

  return true;
}

interface BusRow {
  id: string;
  bus_number: string;
  route_name: string;
  plate: string;
  status: BusStatus;
  assigned_driver_id: string | null;
  updated_at: string;
}

interface DriverRow {
  id: string;
  name: string;
  email: string;
  created_at: string;
}

interface StudentRow {
  id: string;
  name: string;
  email: string;
  assigned_bus_id: string | null;
  created_at: string;
}

interface OperationEventRow {
  id: string;
  event_type: OperationEventType;
  driver_user_id: string;
  driver_name: string;
  bus_id: string | null;
  bus_number: string | null;
  distance_km: number;
  speed_kmh: number;
  created_at: string;
}

interface NotificationRow {
  id: string;
  title: string;
  message: string;
  target_role: NotificationTargetRole;
  created_at: string;
}

const LOCAL_BUSES_KEY = "transporter.admin.buses.v1";
const LOCAL_NOTIFICATIONS_KEY = "transporter.admin.notifications.v1";

function isBrowser() {
  return typeof window !== "undefined";
}

function readLocalJson<T>(key: string, fallback: T): T {
  if (!isBrowser()) return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeLocalJson<T>(key: string, value: T) {
  if (!isBrowser()) return;
  window.localStorage.setItem(key, JSON.stringify(value));
}

function toAdminNotification(row: NotificationRow): AdminNotification {
  return {
    id: row.id,
    title: row.title,
    message: row.message,
    targetRole: row.target_role,
    createdAt: row.created_at,
  };
}

function normalizeNotification(input: AdminNotification): AdminNotification {
  return {
    id: input.id,
    title: input.title,
    message: input.message,
    targetRole: input.targetRole,
    createdAt: input.createdAt,
  };
}

function getLocalNotifications(): AdminNotification[] {
  return readLocalJson<AdminNotification[]>(LOCAL_NOTIFICATIONS_KEY, []).map(normalizeNotification);
}

function saveLocalNotifications(notifications: AdminNotification[]) {
  writeLocalJson(LOCAL_NOTIFICATIONS_KEY, notifications);
}

function getLocalBuses(): AdminBus[] {
  return readLocalJson<AdminBus[]>(LOCAL_BUSES_KEY, []);
}

function saveLocalBuses(buses: AdminBus[]) {
  writeLocalJson(LOCAL_BUSES_KEY, buses);
}

function buildSeedBuses(count = 48): AdminBus[] {
  const routes = [
    "SRM Main Gate",
    "Potheri Station",
    "Guduvanchery",
    "Tambaram",
    "Chromepet",
    "Velachery",
    "Madhya Kailash",
    "Sholinganallur",
  ];

  return Array.from({ length: count }, (_, index) => {
    const number = index + 1;
    return {
      id: crypto.randomUUID(),
      busNumber: `BUS-${String(number).padStart(3, "0")}`,
      routeName: routes[index % routes.length],
      plate: `TN-${String(10 + (index % 20)).padStart(2, "0")}-AB-${String(2000 + number)}`,
      status: "active",
      assignedDriverId: null,
      assignedDriverName: null,
      assignedDriverLoginId: null,
      updatedAt: new Date().toISOString(),
    };
  });
}

function applyDriverAssignments(
  buses: Array<{
    id: string;
    bus_number: string;
    route_name: string;
    plate: string;
    status: BusStatus;
    assigned_driver_id: string | null;
    updated_at: string;
  }>,
  drivers: Map<string, Pick<DriverRow, "name" | "email">>,
  activeBusNumbers: Set<string>,
): AdminBus[] {
  return buses.map((bus) => {
    const assignedDriver = bus.assigned_driver_id
      ? drivers.get(bus.assigned_driver_id)
      : null;

    return {
      id: bus.id,
      busNumber: bus.bus_number,
      routeName: bus.route_name,
      plate: bus.plate,
      status: activeBusNumbers.has(bus.bus_number) ? "active" : bus.status,
      assignedDriverId: bus.assigned_driver_id,
      assignedDriverName: assignedDriver?.name ?? null,
      assignedDriverLoginId: assignedDriver?.email ?? null,
      updatedAt: bus.updated_at,
    } satisfies AdminBus;
  });
}

async function getDriverMap(driverIds: string[]) {
  if (driverIds.length === 0) {
    return new Map<string, Pick<DriverRow, "name" | "email">>();
  }

  const { data: drivers, error } = await supabase
    .from("drivers")
    .select("id, name, email")
    .in("id", driverIds);

  if (error) {
    if (isMissingSupabaseTableError(error)) {
      return new Map<string, Pick<DriverRow, "name" | "email">>();
    }
    throw new Error(error.message);
  }

  return new Map(
    ((drivers ?? []) as Array<Pick<DriverRow, "id" | "name" | "email">>).map((driver) => [
      driver.id,
      { name: driver.name, email: driver.email },
    ]),
  );
}

export async function getApprovedStudents(): Promise<ApprovedStudent[]> {
  const { data, error } = await supabase
    .from("students")
    .select("id, name, email, assigned_bus_id, created_at")
    .order("name", { ascending: true });

  if (error) {
    if (isMissingSupabaseTableError(error)) return [];
    throw new Error(error.message);
  }

  return ((data ?? []) as StudentRow[]).map(
    (student) =>
      ({
        id: student.id,
        name: student.name,
        email: student.email,
        assignedBusId: student.assigned_bus_id,
        createdAt: student.created_at,
      }) satisfies ApprovedStudent,
  );
}

export async function assignStudentToBus(
  studentId: string,
  busId: string | null,
): Promise<{ ok: boolean; error?: string }> {
  const response = await fetch(apiUrl("/api/assign-student-bus"), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ studentId, busId }),
  });

  const payload = (await response.json()) as { success: boolean; error?: string };

  if (!response.ok || !payload.success) {
    return { ok: false, error: payload.error ?? "Assignment failed" };
  }

  return { ok: true };
}

export async function getBuses() {
  const activeTrips = await getActiveTrips().catch(() => []);
  const activeBusNumbers = new Set(activeTrips.map((trip) => trip.busNumber).filter(Boolean) as string[]);

  const { data: buses, error: busError } = await supabase
    .from("buses")
    .select("id, bus_number, route_name, plate, status, assigned_driver_id, updated_at")
    .order("bus_number", { ascending: true });

  if (busError) {
    if (isMissingSupabaseTableError(busError)) {
      const localBuses = getLocalBuses();
      const driverMap = await getDriverMap(
        Array.from(
          new Set(
            localBuses
              .map((bus) => bus.assignedDriverId)
              .filter((id): id is string => typeof id === "string" && id.length > 0),
          ),
        ),
      );
      return localBuses.map((bus) => {
        const assignedDriver = bus.assignedDriverId
          ? driverMap.get(bus.assignedDriverId)
          : null;

        return {
          ...bus,
          status: activeBusNumbers.has(bus.busNumber) ? "active" : bus.status,
          assignedDriverName: assignedDriver?.name ?? bus.assignedDriverName ?? null,
          assignedDriverLoginId: assignedDriver?.email ?? bus.assignedDriverLoginId ?? null,
        };
      });
    }
    throw new Error(busError.message);
  }

  const busRows = (buses ?? []) as BusRow[];
  const driverMap = await getDriverMap(
    Array.from(
      new Set(
        busRows
          .map((bus) => bus.assigned_driver_id)
          .filter((id): id is string => typeof id === "string" && id.length > 0),
      ),
    ),
  );

  return applyDriverAssignments(busRows, driverMap, activeBusNumbers);
}

export async function seedDefaultBuses(count = 48) {
  const fallbackBuses = buildSeedBuses(count);
  saveLocalBuses(fallbackBuses);

  const rows = fallbackBuses.map((bus) => ({
    id: bus.id,
    bus_number: bus.busNumber,
    route_name: bus.routeName,
    plate: bus.plate,
    status: bus.status,
    assigned_driver_id: null,
    updated_at: bus.updatedAt,
  }));

  const { error } = await supabase.from("buses").upsert(rows, { onConflict: "id" });
  if (error && !isMissingSupabaseTableError(error)) {
    throw new Error(error.message);
  }

  return { ok: true, count: fallbackBuses.length };
}

export async function getApprovedDrivers(): Promise<ApprovedDriver[]> {
  const { data, error } = await supabase
    .from("drivers")
    .select("id, name, email, created_at")
    .order("name", { ascending: true });

  const localDrivers: ApprovedDriver[] = getLocalApprovedDriverAccounts().map((driver) => ({
    id: driver.id,
    name: driver.name,
    email: driver.email,
    createdAt: driver.createdAt,
  }));

  if (error) {
    if (isMissingSupabaseTableError(error)) return localDrivers;
    throw new Error(error.message);
  }

  const remoteDrivers: ApprovedDriver[] = ((data ?? []) as DriverRow[]).map((driver) => ({
    id: driver.id,
    name: driver.name,
    email: driver.email,
    createdAt: driver.created_at,
  }));

  const uniqueLocal = localDrivers.filter(
    (localDriver) => !remoteDrivers.some((remoteDriver) => remoteDriver.id === localDriver.id),
  );

  return [...remoteDrivers, ...uniqueLocal].sort((a, b) => a.name.localeCompare(b.name));
}

export async function assignDriverToBus(busId: string, driverUserId: string | null) {
  if (!busId) throw new Error("Bus ID is required.");

  const nowIso = new Date().toISOString();
  const localBuses = getLocalBuses();
  if (localBuses.length > 0) {
    const updatedLocal = localBuses.map((bus) => {
      if (driverUserId && bus.assignedDriverId === driverUserId && bus.id !== busId) {
        return {
          ...bus,
          assignedDriverId: null,
          assignedDriverName: null,
          assignedDriverLoginId: null,
          updatedAt: nowIso,
        };
      }
      if (bus.id !== busId) return bus;
      return {
        ...bus,
        assignedDriverId: driverUserId,
        assignedDriverName: null,
        assignedDriverLoginId: null,
        updatedAt: nowIso,
      };
    });
    saveLocalBuses(updatedLocal);
  }

  const response = await fetch(apiUrl("/api/assign"), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ busId, driverId: driverUserId }),
  });

  const payload = (await response.json()) as { success: boolean; error?: string };
  if (!response.ok || !payload.success) {
    return { ok: false, error: payload.error ?? "Assignment failed" };
  }

  return { ok: true };
}

export async function getAssignedBusForDriver(driverUserId: string) {
  if (!driverUserId) return null;

  const { data, error } = await supabase
    .from("buses")
    .select("id, bus_number, route_name, plate, status, assigned_driver_id, updated_at")
    .eq("assigned_driver_id", driverUserId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle<BusRow>();

  if (error) {
    if (isMissingSupabaseTableError(error)) {
      return getLocalBuses().find((bus) => bus.assignedDriverId === driverUserId) ?? null;
    }
    throw new Error(error.message);
  }

  if (!data) {
    return getLocalBuses().find((bus) => bus.assignedDriverId === driverUserId) ?? null;
  }

  return {
    id: data.id,
    busNumber: data.bus_number,
    routeName: data.route_name,
    plate: data.plate,
    status: data.status,
    assignedDriverId: data.assigned_driver_id,
    assignedDriverName: null,
    assignedDriverLoginId: null,
    updatedAt: data.updated_at,
  } satisfies AdminBus;
}

export async function getOperationQueue() {
  const { data, error } = await supabase
    .from("operation_events")
    .select(
      "id, event_type, driver_user_id, driver_name, bus_id, bus_number, distance_km, speed_kmh, created_at",
    )
    .order("created_at", { ascending: false })
    .limit(30);

  if (error) {
    if (isMissingSupabaseTableError(error)) return [];
    throw new Error(error.message);
  }

  return ((data ?? []) as OperationEventRow[]).map(
    (row) =>
      ({
        id: row.id,
        eventType: row.event_type,
        driverUserId: row.driver_user_id,
        driverName: row.driver_name,
        busId: row.bus_id,
        busNumber: row.bus_number,
        distanceKm: row.distance_km,
        speedKmh: row.speed_kmh,
        createdAt: row.created_at,
      }) satisfies OperationQueueItem,
  );
}

export async function getActiveTrips(): Promise<ActiveTripAdminItem[]> {
  const queue = await getOperationQueue();
  const latestByDriver = new Map<string, OperationQueueItem>();

  for (const item of queue) {
    if (!latestByDriver.has(item.driverUserId)) {
      latestByDriver.set(item.driverUserId, item);
    }
  }

  return Array.from(latestByDriver.values())
    .filter((item) => item.eventType === "trip_started")
    .map((item) => ({
      driverUserId: item.driverUserId,
      driverName: item.driverName,
      busNumber: item.busNumber,
      distanceKm: item.distanceKm,
      speedKmh: item.speedKmh,
      createdAt: item.createdAt,
    }));
}

export async function getAdminNotifications() {
  const { data, error } = await supabase
    .from("notifications")
    .select("id, title, message, target_role, created_at")
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) {
    if (isMissingSupabaseTableError(error)) return getLocalNotifications();
    throw new Error(error.message);
  }

  const notifications = ((data ?? []) as NotificationRow[]).map(toAdminNotification);
  saveLocalNotifications(notifications);
  return notifications;
}

export async function getNotificationsForRole(role: "student" | "driver") {
  const notifications = await getAdminNotifications();
  return notifications.filter((note) => note.targetRole === "all" || note.targetRole === role);
}

export async function sendAdminNotification(input: {
  title: string;
  message: string;
  targetRole: NotificationTargetRole;
}) {
  const title = input.title.trim();
  const message = input.message.trim();

  if (!title || !message) {
    throw new Error("Title and message are required.");
  }

  const fallbackNotification: AdminNotification = {
    id: `local-note-${Date.now()}`,
    title,
    message,
    targetRole: input.targetRole,
    createdAt: new Date().toISOString(),
  };

  saveLocalNotifications([fallbackNotification, ...getLocalNotifications()].slice(0, 50));

  const { error } = await supabase.from("notifications").insert({
    title,
    message,
    target_role: input.targetRole,
  });

  if (error && !isMissingSupabaseTableError(error)) {
    throw new Error(error.message);
  }

  return { ok: true };
}
