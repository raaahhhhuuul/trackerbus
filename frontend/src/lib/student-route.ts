const STUDENT_ROUTE_KEY = "transporter.studentRoute.v1";
const STUDENT_ROUTE_EVENT = "transporter-student-route-updated";

export interface StudentRouteRecord {
  driverLatitude: number;
  driverLongitude: number;
  studentLatitude: number;
  studentLongitude: number;
  driverStartLatitude: number | null;
  driverStartLongitude: number | null;
  distanceKm: number;
  durationMin: number;
  etaMinutes: number;
  path: Array<[number, number]>;
  updatedAt: string;
}

function isValidNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function parsePath(path: unknown): Array<[number, number]> {
  if (!Array.isArray(path)) return [];

  return path
    .filter((item): item is [number, number] => {
      if (!Array.isArray(item) || item.length !== 2) return false;
      return isValidNumber(item[0]) && isValidNumber(item[1]);
    })
    .map((item) => [item[0], item[1]] as [number, number]);
}

function parseRoute(value: unknown): StudentRouteRecord | null {
  if (!value || typeof value !== "object") return null;

  const maybe = value as Partial<StudentRouteRecord>;
  if (
    !isValidNumber(maybe.driverLatitude) ||
    !isValidNumber(maybe.driverLongitude) ||
    !isValidNumber(maybe.studentLatitude) ||
    !isValidNumber(maybe.studentLongitude) ||
    !isValidNumber(maybe.distanceKm) ||
    !isValidNumber(maybe.durationMin) ||
    !isValidNumber(maybe.etaMinutes) ||
    typeof maybe.updatedAt !== "string"
  ) {
    return null;
  }

  return {
    driverLatitude: maybe.driverLatitude,
    driverLongitude: maybe.driverLongitude,
    studentLatitude: maybe.studentLatitude,
    studentLongitude: maybe.studentLongitude,
    driverStartLatitude: isValidNumber(maybe.driverStartLatitude)
      ? maybe.driverStartLatitude
      : null,
    driverStartLongitude: isValidNumber(maybe.driverStartLongitude)
      ? maybe.driverStartLongitude
      : null,
    distanceKm: maybe.distanceKm,
    durationMin: maybe.durationMin,
    etaMinutes: maybe.etaMinutes,
    path: parsePath(maybe.path),
    updatedAt: maybe.updatedAt,
  };
}

function emitRouteUpdate(route: StudentRouteRecord | null) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<StudentRouteRecord | null>(STUDENT_ROUTE_EVENT, { detail: route }),
  );
}

export function getCachedStudentRoute(): StudentRouteRecord | null {
  if (typeof window === "undefined") return null;

  const raw = window.localStorage.getItem(STUDENT_ROUTE_KEY);
  if (!raw) return null;

  try {
    return parseRoute(JSON.parse(raw) as unknown);
  } catch {
    return null;
  }
}

export function saveStudentRoute(route: StudentRouteRecord): void {
  if (typeof window === "undefined") return;

  window.localStorage.setItem(STUDENT_ROUTE_KEY, JSON.stringify(route));
  emitRouteUpdate(route);
}

export function clearStudentRoute(): void {
  if (typeof window === "undefined") return;

  window.localStorage.removeItem(STUDENT_ROUTE_KEY);
  emitRouteUpdate(null);
}

export function subscribeToStudentRoute(
  onChange: (route: StudentRouteRecord | null) => void,
): () => void {
  if (typeof window === "undefined") return () => {};

  const onCustom = (event: Event) => {
    const custom = event as CustomEvent<StudentRouteRecord | null>;
    onChange(custom.detail ?? null);
  };

  const onStorage = (event: StorageEvent) => {
    if (event.key !== STUDENT_ROUTE_KEY) return;

    if (!event.newValue) {
      onChange(null);
      return;
    }

    try {
      onChange(parseRoute(JSON.parse(event.newValue) as unknown));
    } catch {
      onChange(null);
    }
  };

  window.addEventListener(STUDENT_ROUTE_EVENT, onCustom as EventListener);
  window.addEventListener("storage", onStorage);

  return () => {
    window.removeEventListener(STUDENT_ROUTE_EVENT, onCustom as EventListener);
    window.removeEventListener("storage", onStorage);
  };
}
