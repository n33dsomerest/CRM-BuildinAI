"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Building2,
  ClipboardList,
  Command as CommandIcon,
  Gauge,
  KanbanSquare,
  LogOut,
  Menu,
  Moon,
  ScrollText,
  Search,
  Sun,
  UserPlus,
  Users,
} from "lucide-react";
import { useTheme } from "next-themes";
import { logoutAction } from "@/lib/actions/auth";
import { CommandMenu } from "@/components/command-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { initials } from "@/lib/format";

export interface ShellUser {
  id: string;
  name: string;
  email: string;
  role: "ADMIN" | "SALES";
}

const NAV_MAIN = [
  { href: "/", label: "Dashboard", icon: Gauge },
  { href: "/leads", label: "Leads", icon: UserPlus },
  { href: "/contacts", label: "Contacts", icon: Users },
  { href: "/accounts", label: "Accounts", icon: Building2 },
  { href: "/deals", label: "Deals", icon: KanbanSquare },
  { href: "/tasks", label: "Tasks", icon: ClipboardList },
];

const NAV_ADMIN = [
  { href: "/admin/users", label: "Users", icon: Users },
  { href: "/admin/audit", label: "Audit Log", icon: ScrollText },
];

interface AppShellProps {
  user: ShellUser;
  children: React.ReactNode;
}

export function AppShell({ user, children }: AppShellProps) {
  const pathname = usePathname();
  const [commandOpen, setCommandOpen] = React.useState(false);
  const [mobileNavOpen, setMobileNavOpen] = React.useState(false);

  React.useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if (event.key === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setCommandOpen((open) => !open);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  const nav = (
    <SidebarNav pathname={pathname} isAdmin={user.role === "ADMIN"} onNavigate={() => setMobileNavOpen(false)} />
  );

  return (
    <div className="flex min-h-svh w-full">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-svh w-60 shrink-0 flex-col border-r bg-sidebar text-sidebar-foreground md:flex">
        <BrandMark />
        <nav className="flex-1 overflow-y-auto px-3 py-2">{nav}</nav>
        <SidebarFooter />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Topbar */}
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/75">
          {/* Mobile nav */}
          <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="md:hidden" aria-label="Open navigation">
                <Menu className="size-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-64 p-0">
              <SheetTitle className="sr-only">Navigation</SheetTitle>
              <div className="flex h-full flex-col">
                <div className="px-3 pt-4">
                  <BrandMark />
                </div>
                <nav className="flex-1 overflow-y-auto px-3 py-2">{nav}</nav>
              </div>
            </SheetContent>
          </Sheet>

          <Button
            variant="outline"
            className="ml-auto h-9 w-9 gap-2 p-0 text-muted-foreground sm:w-56 sm:justify-start sm:p-2"
            onClick={() => setCommandOpen(true)}
          >
            <Search className="size-4" />
            <span className="hidden sm:inline">Search…</span>
            <kbd className="ml-auto hidden items-center gap-0.5 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium sm:flex">
              <CommandIcon className="size-3" />K
            </kbd>
          </Button>

          <ThemeToggle />

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="h-9 gap-2 px-2">
                <Avatar className="size-7">
                  <AvatarFallback className="text-xs">{initials(user.name)}</AvatarFallback>
                </Avatar>
                <span className="hidden max-w-32 truncate text-sm font-medium lg:inline">{user.name}</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>
                <p className="truncate text-sm font-medium">{user.name}</p>
                <p className="truncate text-xs text-muted-foreground">{user.email}</p>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="py-1">
                <Badge variant={user.role === "ADMIN" ? "default" : "secondary"}>{user.role}</Badge>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onClick={() => void logoutAction()}>
                <LogOut className="size-4" /> Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </header>

        <main className="flex-1 p-4 md:p-6">{children}</main>
      </div>

      <CommandMenu open={commandOpen} onOpenChange={setCommandOpen} isAdmin={user.role === "ADMIN"} />
    </div>
  );
}

function BrandMark() {
  return (
    <Link href="/" className="flex items-center gap-2 px-4 py-4">
      <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
        <Building2 className="size-4" />
      </span>
      <span className="text-sm font-semibold tracking-tight">Enterprise CRM</span>
    </Link>
  );
}

function SidebarFooter() {
  return (
    <div className="border-t px-4 py-3 text-xs text-muted-foreground">
      Next.js · Prisma · Neon
    </div>
  );
}

function SidebarNav({
  pathname,
  isAdmin,
  onNavigate,
}: {
  pathname: string;
  isAdmin: boolean;
  onNavigate?: () => void;
}) {
  const item = (href: string, label: string, Icon: React.ComponentType<{ className?: string }>) => {
    const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
    return (
      <Link
        key={href}
        href={href}
        onClick={onNavigate}
        className={cn(
          "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
          active
            ? "bg-sidebar-accent text-sidebar-accent-foreground"
            : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
        )}
      >
        <Icon className="size-4" />
        {label}
      </Link>
    );
  };

  return (
    <div className="space-y-4">
      <div className="space-y-1">{NAV_MAIN.map(({ href, label, icon: Icon }) => item(href, label, Icon))}</div>
      {isAdmin ? (
        <div className="space-y-1">
          <p className="px-3 pb-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">Admin</p>
          {NAV_ADMIN.map(({ href, label, icon: Icon }) => item(href, label, Icon))}
        </div>
      ) : null}
    </div>
  );
}

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();

  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label="Toggle theme"
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
    >
      {/* CSS-only swap avoids hydration-sensitive mounted state */}
      <Sun className="size-5 hidden dark:block" />
      <Moon className="size-5 dark:hidden" />
    </Button>
  );
}
