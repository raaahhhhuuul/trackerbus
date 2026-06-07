import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { Bus, Mail, RefreshCw, ArrowRight, Loader2 } from "lucide-react";
import { resendVerificationEmail } from "@/lib/auth";
import { toast } from "sonner";

export function VerifyEmailPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const email = params.get("email") ?? "";
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  const handleResend = async () => {
    if (!email || resending || cooldown > 0) return;
    setResending(true);
    try {
      await resendVerificationEmail(email);
      setResent(true);
      toast.success("Verification email sent", {
        description: `Check ${email} for a new link.`,
      });
      // 60s cooldown to avoid spam
      setCooldown(60);
      const interval = window.setInterval(() => {
        setCooldown((n) => {
          if (n <= 1) { window.clearInterval(interval); return 0; }
          return n - 1;
        });
      }, 1000);
    } catch (err) {
      toast.error("Failed to resend", {
        description: err instanceof Error ? err.message : "Please try again.",
      });
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="relative flex min-h-[calc(100vh-64px)] items-center justify-center p-6 overflow-hidden">
      <div className="absolute inset-0 gradient-hero" />
      <div className="absolute inset-0 dot-grid opacity-20" />
      <div className="absolute -top-32 -left-32 h-96 w-96 rounded-full bg-primary/15 blur-3xl" />
      <div className="absolute -bottom-32 -right-32 h-96 w-96 rounded-full bg-accent/15 blur-3xl" />

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="relative z-10 w-full max-w-md"
      >
        <div className="glass rounded-3xl p-8 text-center shadow-2xl">
          {/* Icon */}
          <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-3xl gradient-primary shadow-glow float-y">
            <Mail className="h-10 w-10 text-white" strokeWidth={1.5} />
          </div>

          <h1 className="font-display text-3xl font-bold">Check your inbox</h1>
          <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
            We sent a verification link to
          </p>
          {email && (
            <p className="mt-1 text-base font-bold text-primary break-all">{email}</p>
          )}
          <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
            Click the link in the email to verify your address. After that, wait for admin
            approval — you'll be able to sign in once approved.
          </p>

          {/* Steps */}
          <div className="mt-6 space-y-2.5 text-left">
            {[
              { num: "1", text: "Check your email for a verification link" },
              { num: "2", text: "Click the link to confirm your address" },
              { num: "3", text: "Wait for admin to approve your account" },
              { num: "4", text: "Sign in and start tracking" },
            ].map((step) => (
              <div key={step.num} className="flex items-center gap-3 rounded-xl bg-surface/60 px-4 py-2.5">
                <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-primary/20 text-xs font-bold text-primary">
                  {step.num}
                </span>
                <span className="text-sm text-muted-foreground">{step.text}</span>
              </div>
            ))}
          </div>

          {/* Actions */}
          <div className="mt-7 space-y-3">
            {email && (
              <button
                type="button"
                onClick={handleResend}
                disabled={resending || cooldown > 0}
                className="flex w-full items-center justify-center gap-2 rounded-2xl border border-border/60 bg-surface/80 py-3 text-sm font-semibold transition-all hover:border-primary/40 hover:bg-primary/5 disabled:opacity-50"
              >
                {resending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
                {cooldown > 0
                  ? `Resend in ${cooldown}s`
                  : resent
                  ? "Resend again"
                  : "Resend verification email"}
              </button>
            )}

            <button
              type="button"
              onClick={() => navigate("/login")}
              className="flex w-full items-center justify-center gap-2 rounded-2xl gradient-primary py-3 text-sm font-bold text-white shadow-glow transition-all hover:opacity-90 active:scale-[0.98]"
            >
              Go to Sign In
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>

          {/* Brand footer */}
          <div className="mt-6 flex items-center justify-center gap-2 text-xs text-muted-foreground">
            <Bus className="h-3.5 w-3.5" />
            <span>Transporter · Transit Command</span>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
