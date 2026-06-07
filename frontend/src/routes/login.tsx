import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Bus, Mail, Lock, Eye, EyeOff, AlertCircle, Loader2, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { getHomeRouteForRole, getSession, signIn } from "@/lib/auth";

export function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});

  useEffect(() => {
    const session = getSession();
    if (session) {
      navigate(getHomeRouteForRole(session.role), { replace: true });
    }
  }, [navigate]);

  const validate = () => {
    const nextErrors: typeof errors = {};
    if (!email) nextErrors.email = "Login ID is required";
    if (!password) nextErrors.password = "Password is required";
    else if (password.length < 6) nextErrors.password = "Minimum 6 characters";
    return nextErrors;
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

        toast.success("Signed in successfully", {
          description:
            session.role === "admin"
              ? "Admin token generated and session started."
              : "Welcome back.",
        });
        navigate(homeRoute);
      } catch (error) {
        setLoading(false);
        toast.error("Unable to sign in", {
          description:
            error instanceof Error ? error.message : "Please check your credentials and try again.",
        });
      }
    }, 700);
  };

  return (
    <div className="relative flex min-h-[calc(100vh-4rem)] items-center justify-center overflow-hidden px-4 py-10">
      <div className="absolute inset-0 -z-10 gradient-map-bg" />
      <div className="absolute inset-0 -z-10 map-grid opacity-40" />
      <div className="absolute -left-20 top-10 -z-10 h-72 w-72 rounded-full bg-primary/15 blur-3xl" />
      <div className="absolute -right-20 bottom-10 -z-10 h-72 w-72 rounded-full bg-accent/20 blur-3xl" />

      <motion.div
        initial={{ y: 24, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.45, ease: "easeOut" }}
        className="w-full max-w-2xl"
      >
        <div className="rounded-3xl border border-border/60 bg-card/95 p-7 shadow-elegant backdrop-blur-xl sm:p-9">
          <div className="mb-6 flex flex-col items-center text-center">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl gradient-primary shadow-glow">
              <Bus className="h-7 w-7 text-primary-foreground" strokeWidth={2.5} />
            </div>
            <h1 className="font-display text-2xl font-bold tracking-tight">Login to Transporter</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Enter your credentials to continue.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <Field label="Login ID" icon={<Mail className="h-4 w-4" />} error={errors.email}>
              <input
                type="text"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="Enter login ID"
                autoComplete="username"
                className="w-full bg-transparent text-sm font-medium text-foreground placeholder:text-muted-foreground focus:outline-none"
              />
            </Field>

            <Field
              label="Password"
              icon={<Lock className="h-4 w-4" />}
              error={errors.password}
              trailing={
                <button
                  type="button"
                  onClick={() => setShow((value) => !value)}
                  className="text-muted-foreground transition-colors hover:text-foreground"
                  aria-label={show ? "Hide password" : "Show password"}
                >
                  {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              }
            >
              <input
                type={show ? "text" : "password"}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Enter your password"
                autoComplete="current-password"
                className="w-full bg-transparent text-sm font-medium text-foreground placeholder:text-muted-foreground focus:outline-none"
              />
            </Field>

            <button
              type="submit"
              disabled={loading}
              className="group relative flex w-full items-center justify-center gap-2 rounded-2xl gradient-primary px-4 py-3 text-sm font-bold text-primary-foreground shadow-glow transition-transform hover:scale-[1.01] active:scale-[0.99] disabled:opacity-70"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Signing in...
                </>
              ) : (
                "Login"
              )}
            </button>
          </form>

          <div className="mt-5 border-t border-border pt-4 text-center">
            <p className="text-sm text-muted-foreground">
              Don&apos;t have an account?{" "}
              <button
                type="button"
                onClick={() => navigate("/signup")}
                className="inline-flex items-center gap-1 font-semibold text-primary hover:underline"
              >
                <UserPlus className="h-4 w-4" /> Sign up
              </button>
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

function Field({
  label,
  icon,
  error,
  trailing,
  children,
}: {
  label: string;
  icon: ReactNode;
  error?: string;
  trailing?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </label>
      <div
        className={`flex items-center gap-2.5 rounded-2xl border bg-surface px-3.5 py-3 transition-all focus-within:border-primary focus-within:ring-4 focus-within:ring-primary/10 ${
          error ? "border-destructive/60" : "border-border"
        }`}
      >
        <span className="text-muted-foreground">{icon}</span>
        <div className="flex-1">{children}</div>
        {trailing}
      </div>
      {error && (
        <p className="mt-1.5 flex items-center gap-1 text-xs font-medium text-destructive">
          <AlertCircle className="h-3 w-3" /> {error}
        </p>
      )}
    </div>
  );
}
