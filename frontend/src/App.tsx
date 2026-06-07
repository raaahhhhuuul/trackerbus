import { Routes, Route, Navigate } from "react-router-dom";
import { Navbar } from "@/components/navbar";
import { AppToaster } from "@/components/app-toaster";
import { LandingRedirect } from "@/routes/index";
import { LoginPage } from "@/routes/login";
import { SignUpPage } from "@/routes/signup";
import { VerifyEmailPage } from "@/routes/verify-email";
import { AuthConfirmPage } from "@/routes/auth-confirm";
import { StudentDashboard } from "@/routes/student";
import { DriverPanel } from "@/routes/driver";
import { AdminDashboard } from "@/routes/admin";

function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="font-display text-7xl font-bold text-gradient">404</h1>
        <h2 className="mt-4 text-xl font-semibold">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">This route doesn&apos;t exist on the network.</p>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Navbar />
      <Routes>
        <Route path="/login"        element={<LoginPage />} />
        <Route path="/signup"       element={<SignUpPage />} />
        <Route path="/verify-email" element={<VerifyEmailPage />} />
        <Route path="/auth/confirm" element={<AuthConfirmPage />} />
        <Route path="/"             element={<LandingRedirect />} />
        <Route path="/dashboard" element={<LandingRedirect />} />
        <Route path="/student"   element={<StudentDashboard />} />
        <Route path="/driver"    element={<DriverPanel />} />
        <Route path="/admin"     element={<AdminDashboard />} />
        <Route path="*"          element={<NotFound />} />
      </Routes>
      <AppToaster />
    </div>
  );
}
