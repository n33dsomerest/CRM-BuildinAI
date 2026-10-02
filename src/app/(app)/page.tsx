import Link from "next/link";
import {
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  DollarSign,
  Percent,
  TrendingUp,
  Users,
} from "lucide-react";
import { requireAuth } from "@/lib/session";
import { getDashboardData } from "@/lib/queries";
import { formatCurrency, formatCompactCurrency, formatDate, formatDateTime } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { KpiCard } from "@/components/kpi-card";
import { EmptyState } from "@/components/empty-state";
import { ActivityTypeBadge } from "@/components/badges";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const session = await requireAuth();
  const data = await getDashboardData({ id: session.user.id, role: session.user.role });
  const { kpis, funnel, myTasks, recentActivities } = data;
  const maxStageValue = Math.max(1, ...funnel.filter((s) => !s.isWon && !s.isLost).map((s) => s.totalValue));

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <PageHeader
        title={`Welcome back, ${session.user.name?.split(" ")[0] ?? "there"}`}
        description="Here is what is happening across your pipeline today."
        actions={
          <Button asChild>
            <Link href="/deals">
              Open pipeline <ArrowRight className="size-4" />
            </Link>
          </Button>
        }
      />

      {/* KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <KpiCard
          title="Pipeline Value"
          value={formatCompactCurrency(kpis.pipelineValue)}
          hint="Open deals, all stages"
          icon={DollarSign}
        />
        <KpiCard
          title="Weighted Forecast"
          value={formatCompactCurrency(kpis.weightedForecast)}
          hint="Probability-adjusted"
          icon={TrendingUp}
          accent="positive"
        />
        <KpiCard title="Total Contacts" value={String(kpis.totalContacts)} icon={Users} />
        <KpiCard
          title="Won Deals"
          value={String(kpis.wonDeals)}
          hint={`${formatCompactCurrency(kpis.wonValue)} closed`}
          icon={CheckCircle2}
          accent="positive"
        />
        <KpiCard title="Win Rate" value={`${kpis.winRate}%`} hint="Won / (won + lost)" icon={Percent} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Funnel by stage */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Pipeline by stage</CardTitle>
            <CardDescription>Open deal value and probability per stage</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {funnel.map((stage) => (
              <div key={stage.id} className="space-y-1.5">
                <div className="flex items-baseline justify-between gap-2 text-sm">
                  <span className="font-medium">
                    {stage.name}
                    <span className="ml-2 text-xs text-muted-foreground">{stage.probability}%</span>
                  </span>
                  <span className="tabular-nums text-muted-foreground">
                    {stage.deals.length} deal{stage.deals.length === 1 ? "" : "s"} ·{" "}
                    <span className={cn("font-medium text-foreground", stage.isWon && "text-emerald-600 dark:text-emerald-400", stage.isLost && "text-red-600 dark:text-red-400")}>
                      {formatCurrency(stage.totalValue)}
                    </span>
                  </span>
                </div>
                <div className="h-2.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className={cn(
                      "h-full rounded-full",
                      stage.isWon ? "bg-emerald-500" : stage.isLost ? "bg-red-400" : "bg-primary"
                    )}
                    style={{ width: `${Math.max(2, (stage.totalValue / maxStageValue) * 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* My tasks */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <div className="space-y-1.5">
              <CardTitle>My tasks</CardTitle>
              <CardDescription>Open follow-ups assigned to you</CardDescription>
            </div>
            <ClipboardList className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="space-y-2">
            {myTasks.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">Nothing due. Enjoy the calm.</p>
            ) : (
              myTasks.map((task) => {
                return (
                  <div key={task.id} className="flex items-start gap-3 rounded-lg border p-3">
                    <CalendarClock className={cn("mt-0.5 size-4 shrink-0", task.overdue ? "text-red-500" : "text-muted-foreground")} />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{task.title}</p>
                      <p className={cn("text-xs", task.overdue ? "font-medium text-red-500" : "text-muted-foreground")}>
                        {task.overdue ? "Overdue · " : "Due "}
                        {formatDate(task.dueDate)}
                        {task.contactName ? ` · ${task.contactName}` : ""}
                      </p>
                    </div>
                  </div>
                );
              })
            )}
            <Button asChild variant="ghost" size="sm" className="w-full">
              <Link href="/tasks">View all tasks</Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Recent activity */}
      <Card>
        <CardHeader>
          <CardTitle>Recent activity</CardTitle>
          <CardDescription>Latest notes, calls, meetings and emails on your contacts</CardDescription>
        </CardHeader>
        <CardContent>
          {recentActivities.length === 0 ? (
            <EmptyState icon={ClipboardList} title="No activity yet" description="Log a call or note from any contact page." />
          ) : (
            <ul className="divide-y">
              {recentActivities.map((activity) => (
                <li key={activity.id} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
                  <ActivityTypeBadge type={activity.type} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      <Link href={`/contacts/${activity.contactId}`} className="hover:underline">
                        {activity.subject}
                      </Link>
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {activity.userName} · {formatDateTime(activity.occurredAt)}
                      {activity.dealTitle ? ` · ${activity.dealTitle}` : ""}
                    </p>
                  </div>
                  {activity.dealTitle ? (
                    <Badge variant="outline" className="hidden shrink-0 sm:inline-flex">
                      Deal
                    </Badge>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
