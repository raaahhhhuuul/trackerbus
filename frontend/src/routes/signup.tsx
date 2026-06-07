import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { AlertCircle, Bus, GraduationCap, Lock, Mail, Loader2, Truck, UserRound } from "lucide-react";
import { toast } from "sonner";
import { getSession, signUpUser } from "@/lib/auth";

function detectRole(email: string): "student" | "driver" {
  return email.trim().toLowerCase().endsWith("@srmist.edu.in") ? "student" : "driver";
}

export function SignUpPage() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const role = detectRole(loginId);

  useEffect(() => {
    const session = getSession();
    if (session) navigate("/", { replace: true });
  }, [navigate]);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();

    if (!name || !loginId || !password || !confirmPassword) {
      toast.error("Please fill all fields.");
      return;
    }

    if (password.length < 6) {
      toast.error("Password must be at least 6 characters.");
      return;
    }

    if (password !== confirmPassword) {
      toast.error("Passwords do not match.");
      return;
    }

    setLoading(true);
    window.setTimeout(async () => {
      try {
        await signUpUser({ name, loginId, role, password });
        setLoading(false);
        toast.success("Signup submitted", {
          description: "Your request has been sent to admin for approval.",
        });
        navigate("/login");
      } catch (error) {
        setLoading(false);
        toast.error("Unable to sign up", {
          description:
            error instanceof Error ? error.message : "Please check your details and try again.",
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
            <h1 className="font-display text-2xl font-bold tracking-tight">Create account</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              SRM students use <span className="font-semibold text-foreground">@srmist.edu.in</span>{" "}
              · Drivers use any other email
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-3.5" noValidate>
            <Field icon={<UserRound className="h-4 w-4" />} label="Full name">
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Enter your full name"
                className="w-full bg-transparent text-sm font-medium text-foreground placeholder:text-muted-foreground focus:outline-none"
              />
            </Field>

            <Field icon={<Mail className="h-4 w-4" />} label="Email address">
              <input
                type="email"
                value={loginId}
                onChange={(e) => setLoginId(e.target.value)}
                placeholder="your@email.com"
                className="w-full bg-transparent text-sm font-medium text-foreground placeholder:text-muted-foreground focus:outline-none"
              />
            </Field>

            {loginId.trim().length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center gap-2 rounded-xl border border-border bg-surface px-3.5 py-2.5"
              >
                {role === "student" ? (
                  <GraduationCap className="h-4 w-4 text-primary" />
                ) : (
                  <Truck className="h-4 w-4 text-primary" />
                )}
                <span className="text-sm text-muted-foreground">
                  Signing up as{" "}
                  <span className="font-semibold text-foreground">
                    {role === "student" ? "Student (SRM)" : "Driver"}
                  </span>
                </span>
              </motion.div>
            )}

            <Field icon={<Lock className="h-4 w-4" />} label="Password">
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Min 6 characters"
                className="w-full bg-transparent text-sm font-medium text-foreground placeholder:text-muted-foreground focus:outline-none"
              />
            </Field>

            <Field icon={<Lock className="h-4 w-4" />} label="Confirm password">
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm password"
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
                  <Loader2 className="h-4 w-4 animate-spin" /> Creating account...
                </>
              ) : (
                "Sign up"
              )}
            </button>
          </form>

          <div className="mt-5 border-t border-border pt-4 text-center">
            <p className="text-sm text-muted-foreground">
              Already have an account?{" "}
              <button
                type="button"
                onClick={() => navigate("/login")}
                className="font-semibold text-primary hover:underline"
              >
                Login
              </button>
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

function Field({
  icon,
  label,
  children,
}: {
  icon: ReactNode;
  label: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </label>
      <div className="flex items-center gap-2.5 rounded-2xl border border-border bg-surface px-3.5 py-3 transition-all focus-within:border-primary focus-within:ring-4 focus-within:ring-primary/10">
        <span className="text-muted-foreground">{icon}</span>
        <div className="flex-1">{children}</div>
      </div>
    </div>
  );
}
