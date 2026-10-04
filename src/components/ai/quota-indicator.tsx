import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

interface QuotaIndicatorProps {
  model: string;
  used: number;
  limit: number;
  remaining: number;
  /** True when the model has no AI_TOKEN_BUDGETS entry - no honest number exists. */
  unknown?: boolean;
  className?: string;
}

/**
 * Shared budget affordance rendered on every AI surface. Shows the PRIMARY
 * model's token budget: "182,340 / 180,000 tokens today". If the model has no
 * configured budget the indicator says "quota unknown" rather than a fake
 * number.
 */
export function QuotaIndicator({ model, used, limit, remaining, unknown, className }: QuotaIndicatorProps) {
  const low = !unknown && remaining <= limit * 0.25;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs tabular-nums",
        low ? "border-amber-500/40 text-amber-600 dark:text-amber-400" : "text-muted-foreground",
        className
      )}
      title={`AI model: ${model}. Rolling 24h window, input + output tokens.`}
    >
      <Sparkles className={cn("size-3", low && "text-amber-500")} />
      {unknown
        ? `quota unknown (${model})`
        : `${used.toLocaleString("en-US")} / ${limit.toLocaleString("en-US")} tokens today`}
    </span>
  );
}
