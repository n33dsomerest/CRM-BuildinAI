"use client";

import * as React from "react";
import { Check, Copy, Loader2, MailWarning } from "lucide-react";
import { toast } from "sonner";
import { draftFollowUpEmail } from "@/lib/actions/ai";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface EmailDraftDialogProps {
  contactId: string;
  contactName: string;
  remaining?: number;
  aiConfigured?: boolean;
}

/**
 * Phase 2 UI. Copy-only by design: the dialog offers copy-to-clipboard, and
 * nothing else. No send button, no mailto, no SMTP - the user pastes the text
 * into their own mail client.
 */
export function EmailDraftDialog({ contactId, contactName, remaining, aiConfigured = false }: EmailDraftDialogProps) {
  const [open, setOpen] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const [subject, setSubject] = React.useState("");
  const [body, setBody] = React.useState("");
  const [copied, setCopied] = React.useState<"subject" | "body" | null>(null);

  const exhausted = remaining !== undefined && remaining <= 0;

  const draft = async () => {
    setPending(true);
    const result = await draftFollowUpEmail(contactId);
    setPending(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    setSubject(result.data.subject);
    setBody(result.data.body);
    toast.success("AI draft ready - review and edit before sending from your own mail client");
  };

  const copy = async (what: "subject" | "body") => {
    const text = what === "subject" ? subject : body;
    await navigator.clipboard.writeText(text);
    setCopied(what);
    setTimeout(() => setCopied(null), 1500);
    toast.success(`Copied ${what}`);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next && !subject && !body && !pending) {
          void draft();
        }
        if (!next) {
          setSubject("");
          setBody("");
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" disabled={!aiConfigured || exhausted} title={
          !aiConfigured
            ? "AI is not configured"
            : exhausted
              ? "Daily AI limit reached - resets within 24h"
              : "Draft a follow-up email with AI (uses 1 of your 20 daily requests)"
        }>
          <MailWarning className="size-4" />
          {exhausted ? "AI limit reached" : "Draft follow-up"}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>AI follow-up draft — {contactName}</DialogTitle>
          <DialogDescription className="flex items-center gap-1.5">
            <MailWarning className="size-3.5 text-amber-500" />
            AI-generated draft. Review and edit, then paste into your own mail client. This app never sends email.
          </DialogDescription>
        </DialogHeader>

        {pending ? (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground" role="status" aria-busy="true">
            <Loader2 className="size-4 animate-spin" /> Drafting with AI…
          </div>
        ) : subject || body ? (
          <div className="grid gap-4">
            <div className="grid gap-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="draft-subject">Subject</Label>
                <Button type="button" variant="ghost" size="sm" onClick={() => void copy("subject")}>
                  {copied === "subject" ? <Check className="size-3.5" /> : <Copy className="size-3.5" />} Copy
                </Button>
              </div>
              <Input id="draft-subject" value={subject} onChange={(event) => setSubject(event.target.value)} />
            </div>
            <div className="grid gap-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="draft-body">Body</Label>
                <Button type="button" variant="ghost" size="sm" onClick={() => void copy("body")}>
                  {copied === "body" ? <Check className="size-3.5" /> : <Copy className="size-3.5" />} Copy
                </Button>
              </div>
              <Textarea id="draft-body" rows={10} value={body} onChange={(event) => setBody(event.target.value)} />
            </div>
          </div>
        ) : (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Click Draft to generate a follow-up from this contact&apos;s deals and recent activities.
          </p>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
