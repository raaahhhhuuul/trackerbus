import { config } from "dotenv";
config();

import express from "express";
import cors from "cors";
import authRoutes from "./routes/auth.js";
import busRoutes from "./routes/buses.js";
const PORT = Number(process.env.PORT) || 3001;
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

const allowedOrigins = isProd
  ? (process.env.FRONTEND_URL ? [process.env.FRONTEND_URL] : "*")
  : "http://localhost:5173";
app.use(cors({ origin: allowedOrigins, credentials: true }));
app.use(express.json());

app.use("/api", authRoutes);
app.use("/api", busRoutes);

app.get("/health", (_req, res) => res.json({ ok: true, ts: Date.now() }));

app.listen(PORT, () => {
  console.log(`\n🚌  Backend running → http://localhost:${PORT}`);
  if (!isProd) {
    console.log(`   Frontend dev server → http://localhost:5173`);
    console.log(`   Start frontend:  cd frontend && npm run dev\n`);
  }
});
