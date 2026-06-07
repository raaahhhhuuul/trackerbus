import { Router } from "express";
import { db } from "../db.js";

const router = Router();

// POST /api/login — checks if user is approved (in students or drivers table)
router.post("/login", async (req, res) => {
  const { email } = req.body as { email?: string };
  const normalizedEmail = (email ?? "").trim().toLowerCase();

  if (!normalizedEmail) {
    res.status(400).json({ ok: false, error: "Missing email" });
    return;
  }

  const [{ data: driver, error: driverErr }, { data: student, error: studentErr }] =
    await Promise.all([
      db.from("drivers").select("id, name, email").eq("email", normalizedEmail).maybeSingle(),
      db.from("students").select("id, name, email").eq("email", normalizedEmail).maybeSingle(),
    ]);

  if (driverErr) {
    res.status(500).json({ ok: false, error: driverErr.message });
    return;
  }
  if (studentErr) {
    res.status(500).json({ ok: false, error: studentErr.message });
    return;
  }

  if (driver) {
    res.json({
      ok: true,
      approved: true,
      role: "driver",
      userId: (driver as { id: string }).id,
      name: (driver as { name: string }).name,
      email: (driver as { email: string }).email,
    });
    return;
  }

  if (student) {
    res.json({
      ok: true,
      approved: true,
      role: "student",
      userId: (student as { id: string }).id,
      name: (student as { name: string }).name,
      email: (student as { email: string }).email,
    });
    return;
  }

  res.json({ ok: true, approved: false });
});

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// POST /api/signup — creates a pending registration (email confirmation is handled by Supabase)
router.post("/signup", async (req, res) => {
  const { name, email, role, userId } = req.body as {
    name?: string;
    email?: string;
    role?: string;
    userId?: string;
  };

  if (!name || !email || !role || !userId) {
    res.status(400).json({ ok: false, error: "Missing required fields" });
    return;
  }

  // userId must be a real Supabase auth UUID — reject local-only fallback IDs
  if (!UUID_RE.test(userId)) {
    res.status(400).json({ ok: false, error: "Invalid userId — Supabase signup may have failed silently" });
    return;
  }

  // NOTE: we intentionally do NOT call updateUserById({ email_confirm: true }) here.
  // Email confirmation is handled by Supabase's own verification email flow.

  const { data: reg, error: regError } = await db
    .from("registrations")
    .upsert(
      { user_id: userId, name, email, role, status: "pending" },
      { onConflict: "user_id" },
    )
    .select("id")
    .maybeSingle<{ id: string }>();

  if (regError) {
    res.status(500).json({ ok: false, error: regError.message });
    return;
  }

  res.json({ ok: true, registrationId: reg?.id ?? null });
});

// GET /api/pending-approvals — list all pending registration requests
router.get("/pending-approvals", async (_req, res) => {
  const { data, error } = await db
    .from("registrations")
    .select("id, user_id, name, email, role, requested_at")
    .eq("status", "pending")
    .order("requested_at", { ascending: false });

  if (error) {
    res.status(500).json({ ok: false, error: error.message });
    return;
  }

  const approvals = (data ?? []).map((item: any) => ({
    requestId: item.id as string,
    requestedAt: item.requested_at as string,
    userId: item.user_id as string,
    role: item.role as string,
    name: String(item.name ?? "Unknown"),
    email: String(item.email ?? "N/A"),
  }));

  res.json({ ok: true, approvals });
});

// POST /api/approve — approve a pending registration; simultaneously insert into students/drivers
router.post("/approve", async (req, res) => {
  const { id } = req.body as { id?: string };

  if (!id) {
    res.status(400).json({ success: false, error: "Missing id" });
    return;
  }

  const { data: reg, error: fetchError } = await db
    .from("registrations")
    .select("id, user_id, name, email, role, status")
    .eq("id", id)
    .single<{ id: string; user_id: string; name: string; email: string; role: string; status: string }>();

  if (fetchError) {
    res.status(500).json({ success: false, error: fetchError.message });
    return;
  }
  if (!reg) {
    res.status(404).json({ success: false, error: "Registration not found" });
    return;
  }
  if (reg.status !== "pending") {
    res.status(409).json({ success: false, error: "Already processed" });
    return;
  }

  const role = reg.role.toLowerCase();
  const table = role === "student" ? "students" : "drivers";

  // Check if already inserted (idempotent)
  const { data: existing } = await db
    .from(table)
    .select("id")
    .eq("id", reg.user_id)
    .maybeSingle<{ id: string }>();

  if (!existing) {
    const { error: insertError } = await db
      .from(table)
      .insert({ id: reg.user_id, name: reg.name, email: reg.email });
    if (insertError) {
      res.status(500).json({ success: false, error: insertError.message });
      return;
    }
  }

  // Update registration status to approved
  const { error: updateError } = await db
    .from("registrations")
    .update({ status: "approved", approved_at: new Date().toISOString() })
    .eq("id", id);

  if (updateError) {
    res.status(500).json({ success: false, error: updateError.message });
    return;
  }

  res.json({ success: true, role, userId: reg.user_id });
});

// POST /api/account-status — check if a userId is an approved student or driver
router.post("/account-status", async (req, res) => {
  const { userId } = req.body as { userId?: string };

  if (!userId) {
    res.status(400).json({ ok: false, error: "Missing userId" });
    return;
  }

  const [{ data: student }, { data: driver }] = await Promise.all([
    db
      .from("students")
      .select("id, name, email")
      .eq("id", userId)
      .maybeSingle<{ id: string; name: string; email: string }>(),
    db
      .from("drivers")
      .select("id, name, email")
      .eq("id", userId)
      .maybeSingle<{ id: string; name: string; email: string }>(),
  ]);

  if (student) {
    res.json({ ok: true, status: "approved", role: "student", email: student.email, displayName: student.name });
    return;
  }

  if (driver) {
    res.json({ ok: true, status: "approved", role: "driver", email: driver.email, displayName: driver.name });
    return;
  }

  res.json({ ok: true, status: "pending" });
});

// POST /api/student-bus — return the bus assigned to a student (service role, bypasses RLS)
router.post("/student-bus", async (req, res) => {
  const { userId } = req.body as { userId?: string };

  if (!userId) {
    res.status(400).json({ ok: false, error: "Missing userId" });
    return;
  }

  const { data: student, error: studentError } = await db
    .from("students")
    .select("assigned_bus_id")
    .eq("id", userId)
    .maybeSingle<{ assigned_bus_id: string | null }>();

  if (studentError) {
    res.status(500).json({ ok: false, error: studentError.message });
    return;
  }

  if (!student?.assigned_bus_id) {
    res.json({ ok: true, busId: null, busNumber: null, routeName: null, driverUserId: null });
    return;
  }

  const { data: bus, error: busError } = await db
    .from("buses")
    .select("id, bus_number, route_name, assigned_driver_id")
    .eq("id", student.assigned_bus_id)
    .maybeSingle<{
      id: string;
      bus_number: string;
      route_name: string;
      assigned_driver_id: string | null;
    }>();

  if (busError) {
    res.status(500).json({ ok: false, error: busError.message });
    return;
  }

  if (!bus) {
    res.json({ ok: true, busId: null, busNumber: null, routeName: null, driverUserId: null });
    return;
  }

  res.json({
    ok: true,
    busId: bus.id,
    busNumber: bus.bus_number,
    routeName: bus.route_name,
    driverUserId: bus.assigned_driver_id,
  });
});

// POST /api/driver-bus — return the bus assigned to a driver (service role, bypasses RLS)
router.post("/driver-bus", async (req, res) => {
  const { userId } = req.body as { userId?: string };

  if (!userId) {
    res.status(400).json({ ok: false, error: "Missing userId" });
    return;
  }

  const { data: bus, error } = await db
    .from("buses")
    .select("id, bus_number, route_name, assigned_driver_id")
    .eq("assigned_driver_id", userId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle<{
      id: string;
      bus_number: string;
      route_name: string;
      assigned_driver_id: string | null;
    }>();

  if (error) {
    res.status(500).json({ ok: false, error: error.message });
    return;
  }

  if (!bus) {
    res.json({ ok: true, busId: null, busNumber: null, routeName: null });
    return;
  }

  res.json({
    ok: true,
    busId: bus.id,
    busNumber: bus.bus_number,
    routeName: bus.route_name,
  });
});

export default router;
