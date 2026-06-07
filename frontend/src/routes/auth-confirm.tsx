import { useCallback, useEffect, useRef, useState } from "react";
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
  // Prevents double-settling if both onAuthStateChange and getSession fire
  const settledRef = useRef(false);

  const succeed = useCallback(async () => {
    if (settledRef.current) return;
    settledRef.current = true;
    try { await supabase.auth.signOut(); } catch { /* ignore */ }
    setStatus("success");
    window.setTimeout(() => navigate("/login", { replace: true }), 4000);
  }, [navigate]);

  const fail = useCallback((msg: string) => {
    if (settledRef.current) return;
    settledRef.current = true;
    setErrorMsg(msg);
    setStatus("error");
  }, []);

  // Listen for Supabase processing the URL token (PKCE ?code= or implicit #access_token=).
  // detectSessionInUrl: true means the SDK fires SIGNED_IN automatically after exchange.
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" && session) void succeed();
    });
    return () => subscription.unsubscribe();
  }, [succeed]);

  // One-time effect: validate URL and handle token_hash flow (OTP, no PKCE needed).
  // Also fires an immediate getSession check as a fallback race-condition guard.
  const ran = useRef(false);
  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    const params = new URLSearchParams(search);
    const tokenHash = params.get("token_hash");
    const code = params.get("code");
    const hashToken = new URLSearchParams(window.location.hash.slice(1)).get("access_token");

    if (!tokenHash && !code && !hashToken) {
      fail("No verification token found in this link. It may have expired.");
      return;
    }

    if (tokenHash) {
      // OTP / token-hash path — no PKCE code verifier needed, works cross-device.
      supabase.auth.verifyOtp({ token_hash: tokenHash, type: "email" })
        .then(({ error }) => error ? fail(error.message) : void succeed())
        .catch((err) => fail(err instanceof Error ? err.message : "Verification failed."));
      return;
    }

    // PKCE code or implicit hash path — Supabase processes automatically via
    // detectSessionInUrl: true. Check immediately in case it already resolved
    // before our onAuthStateChange listener was registered.
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) void succeed();
    });

    // Timeout: if Supabase never fires SIGNED_IN after 14 s, show a helpful error.
    const timeoutId = window.setTimeout(() => {
      fail(
        code
          ? "Verification failed. If you opened this link on a different device or browser than where you signed up, please reopen it in the original browser (PKCE requirement)."
          : "Verification timed out. The link may have expired — please request a new one.",
      );
    }, 14000);

    return () => window.clearTimeout(timeoutId);
  }, [search, succeed, fail]);

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
