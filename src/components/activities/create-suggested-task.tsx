"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Plus, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { createTask, deleteTask } from "@/lib/actions/tasks";
import { Button } from "@/components/ui/button";

interface CreateSuggestedTaskProps {
  /** Short title proposed by the summarizer. */
  title: string;
  contactId: string;
  dealId: string | null;
}

/** YYYY-MM-DD, one day out, in the viewer's local time. */
function tomorrow(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${month}-${day}`;
}

/**
 * Turns the summarizer's `suggestedTask` into a real task in one click.
 *
 * Reuses the existing createTask / deleteTask actions rather than a bespoke
 * endpoint, so the task inherits the same scoping, Zod validation, audit
 * trail and revalidation that every other task in the app gets. Undo is a real
 * delete rather than an optimistic local state, so the two can never disagree.
 */
export function CreateSuggestedTask({ title, contactId, dealId }: CreateSuggestedTaskProps) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  const [created, setCreated] = React.useState<{ id: string; title: string } | null>(null);

  const trimmed = title.trim();
  if (!trimmed) return null;

  const handleCreate = async () => {
    setPending(true);
    const result = await createTask({
      title: trimmed,
      dueDate: tomorrow(),
      contactId,
      ...(dealId ? { dealId } : {}),
    });
    setPending(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    setCreated({ id: result.data.id, title: trimmed });
    toast.success("Task created");
    router.refresh();
  };

  const handleUndo = async () => {
    if (!created) return;
    setPending(true);
    const result = await deleteTask(created.id);
    setPending(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    setCreated(null);
    toast.success("Task removed");
    router.refresh();
  };

  return (
    <div className="mt-1 flex flex-wrap items-center gap-2">
      {created ? (
        <>
          <span className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
            <Check className="size-3" /> Task created: {created.title}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-xs"
            onClick={() => void handleUndo()}
            disabled={pending}
            aria-busy={pending}
          >
            {pending ? <Loader2 className="size-3 animate-spin" /> : <Undo2 className="size-3" />}
            Undo
          </Button>
        </>
      ) : (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-6 px-2 text-xs"
          onClick={() => void handleCreate()}
          disabled={pending}
          aria-busy={pending}
        >
          {pending ? <Loader2 className="size-3 animate-spin" /> : <Plus className="size-3" />}
          Create as task
        </Button>
      )}
    </div>
  );
}