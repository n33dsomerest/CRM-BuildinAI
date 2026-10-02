import { requireAuth } from "@/lib/session";
import { getAccountsPage } from "@/lib/queries";
import { PageHeader } from "@/components/page-header";
import { AccountsTable } from "@/components/accounts/accounts-table";

export const dynamic = "force-dynamic";
export const metadata = { title: "Accounts" };

export default async function AccountsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireAuth();
  const params = await searchParams;
  const search = typeof params.search === "string" ? params.search : undefined;
  const page = typeof params.page === "string" ? Number(params.page) : 1;

  const data = await getAccountsPage({ id: session.user.id, role: session.user.role }, { search, page });

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="Accounts"
        description="The companies behind your contacts and deals."
      />
      <AccountsTable data={data} search={search ?? ""} />
    </div>
  );
}
