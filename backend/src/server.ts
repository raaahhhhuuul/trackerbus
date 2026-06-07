import { config } from "dotenv";
config();

import express from "express";
import cors from "cors";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import authRoutes from "./routes/auth.js";
import busRoutes from "./routes/buses.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = parseInt(process.env.PORT ?? "3001", 10);
const isProd = process.env.NODE_ENV === "production";

if (!process.env.SUPABASE_URL) {
  console.error("❌  SUPABASE_URL is not set — add it to backend/.env");
  process.exit(1);
}
if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error("❌  SUPABASE_SERVICE_ROLE_KEY is not set — add it to backend/.env");
  process.exit(1);
}

const app = express();

app.use(cors({ origin: isProd ? false : "http://localhost:5173", credentials: true }));
app.use(express.json());

app.use("/api", authRoutes);
app.use("/api", busRoutes);

app.get("/health", (_req, res) => res.json({ ok: true, ts: Date.now() }));

if (isProd) {
  const distPath = join(__dirname, "../../frontend/dist");
  app.use(express.static(distPath));
  app.get("*", (_req, res) => {
    res.sendFile(join(distPath, "index.html"));
  });
}

app.listen(PORT, () => {
  console.log(`\n🚌  Backend running → http://localhost:${PORT}`);
  if (!isProd) {
    console.log(`   Frontend dev server → http://localhost:5173`);
    console.log(`   Start frontend:  cd frontend && npm run dev\n`);
  }
});
