"use client";

import * as React from "react";
import { Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

interface AiActionButtonProps {
  label: string;
  /** Server action returning an ActionResult — invoked on click only. */
  action: () => Promise<{ ok: boolean; error?: string }>;
  onSuccess?: (data: unknown) => void;
  /** Remaining daily requests; 0 disables the button before any call. */
  remaining?: number;
  disabled?: boolean;
  className?: string;
}

/**
 * The ONLY way AI surfaces may trigger a model call: an explicit user click.
 * Shows pending state (aria-busy), disables itself when quota is exhausted,
 * and surfaces failures as toasts — quota messages arrive pre-formatted with
 * the honest reset time from the quota layer.
 */
export function AiActionButton({
  label,
  action,
  onSuccess,
  remaining,
  disabled,
  className,
}: AiActionButtonProps) {
  const [pending, startTransition] = React.useTransition();
  const exhausted = remaining !== undefined && remaining <= 0;

  const run = () => {
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        toast.error(result.error ?? "AI request failed");
        return;
      }
      if (onSuccess) onSuccess(result);
    });
  };

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className={className}
      onClick={run}
      disabled={disabled || pending || exhausted}
      aria-busy={pending}
      title={exhausted ? "Daily AI limit reached — resets within 24h" : undefined}
    >
      {pending ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
      {exhausted ? "AI limit reached" : label}
    </Button>
  );
}
