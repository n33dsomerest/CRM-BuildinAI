"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useForm, useWatch, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, SendHorizonal, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { activitySchema } from "@/lib/validations";
import { summarizeActivityDraft, type SummaryDraft } from "@/lib/actions/ai";
import { addActivity } from "@/lib/actions/activities";
import { AiActionButton } from "@/components/ai/ai-action-button";
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
  nextStep: string;
  suggestedTask: string;
}

interface AiBudgetInfo {
  model: string;
  unknown: boolean;
  sharedUsed: number;
  sharedLimit: number;
  sharedRemaining: number;
  userUsed: number;
  userLimit: number;
}

interface ActivityFormProps {
  contactId: string;
  deals: { id: string; title: string }[];
  /** Primary model's token budget state - exhausted/unknown disables Summarize. */
  aiBudget?: AiBudgetInfo | null;
  /** True when AI is unconfigured (no API key) - hides AI affordances. */
  aiConfigured?: boolean;
}

export function ActivityForm({ contactId, deals, aiBudget, aiConfigured = false }: ActivityFormProps) {
  const router = useRouter();
  const [serverError, setServerError] = React.useState<string | null>(null);
  const [truncated, setTruncated] = React.useState(false);

  const {
    control,
    register,
    handleSubmit,
    reset,
    setValue,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<ActivityFormValues>({
    resolver: zodResolver(activitySchema) as unknown as Resolver<ActivityFormValues>,
    defaultValues: {
      contactId,
      dealId: "",
      type: "NOTE",
      subject: "",
      body: "",
      summary: "",
      sentiment: "",
      nextStep: "",
      suggestedTask: "",
    },
  });

  const type = useWatch({ control, name: "type" });
  const dealId = useWatch({ control, name: "dealId" });
  const body = useWatch({ control, name: "body" });
  const sentiment = useWatch({ control, name: "sentiment" });

  const summarize = async () => summarizeActivityDraft({ body: getValues("body") });

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    const result = await addActivity(values);
    if (result.ok) {
      toast.success("Activity logged");
      reset({
        contactId,
        dealId: "",
        type: "NOTE",
        subject: "",
        body: "",
        summary: "",
        sentiment: "",
        nextStep: "",
        suggestedTask: "",
      });
      setTruncated(false);
      router.refresh();
    } else {
      setServerError(result.error);
    }
  });

  const budgetExhausted =
    aiBudget !== undefined &&
    aiBudget !== null &&
    !aiBudget.unknown &&
    (aiBudget.sharedRemaining <= 0 ||
      (aiBudget.userLimit > 0 && aiBudget.userUsed >= aiBudget.userLimit));
  const bodyChars = body?.trim().length ?? 0;
  const summarizeDisabledReason = budgetExhausted
    ? "Daily token budget reached - resets within 24h"
    : bodyChars < 20
      ? "Write at least 20 characters to summarize"
      : undefined;

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
          {aiConfigured && aiBudget ? (
            <QuotaIndicator
              model={aiBudget.model}
              sharedUsed={aiBudget.sharedUsed}
              sharedLimit={aiBudget.sharedLimit}
              sharedRemaining={aiBudget.sharedRemaining}
              userUsed={aiBudget.userUsed}
              userLimit={aiBudget.userLimit}
              unknown={aiBudget.unknown}
              className="text-[11px]"
            />
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
          <AiActionButton
            label={budgetExhausted ? "AI limit reached" : "Summarize with AI"}
            variant="secondary"
            disabledReason={summarizeDisabledReason}
            onClick={() => {
              setServerError(null);
              return summarize();
            }}
            onSuccess={(result) => {
              const draft: SummaryDraft = result.data;
              setValue("summary", draft.summary);
              setValue("sentiment", draft.sentiment);
              setValue("nextStep", draft.nextStep ?? "");
              setValue("suggestedTask", draft.suggestedTask ?? "");
              setTruncated(draft.truncated);
              toast.success("AI draft ready - review and edit before saving");
            }}
          />
          {bodyChars > 0 && bodyChars < 20 ? (
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
          <div className="grid gap-2">
            <Label htmlFor="activity-next-step">Next step</Label>
            <Textarea
              id="activity-next-step"
              rows={2}
              placeholder="The single next action the note implies"
              {...register("nextStep")}
            />
            {errors.nextStep ? <p className="text-xs text-destructive">{errors.nextStep.message}</p> : null}
          </div>
          <div className="grid gap-2">
            <Label htmlFor="activity-suggested-task">Suggested task</Label>
            <Input
              id="activity-suggested-task"
              placeholder="e.g. Send DPA v2 to their legal team"
              {...register("suggestedTask")}
            />
            <p className="text-xs text-muted-foreground">
              Save the activity, then create this as a task in one click from the timeline.
            </p>
            {errors.suggestedTask ? (
              <p className="text-xs text-destructive">{errors.suggestedTask.message}</p>
            ) : null}
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
