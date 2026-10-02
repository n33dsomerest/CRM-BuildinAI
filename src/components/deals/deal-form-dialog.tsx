"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useForm, useWatch, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { DealCard } from "@/lib/queries";
import { dealSchema } from "@/lib/validations";
import { deleteDeal, saveDeal } from "@/lib/actions/deals";
import { ConfirmDeleteDialog } from "@/components/confirm-delete-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export interface DealFormValues {
  title: string;
  value: string;
  stageId: string;
  accountId: string;
  contactId: string;
  ownerId: string;
  expectedCloseDate: string;
}

interface UsersOption {
  id: string;
  name: string;
  email: string;
  role: "ADMIN" | "SALES";
}

interface StagesOption {
  id: string;
  name: string;
  order: number;
  probability: number;
  isWon: boolean;
  isLost: boolean;
}

interface DealFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Deal being edited, or null for a new deal. */
  initial: DealCard | null;
  /** Preselected stage for new deals (column "+ add" buttons). */
  defaultStageId?: string;
  stages: StagesOption[];
  users: UsersOption[];
  accounts: { id: string; name: string }[];
  contacts: { id: string; name: string; accountId: string }[];
  currentUserId: string;
  isAdmin: boolean;
}

export function DealFormDialog({ open, onOpenChange, ...inner }: DealFormDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Mounted only while open → the form remounts fresh every time (no reset effects) */}
      {open ? <DealFormInner onOpenChange={onOpenChange} {...inner} /> : null}
    </Dialog>
  );
}

function DealFormInner({
  onOpenChange,
  initial,
  defaultStageId,
  stages,
  users,
  accounts,
  contacts,
  currentUserId,
  isAdmin,
}: Omit<DealFormDialogProps, "open">) {
  const router = useRouter();
  const [serverError, setServerError] = React.useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const [pendingDelete, startDelete] = React.useTransition();

  const initialAccountId = initial ? contacts.find((c) => c.id === initial.contactId)?.accountId ?? "" : "";

  const {
    register,
    handleSubmit,
    setValue,
    control,
    formState: { errors, isSubmitting },
  } = useForm<DealFormValues>({
    resolver: zodResolver(dealSchema) as unknown as Resolver<DealFormValues>,
    defaultValues: initial
      ? {
          title: initial.title,
          value: String(initial.value),
          stageId: initial.stageId,
          accountId: initialAccountId,
          contactId: initial.contactId,
          ownerId: initial.ownerId,
          expectedCloseDate: initial.expectedCloseDate ? initial.expectedCloseDate.toISOString().slice(0, 10) : "",
        }
      : {
          title: "",
          value: "",
          stageId: defaultStageId ?? stages[0]?.id ?? "",
          accountId: "",
          contactId: "",
          ownerId: currentUserId,
          expectedCloseDate: "",
        },
  });

  const stageId = useWatch({ control, name: "stageId" });
  const accountId = useWatch({ control, name: "accountId" });
  const ownerId = useWatch({ control, name: "ownerId" });
  const contactId = useWatch({ control, name: "contactId" });
  const accountContacts = contacts.filter((contact) => contact.accountId === accountId);

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    const result = await saveDeal(values, initial?.id);
    if (result.ok) {
      toast.success(initial ? "Deal updated" : "Deal created");
      onOpenChange(false);
      router.refresh();
    } else {
      setServerError(result.error);
    }
  });

  const handleDelete = () => {
    if (!initial) return;
    startDelete(async () => {
      const result = await deleteDeal(initial.id);
      if (result.ok) {
        toast.success(`Deleted ${initial.title}`);
        setConfirmDelete(false);
        onOpenChange(false);
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  };

  return (
    <>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{initial ? "Edit deal" : "New deal"}</DialogTitle>
            <DialogDescription>
              {initial
                ? "Update value, stage or close date."
                : "Pick an account and contact, then set the opening value."}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={onSubmit} className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="deal-title">Title</Label>
              <Input id="deal-title" placeholder="Cloud Migration Phase 1" {...register("title")} />
              {errors.title ? <p className="text-xs text-destructive">{errors.title.message}</p> : null}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="deal-value">Value (USD)</Label>
                <Input id="deal-value" type="number" min="1" placeholder="50000" {...register("value")} />
                {errors.value ? <p className="text-xs text-destructive">{errors.value.message}</p> : null}
              </div>
              <div className="grid gap-2">
                <Label htmlFor="deal-close">Expected close</Label>
                <Input id="deal-close" type="date" {...register("expectedCloseDate")} />
                {errors.expectedCloseDate ? (
                  <p className="text-xs text-destructive">{errors.expectedCloseDate.message}</p>
                ) : null}
              </div>
            </div>

            <div className="grid gap-2">
              <Label>Stage</Label>
              <Select value={stageId} onValueChange={(value) => setValue("stageId", value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select stage" />
                </SelectTrigger>
                <SelectContent>
                  {stages.map((stage) => (
                    <SelectItem key={stage.id} value={stage.id}>
                      {stage.name} · {stage.probability}%
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.stageId ? <p className="text-xs text-destructive">{errors.stageId.message}</p> : null}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label>Account</Label>
                <Select
                  value={accountId}
                  onValueChange={(value) => {
                    setValue("accountId", value);
                    setValue("contactId", "");
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select account" />
                  </SelectTrigger>
                  <SelectContent>
                    {accounts.map((account) => (
                      <SelectItem key={account.id} value={account.id}>
                        {account.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.accountId ? <p className="text-xs text-destructive">{errors.accountId.message}</p> : null}
              </div>
              <div className="grid gap-2">
                <Label>Contact</Label>
                <Select value={contactId || ""} onValueChange={(value) => setValue("contactId", value)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select contact" />
                  </SelectTrigger>
                  <SelectContent>
                    {accountContacts.map((contact) => (
                      <SelectItem key={contact.id} value={contact.id}>
                        {contact.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.contactId ? <p className="text-xs text-destructive">{errors.contactId.message}</p> : null}
                {accountId && accountContacts.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No contacts at this account yet.</p>
                ) : null}
              </div>
            </div>

            {isAdmin ? (
              <div className="grid gap-2">
                <Label>Owner</Label>
                <Select value={ownerId} onValueChange={(value) => setValue("ownerId", value)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select owner" />
                  </SelectTrigger>
                  <SelectContent>
                    {users.map((user) => (
                      <SelectItem key={user.id} value={user.id}>
                        {user.name} ({user.role.toLowerCase()})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.ownerId ? <p className="text-xs text-destructive">{errors.ownerId.message}</p> : null}
              </div>
            ) : null}

            {serverError ? <p className="text-sm text-destructive">{serverError}</p> : null}

            <DialogFooter className="sm:justify-between">
              {initial ? (
                <Button
                  type="button"
                  variant="ghost"
                  className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                  onClick={() => setConfirmDelete(true)}
                >
                  <Trash2 className="size-4" /> Delete
                </Button>
              ) : (
                <span />
              )}
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting ? <Loader2 className="size-4 animate-spin" /> : null}
                  {initial ? "Save changes" : "Create deal"}
                </Button>
              </div>
            </DialogFooter>
          </form>
      </DialogContent>

      <ConfirmDeleteDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`Delete ${initial?.title ?? ""}?`}
        description="Activities and tasks linked to this deal will stay, but lose the deal reference."
        onConfirm={handleDelete}
        pending={pendingDelete}
      />
    </>
  );
}
