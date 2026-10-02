import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Globe, Phone, Trophy } from "lucide-react";
import { requireAuth } from "@/lib/session";
import { getAccountDetail } from "@/lib/queries";
import { formatCurrency } from "@/lib/format";
import { ContactStatusBadge } from "@/components/badges";
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

export default async function AccountDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireAuth();
  const { id } = await params;
  const account = await getAccountDetail({ id: session.user.id, role: session.user.role }, id);
  if (!account) notFound();

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2 text-muted-foreground">
        <Link href="/accounts">
          <ArrowLeft className="size-4" /> All accounts
        </Link>
      </Button>

      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{account.name}</h1>
        <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
          <span>{account.industry ?? "Industry unknown"}</span>
          {account.website ? (
            <span className="flex items-center gap-1">
              <Globe className="size-3.5" /> {account.website}
            </span>
          ) : null}
          {account.phone ? (
            <span className="flex items-center gap-1">
              <Phone className="size-3.5" /> {account.phone}
            </span>
          ) : null}
          <span>Owned by {account.ownerName}</span>
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Contacts</CardTitle>
            <CardDescription>{account.contacts.length} people at this company</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {account.contacts.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">No contacts yet.</p>
            ) : (
              account.contacts.map((contact) => (
                <div key={contact.id} className="flex items-center justify-between gap-2 rounded-lg border p-3">
                  <div className="min-w-0">
                    <Link href={`/contacts/${contact.id}`} className="truncate text-sm font-medium hover:underline">
                      {contact.name}
                    </Link>
                    <p className="truncate text-xs text-muted-foreground">{contact.email ?? "—"}</p>
                  </div>
                  <ContactStatusBadge status={contact.status} />
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Deals</CardTitle>
            <CardDescription>{account.deals.length} deals linked to this company</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {account.deals.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">No deals yet.</p>
            ) : (
              account.deals.map((deal) => (
                <div key={deal.id} className="flex items-center justify-between gap-2 rounded-lg border p-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{deal.title}</p>
                    <p className="text-xs text-muted-foreground">{deal.stageName}</p>
                  </div>
                  <span
                    className={cn(
                      "text-sm font-semibold tabular-nums",
                      deal.isWon && "text-emerald-600 dark:text-emerald-400",
                      deal.isLost && "text-red-500"
                    )}
                  >
                    {formatCurrency(deal.value)}
                    {deal.isWon ? <Trophy className="ml-1 inline size-3.5" /> : null}
                  </span>
                </div>
              ))
            )}
            <Button asChild variant="ghost" size="sm" className="w-full">
              <Link href="/deals">Open pipeline</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
