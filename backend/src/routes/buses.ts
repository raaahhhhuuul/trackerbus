import { Router } from "express";
import { db } from "../db.js";

const router = Router();

// POST /api/assign — assign a driver to a bus (clears any previous assignment for that driver)
router.post("/assign", async (req, res) => {
  const { busId, driverId } = req.body as { busId?: string; driverId?: string | null };

  if (!busId) {
    res.status(400).json({ success: false, error: "Missing busId" });
    return;
  }

  if (driverId) {
    await db
      .from("buses")
      .update({ assigned_driver_id: null })
      .eq("assigned_driver_id", driverId)
      .neq("id", busId);
  }

  const { error } = await db
    .from("buses")
    .update({ assigned_driver_id: driverId ?? null })
    .eq("id", busId);

  if (error) {
    res.status(500).json({ success: false, error: error.message });
    return;
  }

  res.json({ success: true });
});

// POST /api/assign-student-bus — assign a student to a specific bus
router.post("/assign-student-bus", async (req, res) => {
  const { studentId, busId } = req.body as { studentId?: string; busId?: string | null };

  if (!studentId) {
    res.status(400).json({ success: false, error: "Missing studentId" });
    return;
  }

  const { error } = await db
    .from("students")
    .update({ assigned_bus_id: busId ?? null })
    .eq("id", studentId);

  if (error) {
    res.status(500).json({ success: false, error: error.message });
    return;
  }

  res.json({ success: true });
});

export default router;
