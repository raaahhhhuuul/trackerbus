import { cn } from "@/lib/utils";
import { CheckCircle2, AlertTriangle, Radio, CircleSlash } from "lucide-react";
import type { ReactNode } from "react";

type Status = "active" | "delayed" | "arrived" | "inactive";

const config: Record<Status, { label: string; classes: string; icon: ReactNode }> = {
  active: {
    label: "On Route",
    classes: "bg-success/15 text-success border-success/30",
    icon: <Radio className="h-3 w-3" />,
  },
  delayed: {
    label: "Delayed",
    classes: "bg-warning/20 text-warning-foreground border-warning/40",
    icon: <AlertTriangle className="h-3 w-3" />,
  },
  arrived: {
    label: "Arrived",
    classes: "bg-primary/15 text-primary border-primary/30",
    icon: <CheckCircle2 className="h-3 w-3" />,
  },
  inactive: {
    label: "Offline",
    classes: "bg-muted text-muted-foreground border-border",
    icon: <CircleSlash className="h-3 w-3" />,
  },
};

export function StatusBadge({ status, className }: { status: Status; className?: string }) {
  const c = config[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide",
        c.classes,
        className,
      )}
    >
      {status === "active" && (
        <span className="relative flex h-1.5 w-1.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-75" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-success" />
        </span>
      )}
      {status !== "active" && c.icon}
      {c.label}
    </span>
  );
}
