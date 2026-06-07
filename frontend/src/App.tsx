import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { Navbar } from "@/components/navbar";
import { AppToaster } from "@/components/app-toaster";
import { GlobalChennaiMap } from "@/components/global-chennai-map";
import { LandingRedirect } from "@/routes/index";
import { LoginPage } from "@/routes/login";
import { SignUpPage } from "@/routes/signup";
import { StudentDashboard } from "@/routes/student";
import { DriverPanel } from "@/routes/driver";
import { AdminDashboard } from "@/routes/admin";

function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="font-display text-7xl font-bold text-gradient">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          This route doesn&apos;t exist on the network.
        </p>
      </div>
    </div>
  );
}

export default function App() {
  const location = useLocation();
  const isAuthPage = location.pathname === "/login" || location.pathname === "/signup";

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Navbar />
      {isAuthPage ? (
        <main className="flex-1 bg-background">
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/signup" element={<SignUpPage />} />
            <Route path="*" element={<Navigate to="/login" replace />} />
          </Routes>
        </main>
      ) : (
        <div className="flex flex-1 flex-col lg:flex-row">
          <section className="order-1 h-[46vh] min-h-75 border-b border-border/70 lg:order-2 lg:h-auto lg:flex-1 lg:border-b-0 lg:border-l">
            <GlobalChennaiMap className="h-full w-full" />
          </section>
          <main className="order-2 w-full bg-background/85 backdrop-blur-lg lg:order-1 lg:h-[calc(100vh-4rem)] lg:w-115 lg:overflow-y-auto xl:w-130">
            <Routes>
              <Route path="/" element={<LandingRedirect />} />
              <Route path="/dashboard" element={<LandingRedirect />} />
              <Route path="/student" element={<StudentDashboard />} />
              <Route path="/driver" element={<DriverPanel />} />
              <Route path="/admin" element={<AdminDashboard />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </main>
        </div>
      )}
      <AppToaster />
    </div>
  );
}
