"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import Papa from "papaparse";
import {
  Download,
  EllipsisVertical,
  Pencil,
  Search,
  Trash2,
  UserRoundPlus,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import type { ContactRow, Paged } from "@/lib/queries";
import { deleteContact } from "@/lib/actions/contacts";
import { ContactFormDialog, type ContactFormValues } from "@/components/contacts/contact-form-dialog";
import { ImportContactsDialog } from "@/components/contacts/import-contacts-dialog";
import { ConfirmDeleteDialog } from "@/components/confirm-delete-dialog";
import { ContactStatusBadge } from "@/components/badges";
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

interface UsersOption {
  id: string;
  name: string;
  email: string;
  role: "ADMIN" | "SALES";
}

interface AccountsOption {
  id: string;
  name: string;
}

interface ContactsTableProps {
  data: Paged<ContactRow>;
  users: UsersOption[];
  accounts: AccountsOption[];
  currentUserId: string;
  isAdmin: boolean;
  search: string;
  status: string;
}

export function ContactsTable({ data, users, accounts, currentUserId, isAdmin, search, status }: ContactsTableProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [searchInput, setSearchInput] = React.useState(search);

  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<ContactRow | null>(null);
  const [deleting, setDeleting] = React.useState<ContactRow | null>(null);
  const [pendingDelete, startDelete] = React.useTransition();

  const pushParams = (updates: Record<string, string | undefined>) => {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(updates)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    if (!("page" in updates)) params.delete("page");
    router.push(`/contacts?${params.toString()}`);
  };

  const handleExport = () => {
    const csv = Papa.unparse(
      data.rows.map((row) => ({
        name: row.name,
        email: row.email ?? "",
        phone: row.phone ?? "",
        position: row.position ?? "",
        company: row.accountName,
        status: row.status,
        owner: row.ownerName,
      }))
    );
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `contacts-page-${data.page}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${data.rows.length} contacts`);
  };

  const handleDelete = () => {
    if (!deleting) return;
    startDelete(async () => {
      const result = await deleteContact(deleting.id);
      if (result.ok) {
        toast.success(`Deleted ${deleting.name}`);
        setDeleting(null);
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  };

  const openEdit = (row: ContactRow): ContactFormValues => ({
    name: row.name,
    email: row.email ?? "",
    phone: row.phone ?? "",
    position: row.position ?? "",
    status: row.status,
    accountId: row.accountId,
    ownerId: row.ownerId,
  });

  return (
    <div className="space-y-4">
      {/* Toolbar */}
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
            placeholder="Search name, email, company…"
            className="pl-8"
          />
        </form>

        <Select value={status || "ALL"} onValueChange={(value) => pushParams({ status: value === "ALL" ? undefined : value })}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All statuses</SelectItem>
            <SelectItem value="LEAD">Lead</SelectItem>
            <SelectItem value="PROSPECT">Prospect</SelectItem>
            <SelectItem value="CUSTOMER">Customer</SelectItem>
          </SelectContent>
        </Select>

        <div className="ml-auto flex items-center gap-2">
          <Button variant="outline" onClick={handleExport} disabled={data.rows.length === 0}>
            <Download className="size-4" /> Export
          </Button>
          <ImportContactsDialog />
          <Button
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            <UserRoundPlus className="size-4" /> New contact
          </Button>
        </div>
      </div>

      {/* Table */}
      {data.rows.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No contacts found"
          description="Try a different search, import a CSV, or create your first contact."
          action={
            <Button
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
            >
              <UserRoundPlus className="size-4" /> New contact
            </Button>
          }
        />
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Account</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="hidden md:table-cell">Contact info</TableHead>
                <TableHead className="hidden lg:table-cell">Owner</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>
                    <Link href={`/contacts/${row.id}`} className="font-medium hover:underline">
                      {row.name}
                    </Link>
                    {row.position ? (
                      <p className="text-xs text-muted-foreground">{row.position}</p>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-sm">{row.accountName}</TableCell>
                  <TableCell>
                    <ContactStatusBadge status={row.status} />
                  </TableCell>
                  <TableCell className="hidden text-sm text-muted-foreground md:table-cell">
                    <p>{row.email ?? "—"}</p>
                    <p>{row.phone ?? ""}</p>
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

      {/* Pagination */}
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

      {/* Dialogs */}
      <ContactFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        initial={editing ? openEdit(editing) : null}
        editingId={editing?.id ?? null}
        users={users}
        accounts={accounts}
        currentUserId={currentUserId}
        isAdmin={isAdmin}
      />

      <ContactDeleteDialog
        deleting={deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
        onDelete={handleDelete}
        pending={pendingDelete}
      />
    </div>
  );
}

function ContactDeleteDialog({
  deleting,
  onOpenChange,
  onDelete,
  pending,
}: {
  deleting: ContactRow | null;
  onOpenChange: (open: boolean) => void;
  onDelete: () => void;
  pending: boolean;
}) {
  return (
    <ConfirmDeleteDialog
      open={deleting !== null}
      onOpenChange={onOpenChange}
      title={`Delete ${deleting?.name ?? ""}?`}
      description="This permanently removes the contact along with their deals, activities and tasks."
      onConfirm={onDelete}
      pending={pending}
    />
  );
}
