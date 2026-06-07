import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { Bus, User, LogOut, LayoutDashboard } from "lucide-react";
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

export function Navbar() {
  const location = useLocation();
  const navigate = useNavigate();
  const [session, setSession] = useState<AuthSession | null>(null);
  const isAuthPage = location.pathname === "/login" || location.pathname === "/signup";

  useEffect(() => {
    const syncSession = () => setSession(getSession());
    syncSession();

    window.addEventListener("storage", syncSession);
    return () => window.removeEventListener("storage", syncSession);
  }, [location.pathname]);

  const mainRoute = session ? getHomeRouteForRole(session.role) : "/login";
  const userDisplay = session?.displayName || session?.loginId || session?.email || "User";
  const userInitial = userDisplay.charAt(0).toUpperCase() || "U";

  const handleLogout = async () => {
    try {
      await clearSession();
      setSession(null);
      toast.success("Logged out", { description: "Please sign in to continue." });
      navigate("/login");
    } catch {
      toast.error("Logout failed", { description: "Please try again." });
    }
  };

  return (
    <header className="sticky top-0 z-1200 w-full border-b border-border/60 bg-background/70 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
        <Link to={mainRoute} className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl gradient-primary shadow-glow">
            <Bus className="h-5 w-5 text-primary-foreground" strokeWidth={2.5} />
          </div>
          <div className="flex flex-col leading-tight">
            <span className="font-display text-base font-bold tracking-tight">Transporter</span>
            <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Smart Transit
            </span>
          </div>
        </Link>

        {!isAuthPage && (
          <nav className="hidden items-center gap-1 md:flex">
            {session && <NavItem to={mainRoute} label={`${roleLabel(session.role)} Portal`} />}
          </nav>
        )}

        <div className="flex items-center gap-3">
          {session && (
            <div className="hidden items-center gap-2 rounded-full border border-border bg-surface px-3 py-1.5 sm:flex">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
              </span>
              <span className="text-xs font-medium text-foreground">Live</span>
            </div>
          )}
          {session ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="flex h-9 min-w-9 items-center justify-center rounded-full border border-border bg-surface px-2.5 text-xs font-bold transition-colors hover:bg-secondary"
                  aria-label="Profile"
                  title={`${roleLabel(session.role)} account`}
                >
                  {userInitial}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="z-1300 w-56 border-border bg-card">
                <DropdownMenuLabel>
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {roleLabel(session.role)} Account
                  </p>
                  <p className="mt-1 text-sm font-medium text-foreground">{userDisplay}</p>
                  <p className="mt-1 text-xs font-normal text-muted-foreground">
                    {session.loginId || session.email}
                  </p>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                {!isAuthPage ? (
                  <DropdownMenuItem
                    onSelect={() => {
                      navigate(mainRoute);
                    }}
                  >
                    <LayoutDashboard className="h-4 w-4" /> Open Portal
                  </DropdownMenuItem>
                ) : null}
                <DropdownMenuItem
                  onSelect={() => {
                    void handleLogout();
                  }}
                  className="text-destructive focus:bg-destructive/10 focus:text-destructive"
                >
                  <LogOut className="h-4 w-4" /> Logout
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <button
              type="button"
              className="flex h-9 min-w-9 items-center justify-center rounded-full border border-border bg-surface px-2.5 text-xs font-bold transition-colors hover:bg-secondary"
              aria-label="Profile"
              title="Guest"
            >
              <User className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </header>
  );
}

function NavItem({
  to,
  label,
}: {
  to: string;
  label: string;
}) {
  return (
    <NavLink
      to={to}
      className={({ isActive }: { isActive: boolean }) =>
        `rounded-full px-4 py-2 text-sm font-medium transition-colors hover:bg-secondary hover:text-foreground ${
          isActive ? "bg-secondary text-foreground" : "text-muted-foreground"
        }`
      }
    >
      {label}
    </NavLink>
  );
}
