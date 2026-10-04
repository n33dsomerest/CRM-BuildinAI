"use client";

import * as React from "react";
import { Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { getLeadScoringBatchPreview, scoreLeadsBatch } from "@/lib/actions/ai";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

interface BatchScoreDialogProps {
  aiConfigured: boolean;
  onScored: () => void;
}

interface BatchPreviewData {
  eligible: number;
  willScore: number;
}

/**
 * "Score all new leads" with the cost preview the plan requires: the dialog
 * shows exactly how many of the daily requests the batch will use (already
 * capped at the remaining quota server-side) and requires explicit
 * confirmation before anything runs.
 */
export function BatchScoreDialog({ aiConfigured, onScored }: BatchScoreDialogProps) {
  const [open, setOpen] = React.useState(false);
  const [preview, setPreview] = React.useState<BatchPreviewData | null>(null);
  const [pending, startTransition] = React.useTransition();

  const loadPreview = async () => {
    const result = await getLeadScoringBatchPreview();
    if (!result.ok) {
      toast.error(result.error);
      return false;
    }
    setPreview(result.data);
    return true;
  };

  const run = () => {
    startTransition(async () => {
      const result = await scoreLeadsBatch();
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(`Scored ${result.data.scored} of ${result.data.requested} leads`);
      setOpen(false);
      onScored();
    });
  };

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) void loadPreview();
      }}
    >
      <AlertDialogTrigger asChild>
        <Button variant="outline" disabled={!aiConfigured} title={aiConfigured ? undefined : "AI is not configured"}>
          <Sparkles className="size-4" /> Score new leads
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Score all new leads</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2">
              {!preview ? (
                <span>Loading preview…</span>
              ) : (
                <>
                  <p>
                    This will score <strong>{preview.willScore}</strong> of {preview.eligible} eligible lead(s).
                  </p>
                  <p className="text-xs">
                    Each score uses the first available model in the fallback chain and consumes that
                    model&apos;s daily token budget. Scoring stops cleanly if every model&apos;s budget runs out.
                    Scores are AI suggestions with reasons - always review them.
                  </p>
                </>
              )}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={pending || !preview || preview.willScore === 0}
            onClick={(event) => {
              event.preventDefault();
              run();
            }}
          >
            {pending ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
            Score {preview?.willScore ?? 0} lead(s)
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
