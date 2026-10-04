"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useForm, useWatch, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, SendHorizonal, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { activitySchema } from "@/lib/validations";
import { summarizeActivityDraft } from "@/lib/actions/ai";
import { addActivity } from "@/lib/actions/activities";
import { QuotaIndicator } from "@/components/ai/quota-indicator";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

export interface ActivityFormValues {
  contactId: string;
  dealId: string;
  type: "NOTE" | "CALL" | "MEETING" | "EMAIL";
  subject: string;
  body: string;
  summary: string;
  sentiment: string;
}

interface ActivityFormProps {
  contactId: string;
  deals: { id: string; title: string }[];
  /** Remaining daily AI requests - 0 disables the Summarize button. */
  aiRemaining?: number;
  /** True when AI is unconfigured (no OPENROUTER_API_KEY) - hides AI affordances. */
  aiConfigured?: boolean;
}

export function ActivityForm({ contactId, deals, aiRemaining, aiConfigured = false }: ActivityFormProps) {
  const router = useRouter();
  const [serverError, setServerError] = React.useState<string | null>(null);
  const [truncated, setTruncated] = React.useState(false);

  const {
    control,
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<ActivityFormValues>({
    resolver: zodResolver(activitySchema) as unknown as Resolver<ActivityFormValues>,
    defaultValues: { contactId, dealId: "", type: "NOTE", subject: "", body: "", summary: "", sentiment: "" },
  });

  const type = useWatch({ control, name: "type" });
  const dealId = useWatch({ control, name: "dealId" });
  const body = useWatch({ control, name: "body" });
  const summary = useWatch({ control, name: "summary" });
  const sentiment = useWatch({ control, name: "sentiment" });

  const summarize = async () => {
    setServerError(null);
    const result = await summarizeActivityDraft({ body: getValues("body") });
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    setValue("summary", result.data.summary);
    setValue("sentiment", result.data.sentiment);
    setTruncated(result.data.truncated);
    toast.success("AI draft ready - review and edit before saving");
  };

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    const result = await addActivity(values);
    if (result.ok) {
      toast.success("Activity logged");
      reset({ contactId, dealId: "", type: "NOTE", subject: "", body: "", summary: "", sentiment: "" });
      setTruncated(false);
      router.refresh();
    } else {
      setServerError(result.error);
    }
  });

  const canSummarize = aiConfigured && (body?.trim().length ?? 0) >= 20 && (aiRemaining ?? 0) > 0;

  return (
    <form onSubmit={onSubmit} className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label>Type</Label>
          <Select value={type} onValueChange={(value) => setValue("type", value as ActivityFormValues["type"])}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="NOTE">Note</SelectItem>
              <SelectItem value="CALL">Call</SelectItem>
              <SelectItem value="MEETING">Meeting</SelectItem>
              <SelectItem value="EMAIL">Email</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-2">
          <Label>Related deal (optional)</Label>
          <Select value={dealId || "NONE"} onValueChange={(value) => setValue("dealId", value === "NONE" ? "" : value)}>
            <SelectTrigger>
              <SelectValue placeholder="No deal" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="NONE">No deal</SelectItem>
              {deals.map((deal) => (
                <SelectItem key={deal.id} value={deal.id}>
                  {deal.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="activity-subject">Subject</Label>
        <Input id="activity-subject" placeholder="Intro call" {...register("subject")} />
        {errors.subject ? <p className="text-xs text-destructive">{errors.subject.message}</p> : null}
      </div>

      <div className="grid gap-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="activity-body">Details</Label>
          {aiConfigured ? (
            <QuotaIndicator remaining={aiRemaining ?? 0} className="text-[11px]" />
          ) : null}
        </div>
        <Textarea
          id="activity-body"
          rows={3}
          placeholder="What was discussed? Next steps? Paste the messy raw note - AI can summarize it."
          {...register("body")}
        />
      </div>

      {aiConfigured ? (
        <div>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => void summarize()}
            disabled={!canSummarize || isSubmitting}
            aria-busy={false}
            title={
              !aiRemaining || aiRemaining <= 0
                ? "Daily AI limit reached - resets within 24h"
                : "Summarize the details above with AI (uses 1 of your 20 daily requests)"
            }
          >
            <Wand2 className="size-4" />
            Summarize with AI
          </Button>
          {body && body.trim().length < 20 ? (
            <p className="mt-1 text-xs text-muted-foreground">Write at least 20 characters to summarize.</p>
          ) : null}
        </div>
      ) : null}

      {/* AI draft fields - populated by the summarizer, edited by the human */}
      {aiConfigured ? (
        <div className="grid gap-4 rounded-lg border bg-muted/30 p-3">
          <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <Wand2 className="size-3" /> AI draft - review and edit before saving
          </p>
          {truncated ? (
            <p className="text-xs text-amber-600 dark:text-amber-400">
              Note was longer than 6,000 characters - only the first 6,000 were summarized.
            </p>
          ) : null}
          <div className="grid gap-2">
            <Label htmlFor="activity-summary">Summary</Label>
            <Textarea
              id="activity-summary"
              rows={2}
              placeholder="Summarize with AI to fill this in"
              {...register("summary")}
            />
            {errors.summary ? <p className="text-xs text-destructive">{errors.summary.message}</p> : null}
          </div>
          <div className="grid gap-2 sm:max-w-56">
            <Label>Sentiment</Label>
            <Select
              value={sentiment || "NONE"}
              onValueChange={(value) => setValue("sentiment", value === "NONE" ? "" : value)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Not set" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="NONE">Not set</SelectItem>
                <SelectItem value="POSITIVE">Positive</SelectItem>
                <SelectItem value="NEUTRAL">Neutral</SelectItem>
                <SelectItem value="NEGATIVE">Negative</SelectItem>
                <SelectItem value="RISK">Risk</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      ) : null}

      {serverError ? <p className="text-sm text-destructive">{serverError}</p> : null}

      <div className="flex justify-end">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? <Loader2 className="size-4 animate-spin" /> : <SendHorizonal className="size-4" />}
          Log activity
        </Button>
      </div>
    </form>
  );
}
