"use client";

import * as React from "react";
import { useForm, useWatch, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { contactSchema } from "@/lib/validations";
import { saveContact } from "@/lib/actions/contacts";
import { saveAccount } from "@/lib/actions/accounts";
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

export interface ContactFormValues {
  name: string;
  email: string;
  phone: string;
  position: string;
  status: "LEAD" | "PROSPECT" | "CUSTOMER";
  accountId: string;
  ownerId: string;
}

interface UsersOption {
  id: string;
  name: string;
  email: string;
  role: "ADMIN" | "SALES";
}

interface AccountsOption {
  id: string;
  name: string;
}

interface ContactFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial: ContactFormValues | null;
  editingId: string | null;
  users: UsersOption[];
  accounts: AccountsOption[];
  currentUserId: string;
  isAdmin: boolean;
}

const defaults = (currentUserId: string): ContactFormValues => ({
  name: "",
  email: "",
  phone: "",
  position: "",
  status: "PROSPECT",
  accountId: "",
  ownerId: currentUserId,
});

export function ContactFormDialog({ open, onOpenChange, ...inner }: ContactFormDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Mounted only while open → the form remounts fresh every time (no reset effects) */}
      {open ? <ContactFormInner onOpenChange={onOpenChange} {...inner} /> : null}
    </Dialog>
  );
}

function ContactFormInner({
  onOpenChange,
  initial,
  editingId,
  users,
  accounts,
  currentUserId,
  isAdmin,
}: Omit<ContactFormDialogProps, "open">) {
  const [newAccountMode, setNewAccountMode] = React.useState(false);
  const [newAccountName, setNewAccountName] = React.useState("");
  const [serverError, setServerError] = React.useState<string | null>(null);

  const {
    control,
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<ContactFormValues>({
    resolver: zodResolver(contactSchema) as unknown as Resolver<ContactFormValues>,
    defaultValues: initial ?? defaults(currentUserId),
  });

  const accountId = useWatch({ control, name: "accountId" });
  const ownerId = useWatch({ control, name: "ownerId" });
  const status = useWatch({ control, name: "status" });

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    let resolvedAccountId = values.accountId;

    if (newAccountMode) {
      if (newAccountName.trim().length < 2) {
        setServerError("Enter the new company name");
        return;
      }
      const accountResult = await saveAccount({ name: newAccountName.trim() });
      if (!accountResult.ok) {
        setServerError(accountResult.error);
        return;
      }
      resolvedAccountId = accountResult.data.id;
    }

    const result = await saveContact({ ...values, accountId: resolvedAccountId }, editingId ?? undefined);
    if (result.ok) {
      toast.success(editingId ? "Contact updated" : "Contact created");
      onOpenChange(false);
    } else {
      setServerError(result.error);
    }
  });

  return (
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editingId ? "Edit contact" : "New contact"}</DialogTitle>
          <DialogDescription>
            {editingId ? "Update the contact details." : "Add a person to one of your accounts."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="contact-name">Full name</Label>
            <Input id="contact-name" placeholder="Jane Doe" {...register("name")} />
            {errors.name ? <p className="text-xs text-destructive">{errors.name.message}</p> : null}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="contact-email">Email</Label>
              <Input id="contact-email" type="email" placeholder="jane@company.com" {...register("email")} />
              {errors.email ? <p className="text-xs text-destructive">{errors.email.message}</p> : null}
            </div>
            <div className="grid gap-2">
              <Label htmlFor="contact-phone">Phone</Label>
              <Input id="contact-phone" placeholder="+1 555-0100" {...register("phone")} />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="contact-position">Position</Label>
              <Input id="contact-position" placeholder="Procurement Director" {...register("position")} />
            </div>
            <div className="grid gap-2">
              <Label>Status</Label>
              <Select value={status} onValueChange={(value) => setValue("status", value as ContactFormValues["status"])}>
                <SelectTrigger>
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="LEAD">Lead</SelectItem>
                  <SelectItem value="PROSPECT">Prospect</SelectItem>
                  <SelectItem value="CUSTOMER">Customer</SelectItem>
                </SelectContent>
              </Select>
              {errors.status ? <p className="text-xs text-destructive">{errors.status.message}</p> : null}
            </div>
          </div>

          <div className="grid gap-2">
            <div className="flex items-center justify-between">
              <Label>Account</Label>
              <button
                type="button"
                className="flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                onClick={() => {
                  setNewAccountMode((mode) => !mode);
                  setValue("accountId", "");
                }}
              >
                <Plus className="size-3" /> {newAccountMode ? "Pick existing" : "New company"}
              </button>
            </div>
            {newAccountMode ? (
              <Input
                placeholder="New company name"
                value={newAccountName}
                onChange={(event) => setNewAccountName(event.target.value)}
              />
            ) : (
              <Select value={accountId} onValueChange={(value) => setValue("accountId", value)}>
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
            )}
            {errors.accountId && !newAccountMode ? (
              <p className="text-xs text-destructive">{errors.accountId.message}</p>
            ) : null}
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

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="size-4 animate-spin" /> : null}
              {editingId ? "Save changes" : "Create contact"}
            </Button>
          </DialogFooter>
        </form>
    </DialogContent>
  );
}
