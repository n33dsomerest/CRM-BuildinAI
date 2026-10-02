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
import type { LeadRow } from "@/lib/queries";
import { deleteLead, updateLeadStatus } from "@/lib/actions/leads";
import { LeadFormDialog } from "@/components/leads/lead-form-dialog";
import { ConvertLeadDialog } from "@/components/leads/convert-lead-dialog";
import { ConfirmDeleteDialog } from "@/components/confirm-delete-dialog";
import { LeadSourceLabel, LeadStatusBadge } from "@/components/badges";
import { EmptyState } from "@/components/empty-state";
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
  leads: LeadRow[];
  search: string;
  status: string;
  currentUserId: string;
}

export function LeadsTable({ leads, search, status, currentUserId }: LeadsTableProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [searchInput, setSearchInput] = React.useState(search);

  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<LeadRow | null>(null);
  const [converting, setConverting] = React.useState<LeadRow | null>(null);
  const [deleting, setDeleting] = React.useState<LeadRow | null>(null);
  const [pendingDelete, startDelete] = React.useTransition();

  const pushParams = (updates: Record<string, string | undefined>) => {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(updates)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
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

        <Button
          className="ml-auto"
          onClick={() => {
            setEditing(null);
            setFormOpen(true);
          }}
        >
          <UserPlus className="size-4" /> New lead
        </Button>
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
                      <SelectContent>
                        <SelectItem value="NEW">New</SelectItem>
                        <SelectItem value="WORKING">Working</SelectItem>
                        <SelectItem value="QUALIFIED">Qualified</SelectItem>
                        <SelectItem value="UNQUALIFIED">Unqualified</SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
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
