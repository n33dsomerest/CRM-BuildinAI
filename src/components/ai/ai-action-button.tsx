"use client";

import * as React from "react";
import { Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { ActionResult } from "@/lib/action-result";

interface AiActionButtonProps<T> {
  label: string;
  /**
   * Invoked on click only - an explicit user action. Return an ActionResult
   * to get the shared toast-on-failure behaviour (quota messages arrive
   * pre-formatted with the honest reset time from the quota layer) and hand
   * the resolved result to onSuccess. Return nothing for buttons that merely
   * open a surface (the actual call runs elsewhere).
   */
  onClick: () => ActionResult<T> | void | Promise<ActionResult<T> | void>;
  onSuccess?: (result: { ok: true; data: T }) => void;
  /** Controlled pending state - pass it when progress is shown elsewhere
   *  (e.g. a dialog spinner); otherwise the button tracks its own transition. */
  pending?: boolean;
  /** Why the button cannot run right now (quota exhausted, unconfigured, input
   *  too short, ...) - announced and shown on hover instead of just going grey. */
  disabledReason?: string;
  variant?: "outline" | "secondary" | "ghost" | "default";
  icon?: React.ReactNode;
  className?: string;
}

/**
 * The ONLY way AI surfaces may trigger a model call: an explicit user click
 * through this button. Pending state (aria-busy), disable-with-reason and
 * toast-on-failure all live here so quota messaging cannot drift per surface.
 */
export function AiActionButton<T = unknown>({
  label,
  onClick,
  onSuccess,
  pending: controlledPending,
  disabledReason,
  variant = "outline",
  icon,
  className,
}: AiActionButtonProps<T>) {
  const [transitionPending, startTransition] = React.useTransition();
  const pending = controlledPending ?? transitionPending;

  const run = () => {
    if (controlledPending !== undefined) {
      void runOutcome();
    } else {
      startTransition(async () => {
        await runOutcome();
      });
    }
  };

  const runOutcome = async () => {
    const result = await onClick();
    if (!result) return;
    if (!result.ok) {
      toast.error(result.error ?? "AI request failed");
      return;
    }
    if (onSuccess) onSuccess(result);
  };

  return (
    <Button
      type="button"
      variant={variant}
      size="sm"
      className={className}
      onClick={run}
      disabled={pending || disabledReason !== undefined}
      aria-busy={pending}
      title={disabledReason}
    >
      {pending ? <Loader2 className="size-4 animate-spin" /> : (icon ?? <Sparkles className="size-4" />)}
      {label}
    </Button>
  );
}
