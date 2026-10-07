"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowRightLeft,
  EllipsisVertical,
  Pencil,
  Search,
  Trash2,
  UserPlus,
} from "lucide-react";
import { toast } from "sonner";
import type { LeadRow, Paged } from "@/lib/queries";
import { deleteLead, updateLeadStatus } from "@/lib/actions/leads";
import { LeadFormDialog } from "@/components/leads/lead-form-dialog";
import { ConvertLeadDialog } from "@/components/leads/convert-lead-dialog";
import { BatchScoreDialog } from "@/components/ai/batch-score-dialog";
import { AiActionButton } from "@/components/ai/ai-action-button";
import { scoreLead } from "@/lib/actions/ai";
import type { ModelBudgetState } from "@/lib/ai/quota";
import { ConfirmDeleteDialog } from "@/components/confirm-delete-dialog";
import { LeadSourceLabel, LeadStatusBadge } from "@/components/badges";
import { EmptyState } from "@/components/empty-state";
import { formatRelative } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface LeadsTableProps {
  data: Paged<LeadRow>;
  search: string;
  status: string;
  currentUserId: string;
  aiBudget?: ModelBudgetState | null;
  aiConfigured?: boolean;
}

export function LeadsTable({ data, search, status, currentUserId, aiBudget, aiConfigured = false }: LeadsTableProps) {
  const leads = data.rows;
  const router = useRouter();
  const searchParams = useSearchParams();
  const [searchInput, setSearchInput] = React.useState(search);

  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<LeadRow | null>(null);
  const [converting, setConverting] = React.useState<LeadRow | null>(null);
  const [deleting, setDeleting] = React.useState<LeadRow | null>(null);
  const [pendingDelete, startDelete] = React.useTransition();

  const budgetExhausted =
    !!aiBudget &&
    !aiBudget.unknown &&
    (aiBudget.sharedRemaining <= 0 || (aiBudget.userLimit > 0 && aiBudget.userUsed >= aiBudget.userLimit));

  const pushParams = (updates: Record<string, string | undefined>) => {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(updates)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    if (!("page" in updates)) params.delete("page");
    router.push(`/leads?${params.toString()}`);
  };

  const quickStatus = async (lead: LeadRow, next: string) => {
    const result = await updateLeadStatus(lead.id, next);
    if (result.ok) {
      toast.success(`${lead.name} → ${next.toLowerCase()}`);
      router.refresh();
    } else {
      toast.error(result.error);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <form
          className="relative w-full max-w-xs"
          onSubmit={(event) => {
            event.preventDefault();
            pushParams({ search: searchInput });
          }}
        >
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Search name, company, email…"
            className="pl-8"
          />
        </form>

        <Select value={status || "ALL"} onValueChange={(value) => pushParams({ status: value === "ALL" ? undefined : value })}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All statuses</SelectItem>
            <SelectItem value="NEW">New</SelectItem>
            <SelectItem value="WORKING">Working</SelectItem>
            <SelectItem value="QUALIFIED">Qualified</SelectItem>
            <SelectItem value="UNQUALIFIED">Unqualified</SelectItem>
          </SelectContent>
        </Select>

        <div className="ml-auto flex items-center gap-2">
          {aiConfigured ? (
            <BatchScoreDialog aiConfigured={aiConfigured} onScored={() => router.refresh()} />
          ) : null}
          <Button
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            <UserPlus className="size-4" /> New lead
          </Button>
        </div>
      </div>

      {leads.length === 0 ? (
        <EmptyState
          icon={UserPlus}
          title="No leads yet"
          description="Capture raw prospects here, then convert the good ones into accounts and deals."
          action={
            <Button
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
            >
              <UserPlus className="size-4" /> New lead
            </Button>
          }
        />
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Lead</TableHead>
                <TableHead className="hidden md:table-cell">Source</TableHead>
                <TableHead>Status</TableHead>
                {aiConfigured ? <TableHead className="w-24">AI score</TableHead> : null}
                <TableHead className="hidden lg:table-cell">Owner</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {leads.map((lead) => (
                <TableRow key={lead.id}>
                  <TableCell>
                    <p className="font-medium">{lead.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {lead.company ?? "—"}
                      {lead.email ? ` · ${lead.email}` : ""}
                    </p>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    <LeadSourceLabel source={lead.source} />
                  </TableCell>
                  <TableCell>
                    <Select
                      value={lead.status}
                      onValueChange={(value) => void quickStatus(lead, value)}
                    >
                      <SelectTrigger className="h-8 w-36 border-none bg-transparent p-0 shadow-none focus:ring-0 [&>svg]:ml-1">
                        <LeadStatusBadge status={lead.status} />
                      </SelectTrigger>
                      <SelectContent align="start" className="w-36">
                        <SelectItem value="NEW">New</SelectItem>
                        <SelectItem value="WORKING">Working</SelectItem>
                        <SelectItem value="QUALIFIED">Qualified</SelectItem>
                        <SelectItem value="UNQUALIFIED">Unqualified</SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                  {aiConfigured ? (
                    <TableCell>
                      {lead.score !== null ? (
                        <div>
                          <span
                            className="inline-flex size-8 items-center justify-center rounded-full border text-xs font-semibold tabular-nums"
                            title={lead.scoreReason ?? "AI suggestion"}
                          >
                            {lead.score}
                          </span>
                          <p className="text-[10px] text-muted-foreground" suppressHydrationWarning>
                            scored {formatRelative(lead.scoredAt)}
                          </p>
                        </div>
                      ) : (
                        <AiActionButton
                          label={budgetExhausted ? "AI limit reached" : "Score"}
                          variant="ghost"
                          disabledReason={
                            budgetExhausted ? "Daily token budget reached - resets within 24h" : undefined
                          }
                          onClick={async () => await scoreLead(lead.id)}
                          onSuccess={(result) => {
                            toast.success(`${lead.name}: ${result.data.score} - ${result.data.reason}`);
                            router.refresh();
                          }}
                        />
                      )}
                    </TableCell>
                  ) : null}
                  <TableCell className="hidden lg:table-cell">
                    <Badge variant="outline">{lead.ownerName}</Badge>
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" aria-label={`Actions for ${lead.name}`}>
                          <EllipsisVertical className="size-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          className="text-emerald-600 focus:text-emerald-600 dark:text-emerald-400"
                          onClick={() => setConverting(lead)}
                        >
                          <ArrowRightLeft className="size-4" /> Convert…
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => {
                            setEditing(lead);
                            setFormOpen(true);
                          }}
                        >
                          <Pencil className="size-4" /> Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem variant="destructive" onClick={() => setDeleting(lead)}>
                          <Trash2 className="size-4" /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {data.rows.length > 0 ? (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            Showing {(data.page - 1) * data.pageSize + 1}–{Math.min(data.page * data.pageSize, data.total)} of{" "}
            {data.total}
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={data.page <= 1}
              onClick={() => pushParams({ page: String(data.page - 1) })}
            >
              Previous
            </Button>
            <span>
              Page {data.page} / {data.pageCount}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={data.page >= data.pageCount}
              onClick={() => pushParams({ page: String(data.page + 1) })}
            >
              Next
            </Button>
          </div>
        </div>
      ) : null}

      <LeadFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        initial={
          editing
            ? {
                name: editing.name,
                email: editing.email ?? "",
                phone: editing.phone ?? "",
                company: editing.company ?? "",
                source: editing.source,
                status: editing.status,
              }
            : null
        }
        editingId={editing?.id ?? null}
        currentUserId={currentUserId}
      />

      <ConvertLeadDialog lead={converting} onOpenChange={(open) => !open && setConverting(null)} />

      <ConfirmDeleteDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={`Delete ${deleting?.name ?? ""}?`}
        description="The lead will be removed permanently."
        pending={pendingDelete}
        onConfirm={() => {
          if (!deleting) return;
          startDelete(async () => {
            const result = await deleteLead(deleting.id);
            if (result.ok) {
              toast.success(`Deleted ${deleting.name}`);
              setDeleting(null);
              router.refresh();
            } else {
              toast.error(result.error);
            }
          });
        }}
      />
    </div>
  );
}
