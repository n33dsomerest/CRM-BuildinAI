"use client";

import * as React from "react";
import { useForm, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { leadSchema } from "@/lib/validations";
import { saveLead } from "@/lib/actions/leads";
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

export interface LeadFormValues {
  name: string;
  email: string;
  phone: string;
  company: string;
  source: "WEB" | "REFERRAL" | "EVENT" | "COLD_CALL" | "OTHER";
  status: "NEW" | "WORKING" | "QUALIFIED" | "UNQUALIFIED";
}

interface LeadFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial: LeadFormValues | null;
  editingId: string | null;
  currentUserId: string;
}

const defaults = (): LeadFormValues => ({
  name: "",
  email: "",
  phone: "",
  company: "",
  source: "WEB",
  status: "NEW",
});

export function LeadFormDialog({ open, onOpenChange, initial, editingId, currentUserId }: LeadFormDialogProps) {
  const [serverError, setServerError] = React.useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<LeadFormValues>({
    resolver: zodResolver(leadSchema) as unknown as Resolver<LeadFormValues>,
    defaultValues: defaults(),
  });

  const source = watch("source");
  const status = watch("status");

  React.useEffect(() => {
    if (open) {
      reset(initial ?? defaults());
      setServerError(null);
    }
  }, [open, initial, reset, currentUserId]);

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    const result = await saveLead(values, editingId ?? undefined);
    if (result.ok) {
      toast.success(editingId ? "Lead updated" : "Lead created");
      onOpenChange(false);
    } else {
      setServerError(result.error);
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editingId ? "Edit lead" : "New lead"}</DialogTitle>
          <DialogDescription>A lead is an unqualified prospect — qualification happens here.</DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="lead-name">Full name</Label>
            <Input id="lead-name" placeholder="Jane Doe" {...register("name")} />
            {errors.name ? <p className="text-xs text-destructive">{errors.name.message}</p> : null}
          </div>

          <div className="grid gap-2">
            <Label htmlFor="lead-company">Company</Label>
            <Input id="lead-company" placeholder="Acme Corp" {...register("company")} />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="lead-email">Email</Label>
              <Input id="lead-email" type="email" placeholder="jane@company.com" {...register("email")} />
              {errors.email ? <p className="text-xs text-destructive">{errors.email.message}</p> : null}
            </div>
            <div className="grid gap-2">
              <Label htmlFor="lead-phone">Phone</Label>
              <Input id="lead-phone" placeholder="+1 555-0100" {...register("phone")} />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label>Source</Label>
              <Select value={source} onValueChange={(value) => setValue("source", value as LeadFormValues["source"])}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="WEB">Web</SelectItem>
                  <SelectItem value="REFERRAL">Referral</SelectItem>
                  <SelectItem value="EVENT">Event</SelectItem>
                  <SelectItem value="COLD_CALL">Cold call</SelectItem>
                  <SelectItem value="OTHER">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Status</Label>
              <Select value={status} onValueChange={(value) => setValue("status", value as LeadFormValues["status"])}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="NEW">New</SelectItem>
                  <SelectItem value="WORKING">Working</SelectItem>
                  <SelectItem value="QUALIFIED">Qualified</SelectItem>
                  <SelectItem value="UNQUALIFIED">Unqualified</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {serverError ? <p className="text-sm text-destructive">{serverError}</p> : null}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="size-4 animate-spin" /> : null}
              {editingId ? "Save changes" : "Create lead"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
