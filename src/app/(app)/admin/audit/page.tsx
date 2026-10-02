import Link from "next/link";
import { requireAdmin } from "@/lib/session";
import { getAuditLogs, getUsersList } from "@/lib/queries";
import { formatDateTime } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { AuditFilters } from "@/components/admin/audit-filters";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "cn";

export const dynamic = "force-dynamic";
export const metadata = { title: "Audit log" };

interface ChangeEntry {
  [field: string]: { from?: unknown; to?: unknown } | unknown;
}

function describeChanges(changes: unknown): string {
  if (!changes || typeof changes !== "object") return "—";
  const entries = Object.entries(changes as ChangeEntry);
  if (entries.length === 0) return "—";
  return entries
    .slice(0, 4)
    .map(([field, value]) => {
      if (value && typeof value === "object" && "from" in (value as object)) {
        const { from, to } = value as { from?: unknown; to?: unknown };
        return `${field}: ${stringify(from)} → ${stringify(to)}`;
      }
      return `${field}: ${stringify(value)}`;
    })
    .join("; ");
}

function stringify(value: unknown): string {
  if (value === null || value === undefined || value === "") return "∅";
  const text = typeof value === "object" ? JSON.stringify(value) : String(value);
  return text.length > 28 ? `${text.slice(0, 28)}…` : text;
}

export default async function AuditLogPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin();
  const params = await searchParams;
  const str = (key: string) => (typeof params[key] === "string" ? params[key] : undefined);
  const page = typeof params.page === "string" ? Number(params.page) : 1;

  const [{ rows, page: current, pageCount, total }, users] = await Promise.all([
    getAuditLogs(page, 20, {
      entity: str("entity"),
      action: str("action"),
      userId: str("userId"),
      from: str("from"),
      to: str("to"),
    }),
    getUsersList(),
  ]);

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Audit log"
        description={`Every create, update and delete across the workspace — ${total} matching entries. Personal data is redacted; entries older than 90 days are pruned.`}
      />
      <AuditFilters users={users.map((user) => ({ id: user.id, name: user.name }))} />
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-36">When</TableHead>
              <TableHead className="w-40">Actor</TableHead>
              <TableHead className="w-36">Action</TableHead>
              <TableHead>What changed</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="py-10 text-center text-sm text-muted-foreground">
                  No entries match the current filters.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="text-xs text-muted-foreground">{formatDateTime(row.createdAt)}</TableCell>
                  <TableCell className="text-sm">{row.userName}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5">
                      <Badge
                        variant="secondary"
                        className={cn(
                          row.action === "CREATE" && "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
                          row.action === "DELETE" && "bg-red-500/15 text-red-700 dark:text-red-400"
                        )}
                      >
                        {row.action}
                      </Badge>
                      <span className="text-xs text-muted-foreground">{row.entity}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{describeChanges(row.changes)}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
        <span>
          Page {current} / {pageCount}
        </span>
        <div className="flex gap-2">
          <Button asChild variant="outline" size="sm" disabled={current <= 1}>
            <Link href={`/admin/audit?page=${current - 1}`}>Previous</Link>
          </Button>
          <Button asChild variant="outline" size="sm" disabled={current >= pageCount}>
            <Link href={`/admin/audit?page=${current + 1}`}>Next</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
