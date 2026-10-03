import { Sparkles } from "lucide-react";
import { DAILY_QUOTA } from "@/lib/ai/quota-policy";
import { cn } from "@/lib/utils";

/**
 * Shared "N / 20 remaining" affordance rendered on every AI surface so the
 * per-user budget is always visible before it is spent.
 */
export function QuotaIndicator({ remaining, className }: { remaining: number; className?: string }) {
  const low = remaining <= 5;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs tabular-nums",
        low ? "border-amber-500/40 text-amber-600 dark:text-amber-400" : "text-muted-foreground",
        className
      )}
      title={`AI requests used today: ${DAILY_QUOTA - remaining} of ${DAILY_QUOTA}. Rolling 24h window.`}
    >
      <Sparkles className={cn("size-3", low && "text-amber-500")} />
      {remaining}/{DAILY_QUOTA} AI left today
    </span>
  );
}
