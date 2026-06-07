import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { AlertCircle, Bus, Eye, EyeOff, Lock, Loader2, Mail, UserPlus, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { getHomeRouteForRole, getSession, resendVerificationEmail, signIn } from "@/lib/auth";

export function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const [unverifiedEmail, setUnverifiedEmail] = useState<string | null>(null);
  const [resending, setResending] = useState(false);

  useEffect(() => {
    const session = getSession();
    if (session) navigate(getHomeRouteForRole(session.role), { replace: true });
  }, [navigate]);

  const validate = () => {
    const e: typeof errors = {};
    if (!email) e.email = "Login ID is required";
    if (!password) e.password = "Password is required";
    else if (password.length < 6) e.password = "Minimum 6 characters";
    return e;
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const nextErrors = validate();
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;
    setLoading(true);
    window.setTimeout(async () => {
      try {
        const { session, homeRoute } = await signIn(email, password);
        setLoading(false);
        toast.success("Signed in", {
          description: session.role === "admin" ? "Admin session started." : "Welcome back.",
        });
        navigate(homeRoute);
      } catch (error) {
        setLoading(false);
        const msg = error instanceof Error ? error.message : "";
        if (msg.toLowerCase().includes("verified") || msg.toLowerCase().includes("confirmed")) {
          setUnverifiedEmail(email.trim());
          toast.error("Email not verified", {
            description: "Click the verification link we emailed you, then try again.",
          });
        } else {
          setUnverifiedEmail(null);
          toast.error("Unable to sign in", {
            description: msg || "Check credentials and try again.",
          });
        }
      }
    }, 600);
  };

  const handleResend = async () => {
    if (!unverifiedEmail || resending) return;
    setResending(true);
    try {
      await resendVerificationEmail(unverifiedEmail);
      toast.success("Verification email sent", {
        description: `Check ${unverifiedEmail} for a new link.`,
      });
    } catch {
      toast.error("Could not resend. Try again shortly.");
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="relative flex min-h-[calc(100vh-64px)] overflow-hidden">
      {/* Left panel — branding */}
      <div className="hidden lg:flex lg:w-[45%] flex-col items-center justify-center p-12 relative overflow-hidden">
        {/* Background */}
        <div className="absolute inset-0 gradient-hero" />
        <div className="absolute inset-0 dot-grid opacity-30" />
        {/* Glow orbs */}
        <div className="absolute -top-32 -left-32 h-96 w-96 rounded-full bg-primary/20 blur-3xl" />
        <div className="absolute -bottom-32 -right-32 h-96 w-96 rounded-full bg-accent/15 blur-3xl" />

        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: "easeOut" }}
          className="relative z-10 text-center"
        >
          <div className="mx-auto mb-8 flex h-20 w-20 items-center justify-center rounded-3xl gradient-primary shadow-glow float-y">
            <Bus className="h-10 w-10 text-white" strokeWidth={2} />
          </div>
          <h1 className="font-display text-4xl font-bold tracking-tight">
            <span className="text-gradient">Transporter</span>
          </h1>
          <p className="mt-3 text-base text-muted-foreground max-w-xs mx-auto leading-relaxed">
            Real-time GPS fleet management for SRM's campus bus network.
          </p>

          {/* Feature list */}
          <div className="mt-8 space-y-3 text-left">
            {[
              "48 buses tracked live across Chennai",
              "Student ETA & route updates in real time",
              "Driver trip broadcasting with GPS",
            ].map((text) => (
              <div key={text} className="flex items-center gap-3 glass rounded-xl px-4 py-3">
                <span className="h-2 w-2 rounded-full status-online flex-shrink-0" />
                <p className="text-sm font-medium">{text}</p>
              </div>
            ))}
          </div>
        </motion.div>
      </div>

      {/* Right panel — form */}
      <div className="flex flex-1 items-center justify-center p-6 relative">
        <div className="absolute inset-0 bg-background" />
        <div className="absolute top-0 right-0 h-80 w-80 rounded-full bg-primary/8 blur-3xl" />
        <div className="absolute bottom-0 left-0 h-80 w-80 rounded-full bg-accent/8 blur-3xl" />

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: "easeOut", delay: 0.1 }}
          className="relative z-10 w-full max-w-md"
        >
          {/* Mobile logo */}
          <div className="lg:hidden flex items-center gap-3 mb-8">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl gradient-primary shadow-glow">
              <Bus className="h-6 w-6 text-white" strokeWidth={2.5} />
            </div>
            <div>
              <p className="font-display text-lg font-bold">Transporter</p>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Transit Command
              </p>
            </div>
          </div>

          <div className="mb-8">
            <h2 className="font-display text-3xl font-bold">Welcome back</h2>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Sign in to your portal to continue.
            </p>
          </div>

          {/* Unverified email banner */}
          {unverifiedEmail && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-4 flex items-start gap-3 rounded-2xl border border-yellow-500/30 bg-yellow-500/8 px-4 py-3"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-yellow-400" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-yellow-300">Email not verified</p>
                <p className="mt-0.5 text-xs text-yellow-300/70">
                  Check your inbox for the verification link.
                </p>
                <button
                  type="button"
                  onClick={handleResend}
                  disabled={resending}
                  className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-yellow-300 hover:text-yellow-200 disabled:opacity-60"
                >
                  {resending ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                  {resending ? "Sending…" : "Resend verification email"}
                </button>
              </div>
            </motion.div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <AuthField label="Login ID / Email" icon={<Mail className="h-4 w-4" />} error={errors.email}>
              <input
                type="text"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Enter your login ID"
                autoComplete="username"
                className="w-full bg-transparent text-sm font-medium placeholder:text-muted-foreground focus:outline-none"
              />
            </AuthField>

            <AuthField
              label="Password"
              icon={<Lock className="h-4 w-4" />}
              error={errors.password}
              trailing={
                <button
                  type="button"
                  onClick={() => setShow((v) => !v)}
                  className="text-muted-foreground hover:text-foreground transition-colors"
                  aria-label={show ? "Hide" : "Show"}
                >
                  {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              }
            >
              <input
                type={show ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password"
                autoComplete="current-password"
                className="w-full bg-transparent text-sm font-medium placeholder:text-muted-foreground focus:outline-none"
              />
            </AuthField>

            <button
              type="submit"
              disabled={loading}
              className="group relative flex w-full items-center justify-center gap-2 overflow-hidden rounded-2xl gradient-primary py-3.5 text-sm font-bold text-white shadow-glow transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-60"
            >
              {loading ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Signing in...</>
              ) : (
                "Sign In"
              )}
            </button>
          </form>

          <div className="mt-6 border-t border-border/50 pt-5 text-center">
            <p className="text-sm text-muted-foreground">
              New to Transporter?{" "}
              <button
                type="button"
                onClick={() => navigate("/signup")}
                className="inline-flex items-center gap-1 font-semibold text-primary hover:underline"
              >
                <UserPlus className="h-3.5 w-3.5" /> Create account
              </button>
            </p>
          </div>
        </motion.div>
      </div>
    </div>
  );
}

function AuthField({
  label, icon, error, trailing, children,
}: {
  label: string; icon: ReactNode; error?: string; trailing?: ReactNode; children: ReactNode;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </label>
      <div
        className={`flex items-center gap-3 rounded-2xl border bg-surface/80 px-4 py-3.5 transition-all focus-within:ring-2 focus-within:ring-primary/25 ${
          error ? "border-destructive/60 focus-within:border-destructive" : "border-border/60 focus-within:border-primary"
        }`}
      >
        <span className="text-muted-foreground flex-shrink-0">{icon}</span>
        <div className="flex-1 min-w-0">{children}</div>
        {trailing}
      </div>
      {error && (
        <p className="mt-1.5 flex items-center gap-1.5 text-xs font-medium text-destructive">
          <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" /> {error}
        </p>
      )}
    </div>
  );
}
