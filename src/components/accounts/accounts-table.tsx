"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import Papa from "papaparse";
import { Building2, Download, EllipsisVertical, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { AccountRow, Paged } from "@/lib/queries";
import { deleteAccount } from "@/lib/actions/accounts";
import { AccountFormDialog } from "@/components/accounts/account-form-dialog";
import { ConfirmDeleteDialog } from "@/components/confirm-delete-dialog";
import { EmptyState } from "@/components/empty-state";
import { formatCompactCurrency } from "@/lib/format";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface AccountsTableProps {
  data: Paged<AccountRow>;
  search: string;
}

export function AccountsTable({ data, search }: AccountsTableProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [searchInput, setSearchInput] = React.useState(search);
  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<AccountRow | null>(null);
  const [deleting, setDeleting] = React.useState<AccountRow | null>(null);
  const [pendingDelete, startDelete] = React.useTransition();

  const pushParams = (updates: Record<string, string | undefined>) => {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(updates)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    if (!("page" in updates)) params.delete("page");
    router.push(`/accounts?${params.toString()}`);
  };

  const handleExport = () => {
    const csv = Papa.unparse(
      data.rows.map((row) => ({
        name: row.name,
        industry: row.industry ?? "",
        website: row.website ?? "",
        phone: row.phone ?? "",
        contacts: row.contactCount,
        deals: row.dealCount,
        openValue: row.openValue,
        owner: row.ownerName,
      }))
    );
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `accounts-page-${data.page}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${data.rows.length} accounts`);
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
            placeholder="Search name, industry…"
            className="pl-8"
          />
        </form>

        <div className="ml-auto flex items-center gap-2">
          <Button variant="outline" onClick={handleExport} disabled={data.rows.length === 0}>
            <Download className="size-4" /> Export
          </Button>
          <Button
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            <Plus className="size-4" /> New account
          </Button>
        </div>
      </div>

      {data.rows.length === 0 ? (
        <EmptyState
          icon={Building2}
          title="No accounts found"
          description="Accounts hold your companies. Create one, convert a lead, or import contacts to get started."
          action={
            <Button
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
            >
              <Plus className="size-4" /> New account
            </Button>
          }
        />
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Company</TableHead>
                <TableHead className="hidden md:table-cell">Industry</TableHead>
                <TableHead className="text-right">Contacts</TableHead>
                <TableHead className="text-right">Deals</TableHead>
                <TableHead className="hidden text-right sm:table-cell">Open value</TableHead>
                <TableHead className="hidden lg:table-cell">Owner</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>
                    <Link href={`/accounts/${row.id}`} className="font-medium hover:underline">
                      {row.name}
                    </Link>
                    {row.website ? <p className="text-xs text-muted-foreground">{row.website}</p> : null}
                  </TableCell>
                  <TableCell className="hidden text-sm md:table-cell">{row.industry ?? "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">{row.contactCount}</TableCell>
                  <TableCell className="text-right tabular-nums">{row.dealCount}</TableCell>
                  <TableCell className="hidden text-right tabular-nums sm:table-cell">
                    {formatCompactCurrency(row.openValue)}
                  </TableCell>
                  <TableCell className="hidden lg:table-cell">
                    <Badge variant="outline">{row.ownerName}</Badge>
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" aria-label={`Actions for ${row.name}`}>
                          <EllipsisVertical className="size-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() => {
                            setEditing(row);
                            setFormOpen(true);
                          }}
                        >
                          <Pencil className="size-4" /> Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem variant="destructive" onClick={() => setDeleting(row)}>
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

      <AccountFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        initial={editing ? { name: editing.name, industry: editing.industry ?? "", website: editing.website ?? "", phone: editing.phone ?? "" } : null}
        editingId={editing?.id ?? null}
      />

      <ConfirmDeleteDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={`Delete ${deleting?.name ?? ""}?`}
        description="This cascades: the account's contacts, their deals, activities and tasks are deleted too."
        pending={pendingDelete}
        onConfirm={() => {
          if (!deleting) return;
          startDelete(async () => {
            const result = await deleteAccount(deleting.id);
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
