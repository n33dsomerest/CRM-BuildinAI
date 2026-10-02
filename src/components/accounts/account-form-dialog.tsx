"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useForm, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { accountSchema } from "@/lib/validations";
import { deleteAccount, saveAccount, updateAccount } from "@/lib/actions/accounts";
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

export interface AccountFormValues {
  name: string;
  industry: string;
  website: string;
  phone: string;
}

interface AccountFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Account being edited, or null to create a new one. */
  initial: AccountFormValues | null;
  editingId: string | null;
}

const defaults: AccountFormValues = { name: "", industry: "", website: "", phone: "" };

export function AccountFormDialog({ open, onOpenChange, initial, editingId }: AccountFormDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Mounted only while open → the form remounts fresh every time (no reset effects) */}
      {open ? <AccountFormInner onOpenChange={onOpenChange} initial={initial} editingId={editingId} /> : null}
    </Dialog>
  );
}

function AccountFormInner({
  onOpenChange,
  initial,
  editingId,
}: Omit<AccountFormDialogProps, "open">) {
  const router = useRouter();
  const [serverError, setServerError] = React.useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const [pendingDelete, startDelete] = React.useTransition();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<AccountFormValues>({
    resolver: zodResolver(accountSchema) as unknown as Resolver<AccountFormValues>,
    defaultValues: initial ?? defaults,
  });

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    const result = editingId ? await updateAccount(editingId, values) : await saveAccount(values);
    if (result.ok) {
      toast.success(editingId ? "Account updated" : "Account created");
      onOpenChange(false);
      router.refresh();
    } else {
      setServerError(result.error);
    }
  });

  const handleDelete = () => {
    if (!editingId) return;
    startDelete(async () => {
      const result = await deleteAccount(editingId);
      if (result.ok) {
        toast.success("Account deleted");
        setConfirmDelete(false);
        onOpenChange(false);
        router.push("/accounts");
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  };

  return (
    <>
      <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit account" : "New account"}</DialogTitle>
            <DialogDescription>
              {editingId ? "Update the company details." : "A company that holds your contacts and deals."}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={onSubmit} className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="account-name">Company name</Label>
              <Input id="account-name" placeholder="Acme Corp" {...register("name")} />
              {errors.name ? <p className="text-xs text-destructive">{errors.name.message}</p> : null}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="account-industry">Industry</Label>
                <Input id="account-industry" placeholder="Technology" {...register("industry")} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="account-phone">Phone</Label>
                <Input id="account-phone" placeholder="+1 555-0100" {...register("phone")} />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="account-website">Website</Label>
              <Input id="account-website" placeholder="https://acme.com" {...register("website")} />
            </div>
            {serverError ? <p className="text-sm text-destructive">{serverError}</p> : null}
            <DialogFooter className="sm:justify-between">
              {editingId ? (
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
                  {editingId ? "Save changes" : "Create account"}
                </Button>
              </div>
            </DialogFooter>
          </form>
      </DialogContent>

      <ConfirmDeleteDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`Delete ${initial?.name ?? "account"}?`}
        description="This cascades: the account's contacts, their deals, activities and tasks are deleted too."
        onConfirm={handleDelete}
        pending={pendingDelete}
      />
    </>
  );
}
