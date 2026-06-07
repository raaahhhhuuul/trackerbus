import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { AlertCircle, Bus, GraduationCap, Lock, Loader2, Mail, Truck, UserRound } from "lucide-react";
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
  const roleDetected = loginId.trim().length > 4;

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
    if (password.length < 6) { toast.error("Password must be at least 6 characters."); return; }
    if (password !== confirmPassword) { toast.error("Passwords do not match."); return; }

    setLoading(true);
    window.setTimeout(async () => {
      try {
        await signUpUser({ name, loginId, role, password });
        setLoading(false);
        toast.success("Request submitted", {
          description: "Admin will review and approve your account.",
        });
        navigate("/login");
      } catch (error) {
        setLoading(false);
        toast.error("Signup failed", {
          description: error instanceof Error ? error.message : "Please try again.",
        });
      }
    }, 600);
  };

  return (
    <div className="relative flex min-h-[calc(100vh-64px)] overflow-hidden">
      {/* Left panel — branding */}
      <div className="hidden lg:flex lg:w-[45%] flex-col items-center justify-center p-12 relative overflow-hidden">
        <div className="absolute inset-0 gradient-hero" />
        <div className="absolute inset-0 dot-grid opacity-30" />
        <div className="absolute -top-32 -right-32 h-96 w-96 rounded-full bg-accent/20 blur-3xl" />
        <div className="absolute -bottom-32 -left-32 h-96 w-96 rounded-full bg-primary/15 blur-3xl" />

        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: "easeOut" }}
          className="relative z-10 text-center max-w-sm"
        >
          <div className="mx-auto mb-8 flex h-20 w-20 items-center justify-center rounded-3xl gradient-primary shadow-glow float-y">
            <Bus className="h-10 w-10 text-white" strokeWidth={2} />
          </div>
          <h1 className="font-display text-4xl font-bold">
            Join <span className="text-gradient">Transporter</span>
          </h1>
          <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
            Register your account. Admin reviews and approves new users within 24 hours.
          </p>

          {/* Role cards */}
          <div className="mt-8 space-y-3">
            <div className="glass rounded-xl p-4 text-left">
              <div className="flex items-center gap-3 mb-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/15">
                  <GraduationCap className="h-4 w-4 text-primary" />
                </div>
                <p className="font-semibold text-sm">Students</p>
              </div>
              <p className="text-xs text-muted-foreground">
                Use your <span className="font-mono font-semibold text-foreground">@srmist.edu.in</span> email. Track your bus in real time, get live ETA.
              </p>
            </div>
            <div className="glass rounded-xl p-4 text-left">
              <div className="flex items-center gap-3 mb-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/15">
                  <Truck className="h-4 w-4 text-accent" />
                </div>
                <p className="font-semibold text-sm">Drivers</p>
              </div>
              <p className="text-xs text-muted-foreground">
                Use any email. Start trips and broadcast live GPS location to passengers.
              </p>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Right panel — form */}
      <div className="flex flex-1 items-center justify-center p-6 relative">
        <div className="absolute inset-0 bg-background" />
        <div className="absolute top-0 left-0 h-80 w-80 rounded-full bg-accent/8 blur-3xl" />
        <div className="absolute bottom-0 right-0 h-80 w-80 rounded-full bg-primary/8 blur-3xl" />

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
            <h2 className="font-display text-3xl font-bold">Create account</h2>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Fill in your details. Admin approves all new users.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <AuthField icon={<UserRound className="h-4 w-4" />} label="Full Name">
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your full name"
                className="w-full bg-transparent text-sm font-medium placeholder:text-muted-foreground focus:outline-none"
              />
            </AuthField>

            <AuthField icon={<Mail className="h-4 w-4" />} label="Email Address">
              <input
                type="email"
                value={loginId}
                onChange={(e) => setLoginId(e.target.value)}
                placeholder="your@email.com"
                className="w-full bg-transparent text-sm font-medium placeholder:text-muted-foreground focus:outline-none"
              />
            </AuthField>

            {/* Role detection indicator */}
            {roleDetected && (
              <motion.div
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                className={`flex items-center gap-2.5 rounded-xl border px-3.5 py-2.5 ${
                  role === "student"
                    ? "border-primary/25 bg-primary/8"
                    : "border-accent/25 bg-accent/8"
                }`}
              >
                {role === "student" ? (
                  <GraduationCap className="h-4 w-4 text-primary flex-shrink-0" />
                ) : (
                  <Truck className="h-4 w-4 text-accent flex-shrink-0" />
                )}
                <span className="text-sm">
                  Signing up as{" "}
                  <span className={`font-bold ${role === "student" ? "text-primary" : "text-accent"}`}>
                    {role === "student" ? "Student (SRM)" : "Driver"}
                  </span>
                </span>
              </motion.div>
            )}

            <AuthField icon={<Lock className="h-4 w-4" />} label="Password">
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Minimum 6 characters"
                className="w-full bg-transparent text-sm font-medium placeholder:text-muted-foreground focus:outline-none"
              />
            </AuthField>

            <AuthField icon={<Lock className="h-4 w-4" />} label="Confirm Password">
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Repeat password"
                className="w-full bg-transparent text-sm font-medium placeholder:text-muted-foreground focus:outline-none"
              />
            </AuthField>

            <button
              type="submit"
              disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-2xl gradient-primary py-3.5 text-sm font-bold text-white shadow-glow transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-60"
            >
              {loading ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Creating account...</>
              ) : (
                "Create Account"
              )}
            </button>
          </form>

          <div className="mt-6 border-t border-border/50 pt-5 text-center">
            <p className="text-sm text-muted-foreground">
              Already have an account?{" "}
              <button
                type="button"
                onClick={() => navigate("/login")}
                className="font-semibold text-primary hover:underline"
              >
                Sign in
              </button>
            </p>
          </div>
        </motion.div>
      </div>
    </div>
  );
}

function AuthField({
  label, icon, children,
}: {
  label: string; icon: ReactNode; children: ReactNode;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </label>
      <div className="flex items-center gap-3 rounded-2xl border border-border/60 bg-surface/80 px-4 py-3.5 transition-all focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20">
        <span className="text-muted-foreground flex-shrink-0">{icon}</span>
        <div className="flex-1 min-w-0">{children}</div>
      </div>
    </div>
  );
}
