"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, CheckCircle2, Circle, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { TaskRow } from "@/lib/queries";
import { deleteTask, toggleTask } from "@/lib/actions/tasks";
import { formatDate } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface TaskListProps {
  tasks: TaskRow[];
  /** Compact mode (contact page): hide assignee column. */
  compact?: boolean;
}

export function TaskList({ tasks, compact }: TaskListProps) {
  const router = useRouter();
  const [busyId, setBusyId] = React.useState<string | null>(null);

  const toggle = async (task: TaskRow) => {
    setBusyId(task.id);
    const result = await toggleTask(task.id);
    setBusyId(null);
    if (result.ok) {
      toast.success(result.data.status === "DONE" ? "Task completed" : "Task reopened");
      router.refresh();
    } else {
      toast.error(result.error);
    }
  };

  const remove = async (task: TaskRow) => {
    setBusyId(task.id);
    const result = await deleteTask(task.id);
    setBusyId(null);
    if (result.ok) {
      toast.success("Task deleted");
      router.refresh();
    } else {
      toast.error(result.error);
    }
  };

  if (tasks.length === 0) {
    return <p className="py-6 text-center text-sm text-muted-foreground">No tasks yet.</p>;
  }

  return (
    <ul className="space-y-2">
      {tasks.map((task) => {
        const overdue = task.overdue;
        return (
          <li
            key={task.id}
            className={cn(
              "flex items-center gap-3 rounded-lg border p-3",
              task.status === "DONE" && "opacity-60"
            )}
          >
            <Button
              variant="ghost"
              size="icon"
              className="size-8 shrink-0"
              aria-label={task.status === "OPEN" ? "Mark done" : "Reopen"}
              disabled={busyId === task.id}
              onClick={() => void toggle(task)}
            >
              {busyId === task.id ? (
                <Loader2 className="size-4 animate-spin" />
              ) : task.status === "DONE" ? (
                <CheckCircle2 className="size-4 text-emerald-500" />
              ) : (
                <Circle className="size-4 text-muted-foreground" />
              )}
            </Button>

            <div className="min-w-0 flex-1">
              <p className={cn("truncate text-sm font-medium", task.status === "DONE" && "line-through")}>
                {task.title}
              </p>
              <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                <span className={cn("flex items-center gap-1", overdue && "font-medium text-red-500")}>
                  <CalendarClock className="size-3" />
                  {overdue ? "Overdue · " : ""}
                  {formatDate(task.dueDate)}
                </span>
                {task.contactName ? <span>{task.contactName}</span> : null}
                {task.dealTitle ? <span>{task.dealTitle}</span> : null}
                {!compact ? <Badge variant="outline">{task.assigneeName}</Badge> : null}
              </p>
            </div>

            <Button
              variant="ghost"
              size="icon"
              className="size-8 shrink-0 text-muted-foreground hover:text-destructive"
              aria-label={`Delete ${task.title}`}
              disabled={busyId === task.id}
              onClick={() => void remove(task)}
            >
              <Trash2 className="size-4" />
            </Button>
          </li>
        );
      })}
    </ul>
  );
}
