import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Building2, Mail, MapPin, Phone, Trophy } from "lucide-react";
import { requireAuth } from "@/lib/session";
import { getContactDetail } from "@/lib/queries";
import { formatCurrency, formatDate, formatDateTime } from "@/lib/format";
import { ContactStatusBadge } from "@/components/badges";
import { ActivityForm } from "@/components/activities/activity-form";
import { TaskList } from "@/components/tasks/task-list";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { cn } from "cn";

export const dynamic = "force-dynamic";

export default async function ContactDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireAuth();
  const { id } = await params;
  const contact = await getContactDetail({ id: session.user.id, role: session.user.role }, id);
  if (!contact) notFound();

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2 text-muted-foreground">
        <Link href="/contacts">
          <ArrowLeft className="size-4" /> All contacts
        </Link>
      </Button>

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">{contact.name}</h1>
            <ContactStatusBadge status={contact.status} />
          </div>
          <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
            <Building2 className="size-3.5" />
            {contact.accountName}
            {contact.position ? ` · ${contact.position}` : ""}
            <span className="mx-1">·</span> Owned by {contact.ownerName}
          </p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left: info + deals + tasks */}
        <div className="space-y-6 lg:col-span-1">
          <Card>
            <CardHeader>
              <CardTitle>Contact info</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <p className="flex items-center gap-2">
                <Mail className="size-4 text-muted-foreground" />
                {contact.email ?? "—"}
              </p>
              <p className="flex items-center gap-2">
                <Phone className="size-4 text-muted-foreground" />
                {contact.phone ?? "—"}
              </p>
              <Separator />
              <p className="font-medium">{contact.account.name}</p>
              <p className="flex items-center gap-2 text-muted-foreground">
                <MapPin className="size-4" />
                {contact.account.industry ?? "Industry unknown"}
              </p>
              {contact.account.website ? (
                <p className="text-muted-foreground">{contact.account.website}</p>
              ) : null}
              {contact.account.phone ? <p className="text-muted-foreground">{contact.account.phone}</p> : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Deals</CardTitle>
              <CardDescription>
                {contact.deals.length} deal{contact.deals.length === 1 ? "" : "s"} linked to this contact
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {contact.deals.length === 0 ? (
                <p className="py-4 text-center text-sm text-muted-foreground">No deals yet — create one from the pipeline board.</p>
              ) : (
                contact.deals.map((deal) => (
                  <div key={deal.id} className="flex items-center justify-between gap-2 rounded-lg border p-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{deal.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {deal.stageName}
                        {deal.expectedCloseDate ? ` · close ${formatDate(deal.expectedCloseDate)}` : ""}
                      </p>
                    </div>
                    <span
                      className={cn(
                        "text-sm font-semibold tabular-nums",
                        deal.isWon && "text-emerald-600 dark:text-emerald-400",
                        deal.isLost && "text-red-500"
                      )}
                    >
                      {formatCurrency(deal.value)}
                      {deal.isWon ? <Trophy className="ml-1 inline size-3.5" /> : null}
                    </span>
                  </div>
                ))
              )}
              <Button asChild variant="ghost" size="sm" className="w-full">
                <Link href="/deals">Open pipeline</Link>
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Tasks</CardTitle>
              <CardDescription>Follow-ups tied to this contact</CardDescription>
            </CardHeader>
            <CardContent>
              <TaskList tasks={contact.tasks} compact />
            </CardContent>
          </Card>
        </div>

        {/* Right: activity timeline */}
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Log an activity</CardTitle>
              <CardDescription>Notes, calls, meetings and emails build the contact history</CardDescription>
            </CardHeader>
            <CardContent>
              <ActivityForm
                contactId={contact.id}
                deals={contact.deals.map((deal) => ({ id: deal.id, title: deal.title }))}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Activity timeline</CardTitle>
              <CardDescription>{contact.activities.length} entries, newest first</CardDescription>
            </CardHeader>
            <CardContent>
              {contact.activities.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  No activity yet — log the first call or note above.
                </p>
              ) : (
                <ol className="relative space-y-6 border-l pl-6">
                  {contact.activities.map((activity) => (
                    <li key={activity.id} className="relative">
                      <span className="absolute -left-[31px] top-1 size-2.5 rounded-full bg-primary" />
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="secondary" className="text-[11px]">
                          {activity.type.charAt(0) + activity.type.slice(1).toLowerCase()}
                        </Badge>
                        <p className="text-sm font-medium">{activity.subject}</p>
                      </div>
                      {activity.body ? <p className="mt-1 text-sm text-muted-foreground">{activity.body}</p> : null}
                      <p className="mt-1 text-xs text-muted-foreground">
                        {activity.userName} · {formatDateTime(activity.occurredAt)}
                        {activity.dealTitle ? ` · ${activity.dealTitle}` : ""}
                      </p>
                    </li>
                  ))}
                </ol>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
