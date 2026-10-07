import { requireAdmin } from "@/lib/session";
import { getAiUsageSummary } from "@/lib/queries";
import { getAiConfig } from "@/lib/ai/config";
import { formatDateTime } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata = { title: "AI usage" };

/**
 * Read-only diagnostic view over AiUsage (Find: the ok/error/provider columns
 * were written but never consumed). Groups the rolling 24h budget window by
 * model — calls, tokens, failures and the error classes that occurred — and
 * lines each model up against its AI_TOKEN_BUDGETS entry so the page answers
 * "where is the team's budget going". No new table; AiUsage is the source.
 */
export default async function AiUsagePage() {
  await requireAdmin();
  const usage = await getAiUsageSummary();
  const aiConfig = getAiConfig();
  const { windowStart, models, totalCalls, totalTokens } = usage;

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="AI usage"
        description={`Model calls over the rolling 24-hour budget window (since ${formatDateTime(windowStart)}). ${totalCalls} call(s), ${totalTokens.toLocaleString("en-US")} tokens. One row per user action — failed attempts count against the budget too.`}
      />

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Model</TableHead>
              <TableHead className="w-28">Calls</TableHead>
              <TableHead className="w-40">Tokens (in / out)</TableHead>
              <TableHead className="w-44">24h budget</TableHead>
              <TableHead>Features</TableHead>
              <TableHead>Failures</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {models.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                  No AI usage in the current window.
                </TableCell>
              </TableRow>
            ) : (
              models.map((summary) => {
                const limit = summary.model ? aiConfig?.budgets.get(summary.model) : undefined;
                const pct = limit ? Math.min(100, Math.round((summary.totalTokens / limit) * 100)) : null;
                return (
                  <TableRow key={summary.model ?? "unattributed"}>
                    <TableCell className="font-medium">{summary.model ?? "(unattributed)"}</TableCell>
                    <TableCell className="tabular-nums">
                      {summary.calls}
                      {summary.failedCalls > 0 ? (
                        <span className="ml-1 text-xs text-red-500">({summary.failedCalls} failed)</span>
                      ) : null}
                    </TableCell>
                    <TableCell className="tabular-nums text-xs text-muted-foreground">
                      {summary.inputTokens.toLocaleString("en-US")} / {summary.outputTokens.toLocaleString("en-US")}
                      <span className="ml-1 font-medium text-foreground">{summary.totalTokens.toLocaleString("en-US")}</span>
                    </TableCell>
                    <TableCell>
                      {limit ? (
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-20 overflow-hidden rounded-full bg-muted">
                            <div
                              className={cn(
                                "h-full rounded-full",
                                pct !== null && pct >= 90 ? "bg-red-500" : pct !== null && pct >= 75 ? "bg-amber-500" : "bg-emerald-500"
                              )}
                              style={{ width: `${pct ?? 0}%` }}
                            />
                          </div>
                          <span className="text-xs tabular-nums text-muted-foreground">
                            {pct}% of {limit.toLocaleString("en-US")}
                          </span>
                        </div>
                      ) : summary.model ? (
                        <span className="text-xs text-muted-foreground">unknown (not in AI_TOKEN_BUDGETS)</span>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {summary.features.map((f) => (
                          <Badge key={f.feature} variant="outline" className="text-[11px]">
                            {f.feature} · {f.calls}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell>
                      {summary.errors.length === 0 ? (
                        <span className="text-xs text-muted-foreground">—</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {summary.errors.map((e) => (
                            <Badge
                              key={e.errorClass}
                              variant="secondary"
                              className="bg-red-500/15 text-[11px] text-red-700 dark:text-red-400"
                            >
                              {e.errorClass} ×{e.count}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
