import { Sparkles, Users } from "lucide-react";
import { cn } from "@/lib/utils";

interface QuotaIndicatorProps {
  model: string;
  /** Shared (whole team, per API key) figures - the headline. */
  sharedUsed: number;
  sharedLimit: number;
  sharedRemaining: number;
  /** Personal fairness-share figures - secondary, when configured. */
  userUsed?: number;
  userLimit?: number;
  /** True when the model has no AI_TOKEN_BUDGETS entry - no honest number exists. */
  unknown?: boolean;
  className?: string;
}

/**
 * Shared budget affordance rendered on every AI surface. The gateway quota is
 * per API KEY, so the headline is the TEAM figure; the personal fairness share
 * (when AI_USER_TOKEN_SHARE is configured) is shown secondarily. Unknown
 * budgets say "quota unknown" rather than a fake number.
 */
export function QuotaIndicator({
  model,
  sharedUsed,
  sharedLimit,
  sharedRemaining,
  userUsed,
  userLimit,
  unknown,
  className,
}: QuotaIndicatorProps) {
  const low = !unknown && sharedRemaining <= sharedLimit * 0.25;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs tabular-nums",
        low ? "border-amber-500/40 text-amber-600 dark:text-amber-400" : "text-muted-foreground",
        className
      )}
      title={`AI model: ${model}. Rolling 24h window, input + output tokens, shared across the team's API key.`}
    >
      <Users className={cn("size-3", low && "text-amber-500")} />
      {unknown
        ? `quota unknown (${model})`
        : `Team: ${sharedUsed.toLocaleString("en-US")} / ${sharedLimit.toLocaleString("en-US")} tokens today`}
      {userLimit !== undefined && userLimit > 0 ? (
        <span className="border-l pl-1.5 border-border">
          You: {(userUsed ?? 0).toLocaleString("en-US")} / {userLimit.toLocaleString("en-US")}
        </span>
      ) : null}
    </span>
  );
}
