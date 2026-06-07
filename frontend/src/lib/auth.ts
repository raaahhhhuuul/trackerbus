import { supabase } from "@/lib/supabase";
import type { Session as SupabaseSession } from "@supabase/supabase-js";
import {
  isMissingSupabaseTableError,
  isSupabaseAuthRateLimitError,
  isSupabaseWriteAccessError,
} from "@/lib/supabase-errors";

export type UserRole = "student" | "driver" | "admin";
export type RegistrableRole = "student" | "driver";

export interface AuthSession {
  role: UserRole;
  email: string;
  userId?: string;
  loginId?: string;
  displayName?: string;
  loggedInAt: string;
  token?: string;
}

export interface RegisteredUser {
  id: string;
  name: string;
  email: string;
  role: RegistrableRole;
  createdAt: string;
}

export interface PendingLoginApproval {
  requestId: string;
  requestedAt: string;
  userId: string;
  name: string;
  email: string;
  role: RegistrableRole;
}

interface SignUpInput {
  name: string;
  loginId: string;
  role: RegistrableRole;
  password: string;
}

interface AuthResult {
  session: AuthSession;
  homeRoute: "/student" | "/driver" | "/admin";
}

interface ApprovedDriverRow {
  id: string;
  name: string;
  email: string;
  created_at: string;
}

interface ApprovedStudentRow {
  id: string;
  name: string;
  email: string;
  created_at: string;
}

interface LocalPendingApproval {
  id: string;
  registrationId: string;
  userId: string;
  name: string;
  email: string;
  role: RegistrableRole;
  status: "pending" | "approved";
  requestedAt: string;
  approvedAt: string | null;
}

interface LocalApprovedAccount {
  userId: string;
  role: RegistrableRole;
  email: string;
  displayName: string;
}

interface LocalCredential {
  userId: string;
  loginId: string;
  password: string;
  role: RegistrableRole;
  displayName: string;
}

const SESSION_KEY = "pulseride.session.v1";
const LOCAL_LOGIN_APPROVALS_KEY = "pulseride.loginApprovals.local.v1";
const LOCAL_APPROVED_ACCOUNTS_KEY = "pulseride.approvedAccounts.local.v1";
const LOCAL_CREDENTIALS_KEY = "pulseride.credentials.local.v1";
const ADMIN_LOGIN_ID = "transporter@admin.com";
const ADMIN_LOGIN_ALIASES = new Set([ADMIN_LOGIN_ID, "admin"]);
const roleHomePath: Record<UserRole, "/student" | "/driver" | "/admin"> = {
  student: "/student",
  driver: "/driver",
  admin: "/admin",
};

function isRole(value: unknown): value is UserRole {
  return value === "student" || value === "driver" || value === "admin";
}

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

function normalizeLoginId(value: string) {
  return value.trim().toLowerCase();
}

function createMockJwt(payload: Record<string, unknown>) {
  const header = btoa(JSON.stringify({ alg: "HS256", typ: "JWT" }))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  const body = btoa(JSON.stringify(payload))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  const signature = btoa("pulseride-demo-signature")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  return `${header}.${body}.${signature}`;
}

export function getHomeRouteForRole(role: UserRole): "/student" | "/driver" | "/admin" {
  return roleHomePath[role];
}

export function getSession(): AuthSession | null {
  if (!isBrowser()) return null;

  try {
    const raw = window.localStorage.getItem(SESSION_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<AuthSession>;
    if (!isRole(parsed.role)) return null;
    if (typeof parsed.email !== "string" || parsed.email.trim().length === 0) return null;
    if (typeof parsed.loggedInAt !== "string") return null;

    return {
      role: parsed.role,
      email: parsed.email,
      userId: typeof parsed.userId === "string" ? parsed.userId : undefined,
      loginId: typeof parsed.loginId === "string" ? parsed.loginId : undefined,
      displayName: typeof parsed.displayName === "string" ? parsed.displayName : undefined,
      loggedInAt: parsed.loggedInAt,
      token: typeof parsed.token === "string" ? parsed.token : undefined,
    };
  } catch {
    return null;
  }
}

function setSession(
  role: UserRole,
  email: string,
  token?: string,
  options?: { userId?: string; loginId?: string; displayName?: string },
): AuthSession {
  const session: AuthSession = {
    role,
    email: email.trim().toLowerCase(),
    userId: options?.userId?.trim(),
    loginId: options?.loginId?.trim(),
    displayName: options?.displayName?.trim(),
    loggedInAt: new Date().toISOString(),
    token,
  };

  if (isBrowser()) {
    window.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  }

  return session;
}

function getLocalPendingApprovals() {
  return readLocalJson<LocalPendingApproval[]>(LOCAL_LOGIN_APPROVALS_KEY, []);
}

function saveLocalPendingApprovals(approvals: LocalPendingApproval[]) {
  writeLocalJson(LOCAL_LOGIN_APPROVALS_KEY, approvals);
}

function getLocalApprovedAccounts() {
  return readLocalJson<LocalApprovedAccount[]>(LOCAL_APPROVED_ACCOUNTS_KEY, []);
}

function saveLocalApprovedAccounts(accounts: LocalApprovedAccount[]) {
  writeLocalJson(LOCAL_APPROVED_ACCOUNTS_KEY, accounts);
}

function getLocalCredentials() {
  return readLocalJson<LocalCredential[]>(LOCAL_CREDENTIALS_KEY, []);
}

function saveLocalCredentials(credentials: LocalCredential[]) {
  writeLocalJson(LOCAL_CREDENTIALS_KEY, credentials);
}

function upsertLocalCredential(credential: LocalCredential) {
  saveLocalCredentials([
    credential,
    ...getLocalCredentials().filter((item) => item.loginId !== credential.loginId),
  ]);
}

function upsertLocalPendingApproval(approval: LocalPendingApproval) {
  saveLocalPendingApprovals([
    approval,
    ...getLocalPendingApprovals().filter((item) => item.id !== approval.id),
  ]);
}

export function getLocalApprovedDriverAccounts(): RegisteredUser[] {
  return getLocalApprovedAccounts()
    .filter((item) => item.role === "driver")
    .map((item) => ({
      id: item.userId,
      name: item.displayName,
      email: item.email,
      role: "driver" as const,
      createdAt: new Date().toISOString(),
    }));
}

async function getApprovedAccountByEmail(email: string) {
  const normalizedEmail = normalizeLoginId(email);
  const localApproved = getLocalApprovedAccounts().find((item) => item.email === normalizedEmail) ?? null;

  const [{ data: student, error: studentError }, { data: driver, error: driverError }] = await Promise.all([
    supabase.from("students").select("id, name, email, created_at").eq("email", normalizedEmail).maybeSingle<ApprovedStudentRow>(),
    supabase.from("drivers").select("id, name, email, created_at").eq("email", normalizedEmail).maybeSingle<ApprovedDriverRow>(),
  ]);

  if (studentError && !isMissingSupabaseTableError(studentError) && !isSupabaseWriteAccessError(studentError)) {
    throw new Error(studentError.message);
  }

  if (driverError && !isMissingSupabaseTableError(driverError) && !isSupabaseWriteAccessError(driverError)) {
    throw new Error(driverError.message);
  }

  if (student) {
    return { role: "student" as const, email: student.email, displayName: student.name };
  }

  if (driver) {
    return { role: "driver" as const, email: driver.email, displayName: driver.name };
  }

  if (localApproved) {
    return { role: localApproved.role, email: localApproved.email, displayName: localApproved.displayName };
  }

  return null;
}

export async function clearSession() {
  if (isBrowser()) {
    window.localStorage.removeItem(SESSION_KEY);
  }
  await supabase.auth.signOut();
}

export async function signUpUser(input: SignUpInput): Promise<RegisteredUser> {
  const name = input.name.trim();
  const loginId = normalizeLoginId(input.loginId);
  const password = input.password.trim();

  if (!name || !loginId || !password) {
    throw new Error("All fields are required");
  }

  if (input.role === "student" && !loginId.endsWith("@srmist.edu.in")) {
    throw new Error("Student signup requires @srmist.edu.in email");
  }

  if (password.length < 6) {
    throw new Error("Password must be at least 6 characters");
  }

  const nowIso = new Date().toISOString();
  const userId = `local-user-${crypto.randomUUID()}`;

  const { data: authData, error: authError } = await supabase.auth.signUp({
    email: loginId,
    password,
    options: {
      data: {
        role: input.role,
        name,
      },
    },
  });

  if (authError && !isSupabaseAuthRateLimitError(authError)) {
    throw new Error(authError.message);
  }

  const remoteUserId = authData.user?.id ?? userId;

  // Write registration + approval through the server API (uses service-role key,
  // bypassing RLS which would block an unauthenticated anon call).
  let registrationId: string | null = null;
  let approvalWritten = false;

  try {
    const signupResponse = await fetch("/api/signup", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, email: loginId, role: input.role, userId: remoteUserId }),
    });
    if (signupResponse.ok) {
      const payload = (await signupResponse.json()) as { ok: boolean; registrationId?: string };
      registrationId = payload.registrationId ?? null;
      approvalWritten = true;
    }
  } catch {
    // Server unreachable — fall through to direct Supabase attempt
  }

  if (!approvalWritten) {
    // Direct Supabase fallback (works when user is auto-confirmed after signUp)
    const { data: regData, error: regFallbackError } = await supabase
      .from("registrations")
      .upsert(
        { user_id: remoteUserId, name, email: loginId, role: input.role, status: "pending" },
        { onConflict: "user_id" },
      )
      .select("id")
      .maybeSingle<{ id: string }>();
    registrationId = regData?.id ?? null;

    if (regFallbackError) {
      upsertLocalPendingApproval({
        id: `local-approval-${remoteUserId}`,
        registrationId: registrationId ?? remoteUserId,
        userId: remoteUserId,
        name,
        email: loginId,
        role: input.role,
        status: "pending",
        requestedAt: nowIso,
        approvedAt: null,
      });
    }
  }

  upsertLocalCredential({
    userId: remoteUserId,
    loginId,
    password,
    role: input.role,
    displayName: name,
  });

  return {
    id: remoteUserId,
    name,
    email: loginId,
    role: input.role,
    createdAt: nowIso,
  };
}

export async function signIn(loginId: string, password: string): Promise<AuthResult> {
  const normalizedLoginId = normalizeLoginId(loginId);
  const normalizedPassword = password.trim();

  if (!normalizedLoginId || !normalizedPassword) {
    throw new Error("Login ID and password are required");
  }

  if (ADMIN_LOGIN_ALIASES.has(normalizedLoginId)) {
    const { data: adminAuth, error: adminError } = await supabase.auth.signInWithPassword({
      email: ADMIN_LOGIN_ID,
      password: normalizedPassword,
    });

    if (adminError || !adminAuth.user) {
      throw new Error("Admin sign-in failed.");
    }

    const session = setSession("admin", ADMIN_LOGIN_ID, adminAuth.session?.access_token, {
      userId: adminAuth.user.id,
      loginId: ADMIN_LOGIN_ID,
      displayName: "Admin",
    });

    return { session, homeRoute: getHomeRouteForRole("admin") };
  }

  const { data, error } = await supabase.auth.signInWithPassword({
    email: normalizedLoginId,
    password: normalizedPassword,
  });

  console.log("LOGIN RESPONSE:", data, error);

  if (error || !data.user) {
    const msg = (error?.message ?? "").toLowerCase();
    if (msg.includes("email not confirmed") || msg.includes("email_not_confirmed")) {
      throw new Error("Your email hasn't been verified yet. Please wait a moment and try again.");
    }
    if (msg.includes("invalid login credentials") || msg.includes("invalid_credentials")) {
      throw new Error("Incorrect email or password.");
    }
    throw new Error(error?.message ?? "Login failed. Please try again.");
  }

  const loginEmail = normalizeLoginId(data.user.email ?? normalizedLoginId);
  const apiResponse = await fetch("/api/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: loginEmail }),
  });

  const payload = (await apiResponse.json()) as {
    ok: boolean;
    approved?: boolean;
    role?: RegistrableRole;
    userId?: string;
    name?: string;
    email?: string;
    error?: string;
  };

  if (!apiResponse.ok || !payload.ok) {
    await supabase.auth.signOut();
    throw new Error(payload.error ?? "Login check failed.");
  }

  if (!payload.approved || !payload.role || !payload.email) {
    await supabase.auth.signOut();
    throw new Error("User not approved yet. Please wait for admin approval.");
  }

  const session = setSession(payload.role, payload.email, data.session?.access_token, {
    userId: payload.userId ?? data.user.id,
    loginId: payload.email,
    displayName: payload.name ?? payload.email.split("@")[0],
  });

  return {
    session,
    homeRoute: getHomeRouteForRole(payload.role),
  };
}

export async function getPendingApprovals(): Promise<PendingLoginApproval[]> {
  try {
    const response = await fetch("/api/pending-approvals");
    if (response.ok) {
      const payload = (await response.json()) as { ok: boolean; approvals: PendingLoginApproval[] };
      if (payload.ok && Array.isArray(payload.approvals)) {
        return payload.approvals;
      }
    }
  } catch {
    // fall through to Supabase/local fallback
  }

  const { data, error } = await supabase
    .from("registrations")
    .select("id, user_id, name, email, role, requested_at")
    .eq("status", "pending")
    .order("requested_at", { ascending: false });

  if (error) {
    if (isMissingSupabaseTableError(error) || isSupabaseWriteAccessError(error)) {
      return getLocalPendingApprovals()
        .filter((item) => item.status === "pending")
        .map((item) => ({
          requestId: item.id,
          requestedAt: item.requestedAt,
          userId: item.userId,
          name: item.name,
          email: item.email,
          role: item.role,
        }));
    }
    throw new Error(error.message);
  }

  return (data ?? []).map((item: any) => ({
    requestId: item.id as string,
    requestedAt: item.requested_at as string,
    userId: item.user_id as string,
    name: String(item.name ?? "Unknown"),
    email: String(item.email ?? "N/A"),
    role: item.role as RegistrableRole,
  } satisfies PendingLoginApproval));
}

export async function approveUser(requestId: string) {
  const localApproval = getLocalPendingApprovals().find((item) => item.id === requestId) ?? null;

  try {
    const response = await fetch("/api/approve", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: requestId }),
    });

    const payload = (await response.json()) as { success: boolean; role?: string; userId?: string; error?: string };
    if (!response.ok || !payload.success) {
      throw new Error(payload.error ?? "Approval failed");
    }

    if (localApproval) {
      const approvedAt = new Date().toISOString();
      saveLocalPendingApprovals(
        getLocalPendingApprovals().map((item) =>
          item.id === requestId ? { ...item, status: "approved", approvedAt } : item,
        ),
      );
      saveLocalApprovedAccounts([
        ...getLocalApprovedAccounts().filter((item) => item.userId !== localApproval.userId),
        {
          userId: localApproval.userId,
          role: localApproval.role,
          email: localApproval.email,
          displayName: localApproval.name,
        },
      ]);
    }

    return payload;
  } catch {
    if (!localApproval) return null;

    saveLocalPendingApprovals(
      getLocalPendingApprovals().map((item) =>
        item.id === requestId ? { ...item, status: "approved", approvedAt: new Date().toISOString() } : item,
      ),
    );
    saveLocalApprovedAccounts([
      ...getLocalApprovedAccounts().filter((item) => item.userId !== localApproval.userId),
      {
        userId: localApproval.userId,
        role: localApproval.role,
        email: localApproval.email,
        displayName: localApproval.name,
      },
    ]);
    return { success: true, role: localApproval.role, userId: localApproval.userId };
  }
}
