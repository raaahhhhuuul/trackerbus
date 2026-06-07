import { supabase } from "@/lib/supabase";
import { isMissingSupabaseTableError } from "@/lib/supabase-errors";

const LOCAL_TRACKING_KEY = "transporter.liveTracking.v1";
const TRACKING_EVENT = "transporter-live-tracking-updated";
const LIVE_TRACKING_TABLE_FLAG = "transporter.supabase.driverLiveTracking.available";
const OPERATION_EVENTS_TABLE_FLAG = "transporter.supabase.operationEvents.available";
const LIVE_TRACKING_RETRY_KEY = "transporter.supabase.driverLiveTracking.retryAt";
const OPERATION_EVENTS_RETRY_KEY = "transporter.supabase.operationEvents.retryAt";
const TABLE_RETRY_DELAY_MS = 30000;
const ACTIVE_TRIP_STALE_MS = 15000;

export interface LiveTrackingRecord {
  latitude: number;
  longitude: number;
  speedKmh: number;
  distanceKm: number;
  isActive: boolean;
  startedAt: string | null;
  updatedAt: string;
  driverUserId: string | null;
}

export interface SaveDriverTrackingInput {
  latitude: number;
  longitude: number;
  speedKmh: number;
  distanceKm: number;
  isActive: boolean;
  startedAt?: string | null;
}

interface RemoteTrackingRow {
  user_id: string;
  latitude: number;
  longitude: number;
  speed_kmh: number;
  distance_km: number;
  is_active: boolean;
  started_at: string | null;
  updated_at: string;
}

interface DriverProfileRow {
  name: string;
}

interface AssignedBusRow {
  id: string;
  bus_number: string;
}

interface TripStartRow {
  latitude: number | null;
  longitude: number | null;
  created_at: string;
}

interface LatestTripEventRow {
  id: string;
  event_type: "trip_started" | "trip_ended";
  driver_user_id: string;
  driver_name: string;
  bus_number: string | null;
  distance_km: number;
  speed_kmh: number;
  latitude: number | null;
  longitude: number | null;
  created_at: string;
}

export interface TripStartLocation {
  latitude: number;
  longitude: number;
  createdAt: string;
}

export interface ActiveTripSummary {
  driverUserId: string;
  driverName: string;
  busNumber: string | null;
  distanceKm: number;
  speedKmh: number;
  latitude: number | null;
  longitude: number | null;
  startedAt: string;
}

let liveTrackingTableAvailable = true;
let operationEventsTableAvailable = true;

function readAvailabilityFlag(key: string): boolean {
  if (typeof window === "undefined") return true;

  const stored = window.localStorage.getItem(key);
  if (stored === null) return true;

  return stored !== "false";
}

function writeAvailabilityFlag(key: string, available: boolean) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, available ? "true" : "false");
}

function setRetryAt(key: string) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, String(Date.now() + TABLE_RETRY_DELAY_MS));
}

function canAttemptTable(availabilityKey: string, retryKey: string): boolean {
  if (typeof window === "undefined") return true;

  const stored = window.localStorage.getItem(availabilityKey);
  if (stored !== "false") return true;

  const retryAtRaw = window.localStorage.getItem(retryKey);
  const retryAt = retryAtRaw ? Number(retryAtRaw) : 0;
  if (Number.isFinite(retryAt) && retryAt > Date.now()) return false;

  writeAvailabilityFlag(availabilityKey, true);
  return true;
}

liveTrackingTableAvailable = readAvailabilityFlag(LIVE_TRACKING_TABLE_FLAG);
operationEventsTableAvailable = readAvailabilityFlag(OPERATION_EVENTS_TABLE_FLAG);

function isValidNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function parseRecord(value: unknown): LiveTrackingRecord | null {
  if (!value || typeof value !== "object") return null;

  const maybe = value as Partial<LiveTrackingRecord>;
  if (
    !isValidNumber(maybe.latitude) ||
    !isValidNumber(maybe.longitude) ||
    !isValidNumber(maybe.speedKmh) ||
    !isValidNumber(maybe.distanceKm) ||
    typeof maybe.isActive !== "boolean" ||
    typeof maybe.updatedAt !== "string"
  ) {
    return null;
  }

  return {
    latitude: maybe.latitude,
    longitude: maybe.longitude,
    speedKmh: maybe.speedKmh,
    distanceKm: maybe.distanceKm,
    isActive: maybe.isActive,
    startedAt: typeof maybe.startedAt === "string" ? maybe.startedAt : null,
    updatedAt: maybe.updatedAt,
    driverUserId: typeof maybe.driverUserId === "string" ? maybe.driverUserId : null,
  };
}

function toRecordFromRemote(row: RemoteTrackingRow): LiveTrackingRecord {
  return {
    latitude: row.latitude,
    longitude: row.longitude,
    speedKmh: row.speed_kmh,
    distanceKm: row.distance_km,
    isActive: row.is_active,
    startedAt: row.started_at,
    updatedAt: row.updated_at,
    driverUserId: row.user_id,
  };
}

async function readRemoteTracking(): Promise<LiveTrackingRecord | null> {
  if (!liveTrackingTableAvailable && !canAttemptTable(LIVE_TRACKING_TABLE_FLAG, LIVE_TRACKING_RETRY_KEY)) {
    return null;
  }

  try {
    const { data, error } = await supabase
      .from("driver_live_tracking")
      .select(
        "user_id, latitude, longitude, speed_kmh, distance_km, is_active, started_at, updated_at",
      )
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle<RemoteTrackingRow>();

    if (error || !data) {
      if (isMissingSupabaseTableError(error)) {
        liveTrackingTableAvailable = false;
        writeAvailabilityFlag(LIVE_TRACKING_TABLE_FLAG, false);
        setRetryAt(LIVE_TRACKING_RETRY_KEY);
      }
      return null;
    }

    return toRecordFromRemote(data);
  } catch {
    return null;
  }
}

function emitTrackingUpdate(record: LiveTrackingRecord | null) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<LiveTrackingRecord | null>(TRACKING_EVENT, { detail: record }),
  );
}

function cacheTracking(record: LiveTrackingRecord | null) {
  if (typeof window === "undefined") return;

  if (!record) {
    window.localStorage.removeItem(LOCAL_TRACKING_KEY);
    emitTrackingUpdate(null);
    return;
  }

  window.localStorage.setItem(LOCAL_TRACKING_KEY, JSON.stringify(record));
  emitTrackingUpdate(record);
}

async function getSessionUserId(): Promise<string | null> {
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    return session?.user.id ?? null;
  } catch {
    return null;
  }
}

async function getOperationEventContext(userId: string) {
  if (!operationEventsTableAvailable && !canAttemptTable(OPERATION_EVENTS_TABLE_FLAG, OPERATION_EVENTS_RETRY_KEY)) {
    return null;
  }

  let driverName = "Driver";
  let busId: string | null = null;
  let busNumber: string | null = null;

  const [{ data: driverData }, { data: assignedBuses }] = await Promise.all([
    supabase.from("drivers").select("name").eq("id", userId).maybeSingle<DriverProfileRow>(),
    supabase
      .from("buses")
      .select("id, bus_number")
      .eq("assigned_driver_id", userId)
      .order("updated_at", { ascending: false })
      .limit(1),
  ]);

  if (driverData?.name) {
    driverName = driverData.name;
  }

  const assignedBus = ((assignedBuses ?? []) as AssignedBusRow[])[0];
  if (assignedBus) {
    busId = assignedBus.id;
    busNumber = assignedBus.bus_number;
  }

  return { driverName, busId, busNumber };
}

async function insertOperationEvent(
  payload: {
    event_type: "trip_started" | "trip_ended";
    driver_user_id: string;
    driver_name: string;
    bus_id: string | null;
    bus_number: string | null;
    distance_km: number;
    speed_kmh: number;
    latitude: number;
    longitude: number;
  },
): Promise<boolean> {
  const { error } = await supabase.from("operation_events").insert(payload);

  if (!error) {
    return true;
  }

  if (isMissingSupabaseTableError(error)) {
    operationEventsTableAvailable = false;
    writeAvailabilityFlag(OPERATION_EVENTS_TABLE_FLAG, false);
    setRetryAt(OPERATION_EVENTS_RETRY_KEY);
    return false;
  }

  const { error: fallbackError } = await supabase.from("operation_events").insert({
    event_type: payload.event_type,
    driver_user_id: payload.driver_user_id,
    driver_name: payload.driver_name,
    bus_id: payload.bus_id,
    bus_number: payload.bus_number,
    distance_km: payload.distance_km,
    speed_kmh: payload.speed_kmh,
  });

  if (fallbackError) {
    if (isMissingSupabaseTableError(fallbackError)) {
      operationEventsTableAvailable = false;
      writeAvailabilityFlag(OPERATION_EVENTS_TABLE_FLAG, false);
      setRetryAt(OPERATION_EVENTS_RETRY_KEY);
    }
    return false;
  }

  return true;
}

async function updateOperationEvent(
  eventId: string,
  payload: {
    driver_name: string;
    bus_id: string | null;
    bus_number: string | null;
    distance_km: number;
    speed_kmh: number;
    latitude: number;
    longitude: number;
  },
): Promise<boolean> {
  const { error } = await supabase
    .from("operation_events")
    .update(payload)
    .eq("id", eventId);

  if (!error) {
    return true;
  }

  const { error: fallbackError } = await supabase
    .from("operation_events")
    .update({
      driver_name: payload.driver_name,
      bus_id: payload.bus_id,
      bus_number: payload.bus_number,
      distance_km: payload.distance_km,
      speed_kmh: payload.speed_kmh,
    })
    .eq("id", eventId);

  return !fallbackError;
}

async function syncActiveOperationEvent(record: LiveTrackingRecord, userId: string): Promise<void> {
  if (!operationEventsTableAvailable && !canAttemptTable(OPERATION_EVENTS_TABLE_FLAG, OPERATION_EVENTS_RETRY_KEY)) {
    return;
  }

  const context = await getOperationEventContext(userId);
  if (!context) return;

  const eventPayload = {
    event_type: "trip_started" as const,
    driver_user_id: userId,
    driver_name: context.driverName,
    bus_id: context.busId,
    bus_number: context.busNumber,
    distance_km: record.distanceKm,
    speed_kmh: record.speedKmh,
    latitude: record.latitude,
    longitude: record.longitude,
  };

  const { data: latestEvent, error } = await supabase
    .from("operation_events")
    .select("id, event_type")
    .eq("driver_user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<Pick<LatestTripEventRow, "id" | "event_type">>();

  if (error && isMissingSupabaseTableError(error)) {
    operationEventsTableAvailable = false;
    writeAvailabilityFlag(OPERATION_EVENTS_TABLE_FLAG, false);
    setRetryAt(OPERATION_EVENTS_RETRY_KEY);
    return;
  }

  if (latestEvent?.event_type === "trip_started") {
    const updated = await updateOperationEvent(latestEvent.id, {
      driver_name: eventPayload.driver_name,
      bus_id: eventPayload.bus_id,
      bus_number: eventPayload.bus_number,
      distance_km: eventPayload.distance_km,
      speed_kmh: eventPayload.speed_kmh,
      latitude: eventPayload.latitude,
      longitude: eventPayload.longitude,
    });

    if (updated) {
      return;
    }
  }

  await insertOperationEvent(eventPayload);
}

async function logOperationEvent(
  eventType: "trip_started" | "trip_ended",
  record: LiveTrackingRecord,
  userId: string,
): Promise<void> {
  if (eventType === "trip_started") {
    await syncActiveOperationEvent(record, userId);
    return;
  }

  if (!operationEventsTableAvailable && !canAttemptTable(OPERATION_EVENTS_TABLE_FLAG, OPERATION_EVENTS_RETRY_KEY)) {
    return;
  }

  const context = await getOperationEventContext(userId);
  if (!context) return;

  await insertOperationEvent({
    event_type: "trip_ended",
    driver_user_id: userId,
    driver_name: context.driverName,
    bus_id: context.busId,
    bus_number: context.busNumber,
    distance_km: record.distanceKm,
    speed_kmh: record.speedKmh,
    latitude: record.latitude,
    longitude: record.longitude,
  });
}

function isNewerThan(a: string, b: string): boolean {
  return new Date(a).getTime() > new Date(b).getTime();
}

function isFreshEnough(updatedAt: string, maxAgeMs: number): boolean {
  return Date.now() - new Date(updatedAt).getTime() <= maxAgeMs;
}

export function getCachedDriverTracking(): LiveTrackingRecord | null {
  if (typeof window === "undefined") return null;

  const raw = window.localStorage.getItem(LOCAL_TRACKING_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as unknown;
    return parseRecord(parsed);
  } catch {
    return null;
  }
}

export async function getLatestDriverTracking(): Promise<LiveTrackingRecord | null> {
  const cached = getCachedDriverTracking();
  const remote = await readRemoteTracking();

  if (!remote) {
    const activeTrip = await getActiveTripSummary();
    if (activeTrip) {
      const fallbackRecord: LiveTrackingRecord = {
        latitude: activeTrip.latitude ?? cached?.latitude ?? 0,
        longitude: activeTrip.longitude ?? cached?.longitude ?? 0,
        speedKmh: activeTrip.speedKmh,
        distanceKm: activeTrip.distanceKm,
        isActive: true,
        startedAt: activeTrip.startedAt,
        updatedAt: new Date().toISOString(),
        driverUserId: activeTrip.driverUserId,
      };
      cacheTracking(fallbackRecord);
      return fallbackRecord;
    }

    if (cached?.isActive && isFreshEnough(cached.updatedAt, ACTIVE_TRIP_STALE_MS)) {
      return cached;
    }

    if (cached?.isActive) {
      cacheTracking(null);
      return null;
    }

    return cached ?? null;
  }

  if (!cached || isNewerThan(remote.updatedAt, cached.updatedAt)) {
    cacheTracking(remote);
    return remote;
  }

  return cached;
}

export async function getDriverTripStartLocation(
  driverUserId: string,
): Promise<TripStartLocation | null> {
  if (!operationEventsTableAvailable && !canAttemptTable(OPERATION_EVENTS_TABLE_FLAG, OPERATION_EVENTS_RETRY_KEY)) {
    return null;
  }

  try {
    const { data, error } = await supabase
      .from("operation_events")
      .select("latitude, longitude, created_at")
      .eq("event_type", "trip_started")
      .eq("driver_user_id", driverUserId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<TripStartRow>();

    if (error || !data) {
      if (isMissingSupabaseTableError(error)) {
        operationEventsTableAvailable = false;
        writeAvailabilityFlag(OPERATION_EVENTS_TABLE_FLAG, false);
        setRetryAt(OPERATION_EVENTS_RETRY_KEY);
      }
      return null;
    }
    if (!isValidNumber(data.latitude) || !isValidNumber(data.longitude)) return null;

    return {
      latitude: data.latitude,
      longitude: data.longitude,
      createdAt: data.created_at,
    };
  } catch {
    return null;
  }
}

export async function getActiveTripSummary(): Promise<ActiveTripSummary | null> {
  if (!operationEventsTableAvailable && !canAttemptTable(OPERATION_EVENTS_TABLE_FLAG, OPERATION_EVENTS_RETRY_KEY)) {
    return null;
  }

  try {
    const { data, error } = await supabase
      .from("operation_events")
      .select(
        "id, event_type, driver_user_id, driver_name, bus_number, distance_km, speed_kmh, latitude, longitude, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<LatestTripEventRow>();

    if (error || !data) {
      if (isMissingSupabaseTableError(error)) {
        operationEventsTableAvailable = false;
        writeAvailabilityFlag(OPERATION_EVENTS_TABLE_FLAG, false);
        setRetryAt(OPERATION_EVENTS_RETRY_KEY);
      }
      return null;
    }

    if (data.event_type !== "trip_started") {
      return null;
    }

    return {
      driverUserId: data.driver_user_id,
      driverName: data.driver_name,
      busNumber: data.bus_number,
      distanceKm: data.distance_km,
      speedKmh: data.speed_kmh,
      latitude: isValidNumber(data.latitude) ? data.latitude : null,
      longitude: isValidNumber(data.longitude) ? data.longitude : null,
      startedAt: data.created_at,
    };
  } catch {
    return null;
  }
}

export async function getTrackingForDriver(
  driverUserId: string,
): Promise<LiveTrackingRecord | null> {
  try {
    const { data, error } = await supabase
      .from("driver_live_tracking")
      .select(
        "user_id, latitude, longitude, speed_kmh, distance_km, is_active, started_at, updated_at",
      )
      .eq("user_id", driverUserId)
      .maybeSingle<RemoteTrackingRow>();

    if (error || !data) return null;
    return toRecordFromRemote(data);
  } catch {
    return null;
  }
}

export async function saveDriverTracking(input: SaveDriverTrackingInput): Promise<void> {
  const cached = getCachedDriverTracking();
  const userId = await getSessionUserId();
  const nowIso = new Date().toISOString();
  const becameActive = input.isActive && cached?.isActive !== true;
  const becameInactive = !input.isActive && cached?.isActive === true;

  const nextRecord: LiveTrackingRecord = {
    latitude: input.latitude,
    longitude: input.longitude,
    speedKmh: input.speedKmh,
    distanceKm: input.distanceKm,
    isActive: input.isActive,
    startedAt: input.startedAt ?? cached?.startedAt ?? null,
    updatedAt: nowIso,
    driverUserId: userId ?? cached?.driverUserId ?? null,
  };

  if (!userId) {
    throw new Error("Driver session not found. Please sign in again.");
  }

  cacheTracking(nextRecord);

  let syncedLiveTable = false;

  if (liveTrackingTableAvailable || canAttemptTable(LIVE_TRACKING_TABLE_FLAG, LIVE_TRACKING_RETRY_KEY)) {
    const { error } = await supabase.from("driver_live_tracking").upsert(
      {
        user_id: userId,
        latitude: nextRecord.latitude,
        longitude: nextRecord.longitude,
        speed_kmh: nextRecord.speedKmh,
        distance_km: nextRecord.distanceKm,
        is_active: nextRecord.isActive,
        started_at: nextRecord.startedAt,
        updated_at: nextRecord.updatedAt,
      },
      { onConflict: "user_id" },
    );

    if (error) {
      if (isMissingSupabaseTableError(error)) {
        liveTrackingTableAvailable = false;
        writeAvailabilityFlag(LIVE_TRACKING_TABLE_FLAG, false);
        setRetryAt(LIVE_TRACKING_RETRY_KEY);
      }
    } else {
      syncedLiveTable = true;
    }
  }

  if (becameActive) {
    await logOperationEvent("trip_started", nextRecord, userId);
    return;
  }

  if (becameInactive) {
    await logOperationEvent("trip_ended", nextRecord, userId);
    return;
  }

  if (nextRecord.isActive && !syncedLiveTable) {
    await syncActiveOperationEvent(nextRecord, userId);
  }
}

export async function stopDriverTracking(distanceKm: number, speedKmh: number): Promise<void> {
  const cached = getCachedDriverTracking();
  if (!cached) return;

  await saveDriverTracking({
    latitude: cached.latitude,
    longitude: cached.longitude,
    speedKmh,
    distanceKm,
    isActive: false,
    startedAt: cached.startedAt,
  });
}

export function subscribeToDriverTracking(
  onChange: (record: LiveTrackingRecord | null) => void,
): () => void {
  if (typeof window === "undefined") return () => {};

  const onCustom = (event: Event) => {
    const custom = event as CustomEvent<LiveTrackingRecord | null>;
    onChange(custom.detail ?? null);
  };

  const onStorage = (event: StorageEvent) => {
    if (event.key !== LOCAL_TRACKING_KEY) return;

    if (!event.newValue) {
      onChange(null);
      return;
    }

    try {
      const parsed = JSON.parse(event.newValue) as unknown;
      onChange(parseRecord(parsed));
    } catch {
      onChange(null);
    }
  };

  window.addEventListener(TRACKING_EVENT, onCustom as EventListener);
  window.addEventListener("storage", onStorage);

  return () => {
    window.removeEventListener(TRACKING_EVENT, onCustom as EventListener);
    window.removeEventListener("storage", onStorage);
  };
}
