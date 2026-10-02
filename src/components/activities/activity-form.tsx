"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useForm, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, SendHorizonal } from "lucide-react";
import { toast } from "sonner";
import { activitySchema } from "@/lib/validations";
import { addActivity } from "@/lib/actions/activities";
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
}

interface ActivityFormProps {
  contactId: string;
  deals: { id: string; title: string }[];
}

export function ActivityForm({ contactId, deals }: ActivityFormProps) {
  const router = useRouter();
  const [serverError, setServerError] = React.useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<ActivityFormValues>({
    resolver: zodResolver(activitySchema) as unknown as Resolver<ActivityFormValues>,
    defaultValues: { contactId, dealId: "", type: "NOTE", subject: "", body: "" },
  });

  const type = watch("type");
  const dealId = watch("dealId");

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    const result = await addActivity(values);
    if (result.ok) {
      toast.success("Activity logged");
      reset({ contactId, dealId: "", type: "NOTE", subject: "", body: "" });
      router.refresh();
    } else {
      setServerError(result.error);
    }
  });

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
        <Label htmlFor="activity-body">Details</Label>
        <Textarea
          id="activity-body"
          rows={3}
          placeholder="What was discussed? Next steps?"
          {...register("body")}
        />
      </div>

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
