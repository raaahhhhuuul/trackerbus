import { useEffect, useRef, useState } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import { motion } from "framer-motion";
import { CheckCircle, XCircle, Loader2, Bus, ArrowRight, Mail } from "lucide-react";
import { supabase } from "@/lib/supabase";

type Status = "loading" | "success" | "error";

export function AuthConfirmPage() {
  const navigate = useNavigate();
  const { search } = useLocation();
  const [status, setStatus] = useState<Status>("loading");
  const [errorMsg, setErrorMsg] = useState("");
  const ran = useRef(false);

  useEffect(() => {
    // Guard against StrictMode double-invoke
    if (ran.current) return;
    ran.current = true;

    const run = async () => {
      try {
        const params = new URLSearchParams(search);
        const tokenHash = params.get("token_hash");
        const code = params.get("code");

        if (tokenHash) {
          // Custom email template path: ?token_hash=...&type=email (or type=signup)
          const { error } = await supabase.auth.verifyOtp({
            token_hash: tokenHash,
            type: "email",
          });
          if (error) throw error;
        } else if (code) {
          // PKCE flow path: ?code=...  (default for newer Supabase projects)
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
        } else {
          // Implicit / hash flow: access_token is in URL fragment, Supabase reads it
          const { data } = await supabase.auth.getSession();
          if (!data.session) {
            throw new Error("No verification token found in the link. It may have expired.");
          }
        }

        // Email is now verified in Supabase. Sign out of the Supabase session because
        // our app uses its own session system and admin approval is still required.
        await supabase.auth.signOut();

        setStatus("success");
        // Auto-redirect to login after 4 seconds
        window.setTimeout(() => navigate("/login", { replace: true }), 4000);
      } catch (err) {
        setErrorMsg(
          err instanceof Error
            ? err.message
            : "Verification failed. The link may have expired.",
        );
        setStatus("error");
      }
    };

    void run();
  }, [navigate, search]);

  return (
    <div className="relative flex min-h-[calc(100vh-64px)] items-center justify-center p-6 overflow-hidden">
      <div className="absolute inset-0 gradient-hero" />
      <div className="absolute inset-0 dot-grid opacity-20" />
      <div className="absolute -top-40 -right-40 h-[500px] w-[500px] rounded-full bg-primary/10 blur-3xl" />
      <div className="absolute -bottom-40 -left-40 h-[500px] w-[500px] rounded-full bg-accent/10 blur-3xl" />

      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="relative z-10 w-full max-w-md"
      >
        <div className="glass rounded-3xl p-8 text-center shadow-2xl">
          {/* Brand */}
          <div className="mb-8 flex items-center justify-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl gradient-primary shadow-glow">
              <Bus className="h-5 w-5 text-white" strokeWidth={2.5} />
            </div>
            <span className="font-display text-base font-bold tracking-tight">Transporter</span>
          </div>

          {/* Loading state */}
          {status === "loading" && (
            <motion.div
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="space-y-4"
            >
              <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-3xl bg-primary/10">
                <Loader2 className="h-10 w-10 animate-spin text-primary" />
              </div>
              <h2 className="font-display text-2xl font-bold">Verifying your email</h2>
              <p className="text-sm text-muted-foreground">
                Confirming your email address with Supabase…
              </p>
            </motion.div>
          )}

          {/* Success state */}
          {status === "success" && (
            <motion.div
              key="success"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="space-y-4"
            >
              <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-3xl bg-green-500/15">
                <CheckCircle className="h-10 w-10 text-green-400" strokeWidth={1.5} />
              </div>
              <h2 className="font-display text-2xl font-bold text-green-400">Email verified!</h2>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Your email address is confirmed. Your account is pending admin approval — you'll
                be able to sign in once approved.
              </p>

              <div className="rounded-2xl border border-green-500/20 bg-green-500/8 px-4 py-3 text-xs text-green-300/80 leading-relaxed">
                Redirecting to sign in automatically in a few seconds…
              </div>

              <Link
                to="/login"
                className="flex w-full items-center justify-center gap-2 rounded-2xl gradient-primary py-3 text-sm font-bold text-white shadow-glow transition-all hover:opacity-90 active:scale-[0.98]"
              >
                Sign In Now
                <ArrowRight className="h-4 w-4" />
              </Link>
            </motion.div>
          )}

          {/* Error state */}
          {status === "error" && (
            <motion.div
              key="error"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="space-y-4"
            >
              <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-3xl bg-red-500/15">
                <XCircle className="h-10 w-10 text-red-400" strokeWidth={1.5} />
              </div>
              <h2 className="font-display text-2xl font-bold text-red-400">Verification failed</h2>
              <p className="text-sm text-muted-foreground leading-relaxed">{errorMsg}</p>

              <div className="rounded-2xl border border-red-500/20 bg-red-500/8 px-4 py-3 text-xs text-red-300/80 leading-relaxed">
                Links expire after 24 hours. If this is an old link, sign up again or request a new
                verification email from the sign-in page.
              </div>

              <div className="space-y-2">
                <Link
                  to="/signup"
                  className="flex w-full items-center justify-center gap-2 rounded-2xl gradient-primary py-3 text-sm font-bold text-white shadow-glow transition-all hover:opacity-90 active:scale-[0.98]"
                >
                  <Mail className="h-4 w-4" />
                  Back to Sign Up
                </Link>
                <Link
                  to="/login"
                  className="flex w-full items-center justify-center gap-2 rounded-2xl border border-border/60 bg-surface/80 py-3 text-sm font-semibold transition-all hover:border-primary/40 hover:bg-primary/5"
                >
                  Sign In
                </Link>
              </div>
            </motion.div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
