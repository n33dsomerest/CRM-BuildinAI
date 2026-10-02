"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useForm, useWatch, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { CalendarPlus, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { taskSchema } from "@/lib/validations";
import { createTask } from "@/lib/actions/tasks";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export interface TaskFormValues {
  title: string;
  dueDate: string;
  contactId: string;
  dealId: string;
  assigneeId: string;
}

interface CreateTaskDialogProps {
  users: { id: string; name: string }[];
  isAdmin: boolean;
}

export function CreateTaskDialog({ users, isAdmin }: CreateTaskDialogProps) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [serverError, setServerError] = React.useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    control,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<TaskFormValues>({
    resolver: zodResolver(taskSchema) as unknown as Resolver<TaskFormValues>,
    defaultValues: { title: "", dueDate: "", contactId: "", dealId: "", assigneeId: "" },
  });

  const assigneeId = useWatch({ control, name: "assigneeId" });

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    const result = await createTask(values);
    if (result.ok) {
      toast.success("Task created");
      reset();
      setOpen(false);
      router.refresh();
    } else {
      setServerError(result.error);
    }
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button>
          <CalendarPlus className="size-4" /> New task
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New task</DialogTitle>
          <DialogDescription>A follow-up assigned to you.</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="task-title">What needs to happen?</Label>
            <Input id="task-title" placeholder="Send proposal to Acme" {...register("title")} />
            {errors.title ? <p className="text-xs text-destructive">{errors.title.message}</p> : null}
          </div>
          <div className="grid gap-2">
            <Label htmlFor="task-due">Due date</Label>
            <Input id="task-due" type="date" {...register("dueDate")} />
            {errors.dueDate ? <p className="text-xs text-destructive">{errors.dueDate.message}</p> : null}
          </div>
          {isAdmin ? (
            <div className="grid gap-2">
              <Label>Assign to</Label>
              <Select
                value={assigneeId || ""}
                onValueChange={(value) => setValue("assigneeId", value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Yourself" />
                </SelectTrigger>
                <SelectContent>
                  {users.map((user) => (
                    <SelectItem key={user.id} value={user.id}>
                      {user.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">Leave empty to assign it to yourself.</p>
            </div>
          ) : null}
          {serverError ? <p className="text-sm text-destructive">{serverError}</p> : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="size-4 animate-spin" /> : null}
              Create task
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
