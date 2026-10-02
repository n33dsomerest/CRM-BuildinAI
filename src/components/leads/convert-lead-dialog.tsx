"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowRightLeft, Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { LeadRow } from "@/lib/queries";
import { convertLead } from "@/lib/actions/leads";
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

interface ConvertLeadDialogProps {
  lead: LeadRow | null;
  onOpenChange: (open: boolean) => void;
}

/**
 * The enterprise "Convert" flow: creates Account + Contact + first-stage Deal
 * in a single server transaction, then removes the lead.
 */
export function ConvertLeadDialog({ lead, onOpenChange }: ConvertLeadDialogProps) {
  return (
    <Dialog open={lead !== null} onOpenChange={onOpenChange}>
      {/* Keyed by lead so form state initializes fresh from props — no effects */}
      {lead ? <ConvertLeadForm lead={lead} onOpenChange={onOpenChange} /> : null}
    </Dialog>
  );
}

function ConvertLeadForm({ lead, onOpenChange }: { lead: LeadRow; onOpenChange: (open: boolean) => void }) {
  const router = useRouter();
  const [dealTitle, setDealTitle] = React.useState(() =>
    lead.company ? `${lead.company} — new business` : `${lead.name} — new business`
  );
  const [dealValue, setDealValue] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);

  const handleConvert = async () => {
    setPending(true);
    setError(null);
    const result = await convertLead({
      leadId: lead.id,
      dealTitle: dealTitle.trim(),
      dealValue: dealValue.trim(),
    });
    setPending(false);
    if (result.ok) {
      toast.success(`${lead.name} converted — account, contact and deal created`);
      onOpenChange(false);
      router.refresh();
    } else {
      setError(result.error);
    }
  };

  return (
    <>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowRightLeft className="size-4 text-emerald-500" /> Convert {lead.name}
          </DialogTitle>
          <DialogDescription>
            Creates an account{lead.company ? ` for ${lead.company}` : ""}, a contact, and an open deal — then
            archives the lead.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="convert-title">Deal title</Label>
            <Input
              id="convert-title"
              value={dealTitle}
              onChange={(event) => setDealTitle(event.target.value)}
              placeholder="First deal with this customer"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="convert-value">Deal value (USD)</Label>
            <Input
              id="convert-value"
              type="number"
              min="1"
              value={dealValue}
              onChange={(event) => setDealValue(event.target.value)}
              placeholder="25000"
            />
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={() => void handleConvert()} disabled={pending}>
            {pending ? <Loader2 className="size-4 animate-spin" /> : <ArrowRightLeft className="size-4" />}
            Convert
          </Button>
        </DialogFooter>
      </DialogContent>
    </>
  );
}
