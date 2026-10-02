"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Filter, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const ENTITIES = ["Contact", "Deal", "Lead", "Activity", "Task", "Account", "User"];
const ACTIONS = ["CREATE", "UPDATE", "DELETE"];

interface AuditFiltersProps {
  users: { id: string; name: string }[];
}

export function AuditFilters({ users }: AuditFiltersProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [from, setFrom] = React.useState(searchParams.get("from") ?? "");
  const [to, setTo] = React.useState(searchParams.get("to") ?? "");

  const push = (updates: Record<string, string | undefined>) => {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(updates)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    params.delete("page");
    router.push(`/admin/audit?${params.toString()}`);
  };

  const hasFilters = ["entity", "action", "userId", "from", "to"].some((key) => searchParams.get(key));

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <Filter className="size-4 text-muted-foreground" />
      <Select
        value={searchParams.get("entity") ?? "ALL"}
        onValueChange={(value) => push({ entity: value === "ALL" ? undefined : value })}
      >
        <SelectTrigger className="w-36">
          <SelectValue placeholder="All entities" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="ALL">All entities</SelectItem>
          {ENTITIES.map((entity) => (
            <SelectItem key={entity} value={entity}>
              {entity}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={searchParams.get("action") ?? "ALL"}
        onValueChange={(value) => push({ action: value === "ALL" ? undefined : value })}
      >
        <SelectTrigger className="w-36">
          <SelectValue placeholder="All actions" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="ALL">All actions</SelectItem>
          {ACTIONS.map((action) => (
            <SelectItem key={action} value={action}>
              {action}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={searchParams.get("userId") ?? "ALL"}
        onValueChange={(value) => push({ userId: value === "ALL" ? undefined : value })}
      >
        <SelectTrigger className="w-44">
          <SelectValue placeholder="Everyone" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="ALL">Everyone</SelectItem>
          {users.map((user) => (
            <SelectItem key={user.id} value={user.id}>
              {user.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Input
        type="date"
        value={from}
        onChange={(event) => setFrom(event.target.value)}
        className="w-40"
        aria-label="From date"
        onBlur={() => push({ from: from || undefined })}
      />
      <Input
        type="date"
        value={to}
        onChange={(event) => setTo(event.target.value)}
        className="w-40"
        aria-label="To date"
        onBlur={() => push({ to: to || undefined })}
      />

      {hasFilters ? (
        <Button variant="ghost" size="sm" onClick={() => push({ entity: undefined, action: undefined, userId: undefined, from: undefined, to: undefined })}>
          <X className="size-4" /> Clear
        </Button>
      ) : null}
    </div>
  );
}
