import { Link, useLocation, useNavigate } from "react-router-dom";
import { Bus, LayoutDashboard, LogOut, Shield, Truck, User, GraduationCap } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { clearSession, getHomeRouteForRole, getSession, type AuthSession } from "@/lib/auth";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";

function roleLabel(role: AuthSession["role"]) {
  if (role === "student") return "Student";
  if (role === "driver") return "Driver";
  return "Admin";
}

function RoleIcon({ role }: { role: AuthSession["role"] }) {
  if (role === "student") return <GraduationCap className="h-3.5 w-3.5" />;
  if (role === "driver") return <Truck className="h-3.5 w-3.5" />;
  return <Shield className="h-3.5 w-3.5" />;
}

const ROLE_COLORS: Record<AuthSession["role"], string> = {
  admin:   "text-primary  bg-primary/15  border-primary/25",
  driver:  "text-accent   bg-accent/15   border-accent/25",
  student: "text-success  bg-success/15  border-success/25",
};

export function Navbar() {
  const location = useLocation();
  const navigate = useNavigate();
  const [session, setSession] = useState<AuthSession | null>(null);
  const isAuthPage = location.pathname === "/login" || location.pathname === "/signup";

  useEffect(() => {
    const sync = () => setSession(getSession());
    sync();
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, [location.pathname]);

  const mainRoute = session ? getHomeRouteForRole(session.role) : "/login";
  const userDisplay = session?.displayName || session?.loginId || session?.email || "User";
  const userInitial = userDisplay.charAt(0).toUpperCase() || "U";

  const handleLogout = async () => {
    try {
      await clearSession();
      setSession(null);
      toast.success("Logged out");
      navigate("/login");
    } catch {
      toast.error("Logout failed");
    }
  };

  return (
    <header className="sticky top-0 z-[1200] w-full border-b border-border/40 bg-surface/80 backdrop-blur-2xl">
      <div className="mx-auto flex h-16 max-w-screen-2xl items-center justify-between px-4 sm:px-6">

        {/* Logo */}
        <Link to={mainRoute} className="flex items-center gap-2.5 group">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl gradient-primary shadow-glow transition-transform group-hover:scale-105">
            <Bus className="h-5 w-5 text-white" strokeWidth={2.5} />
          </div>
          <div className="flex flex-col leading-tight">
            <span className="font-display text-base font-bold tracking-tight">Transporter</span>
            <span className="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground">
              Transit Command
            </span>
          </div>
        </Link>

        {/* Right side */}
        <div className="flex items-center gap-2.5">

          {/* Live indicator */}
          {session && !isAuthPage && (
            <div className="hidden items-center gap-2 rounded-full border border-success/25 bg-success/10 px-3 py-1.5 sm:flex">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
              </span>
              <span className="text-xs font-semibold text-success">Live</span>
            </div>
          )}

          {/* Role badge */}
          {session && !isAuthPage && (
            <div
              className={`hidden items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider sm:flex ${ROLE_COLORS[session.role]}`}
            >
              <RoleIcon role={session.role} />
              {roleLabel(session.role)}
            </div>
          )}

          {/* User dropdown / guest button */}
          {session ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="flex h-9 w-9 items-center justify-center rounded-full border border-border/60 bg-surface font-display text-sm font-bold transition-colors hover:border-primary/40 hover:bg-secondary"
                  aria-label="Account menu"
                >
                  {userInitial}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="z-[1300] w-60 border-border/60 bg-card shadow-elegant"
              >
                <DropdownMenuLabel className="pb-2">
                  <div
                    className={`mb-2 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${ROLE_COLORS[session.role]}`}
                  >
                    <RoleIcon role={session.role} />
                    {roleLabel(session.role)} Account
                  </div>
                  <p className="text-sm font-semibold text-foreground truncate">{userDisplay}</p>
                  <p className="mt-0.5 text-xs font-normal text-muted-foreground truncate">
                    {session.loginId || session.email}
                  </p>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                {!isAuthPage && (
                  <DropdownMenuItem onSelect={() => navigate(mainRoute)}>
                    <LayoutDashboard className="h-4 w-4" /> Open Portal
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem
                  onSelect={() => void handleLogout()}
                  className="text-destructive focus:bg-destructive/10 focus:text-destructive"
                >
                  <LogOut className="h-4 w-4" /> Sign Out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <button
              type="button"
              className="flex h-9 w-9 items-center justify-center rounded-full border border-border/60 bg-surface text-muted-foreground transition-colors hover:bg-secondary"
              aria-label="Guest"
            >
              <User className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
