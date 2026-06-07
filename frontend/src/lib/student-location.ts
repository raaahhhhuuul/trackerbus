const STUDENT_LOCATION_KEY = "transporter.studentLocation.v1";
const STUDENT_LOCATION_EVENT = "transporter-student-location-updated";

export interface StudentLocationRecord {
  latitude: number;
  longitude: number;
  accuracy: number | null;
  updatedAt: string;
}

function isValidNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function parseLocation(value: unknown): StudentLocationRecord | null {
  if (!value || typeof value !== "object") return null;

  const maybe = value as Partial<StudentLocationRecord>;
  if (
    !isValidNumber(maybe.latitude) ||
    !isValidNumber(maybe.longitude) ||
    typeof maybe.updatedAt !== "string"
  ) {
    return null;
  }

  return {
    latitude: maybe.latitude,
    longitude: maybe.longitude,
    accuracy: isValidNumber(maybe.accuracy) ? maybe.accuracy : null,
    updatedAt: maybe.updatedAt,
  };
}

function emitLocationUpdate(location: StudentLocationRecord | null) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<StudentLocationRecord | null>(STUDENT_LOCATION_EVENT, { detail: location }),
  );
}

export function getCachedStudentLocation(): StudentLocationRecord | null {
  if (typeof window === "undefined") return null;

  const raw = window.localStorage.getItem(STUDENT_LOCATION_KEY);
  if (!raw) return null;

  try {
    return parseLocation(JSON.parse(raw) as unknown);
  } catch {
    return null;
  }
}

export function saveStudentLocation(location: StudentLocationRecord): void {
  if (typeof window === "undefined") return;

  window.localStorage.setItem(STUDENT_LOCATION_KEY, JSON.stringify(location));
  emitLocationUpdate(location);
}

export function clearStudentLocation(): void {
  if (typeof window === "undefined") return;

  window.localStorage.removeItem(STUDENT_LOCATION_KEY);
  emitLocationUpdate(null);
}

export function subscribeToStudentLocation(
  onChange: (location: StudentLocationRecord | null) => void,
): () => void {
  if (typeof window === "undefined") return () => {};

  const onCustom = (event: Event) => {
    const custom = event as CustomEvent<StudentLocationRecord | null>;
    onChange(custom.detail ?? null);
  };

  const onStorage = (event: StorageEvent) => {
    if (event.key !== STUDENT_LOCATION_KEY) return;

    if (!event.newValue) {
      onChange(null);
      return;
    }

    try {
      const parsed = parseLocation(JSON.parse(event.newValue) as unknown);
      onChange(parsed);
    } catch {
      onChange(null);
    }
  };

  window.addEventListener(STUDENT_LOCATION_EVENT, onCustom as EventListener);
  window.addEventListener("storage", onStorage);

  return () => {
    window.removeEventListener(STUDENT_LOCATION_EVENT, onCustom as EventListener);
    window.removeEventListener("storage", onStorage);
  };
}
