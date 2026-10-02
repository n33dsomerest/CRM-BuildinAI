"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Building2, Gauge, KanbanSquare, ScrollText, Users, UserPlus, ClipboardList } from "lucide-react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";

interface CommandMenuProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isAdmin: boolean;
}

export function CommandMenu({ open, onOpenChange, isAdmin }: CommandMenuProps) {
  const router = useRouter();

  const go = (href: string) => {
    onOpenChange(false);
    router.push(href);
  };

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="Type a command or search…" />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        <CommandGroup heading="Navigation">
          <CommandItem onSelect={() => go("/")}>
            <Gauge className="size-4" /> Dashboard
          </CommandItem>
          <CommandItem onSelect={() => go("/leads")}>
            <UserPlus className="size-4" /> Leads
          </CommandItem>
          <CommandItem onSelect={() => go("/contacts")}>
            <Users className="size-4" /> Contacts
          </CommandItem>
          <CommandItem onSelect={() => go("/accounts")}>
            <Building2 className="size-4" /> Accounts
          </CommandItem>
          <CommandItem onSelect={() => go("/deals")}>
            <KanbanSquare className="size-4" /> Deals
          </CommandItem>
          <CommandItem onSelect={() => go("/tasks")}>
            <ClipboardList className="size-4" /> Tasks
          </CommandItem>
        </CommandGroup>
        {isAdmin ? (
          <>
            <CommandSeparator />
            <CommandGroup heading="Admin">
              <CommandItem onSelect={() => go("/admin/users")}>
                <Users className="size-4" /> Manage users
              </CommandItem>
              <CommandItem onSelect={() => go("/admin/audit")}>
                <ScrollText className="size-4" /> Audit log
              </CommandItem>
            </CommandGroup>
          </>
        ) : null}
      </CommandList>
    </CommandDialog>
  );
}
