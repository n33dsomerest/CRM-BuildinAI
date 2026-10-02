import { requireAuth } from "@/lib/session";
import { getAccountsList, getContactsPage, getUsersList } from "@/lib/queries";
import { PageHeader } from "@/components/page-header";
import { ContactsTable } from "@/components/contacts/contacts-table";

export const dynamic = "force-dynamic";
export const metadata = { title: "Contacts" };

export default async function ContactsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireAuth();
  const params = await searchParams;
  const search = typeof params.search === "string" ? params.search : undefined;
  const status = typeof params.status === "string" ? params.status : undefined;
  const page = typeof params.page === "string" ? Number(params.page) : 1;

  const [data, users, accounts] = await Promise.all([
    getContactsPage({ id: session.user.id, role: session.user.role }, { search, status, page }),
    getUsersList(),
    getAccountsList({ id: session.user.id, role: session.user.role }),
  ]);

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="Contacts"
        description="People at your accounts — search, filter and import."
      />
      <ContactsTable
        data={data}
        users={users}
        accounts={accounts}
        currentUserId={session.user.id}
        isAdmin={session.user.role === "ADMIN"}
        search={search ?? ""}
        status={status ?? ""}
      />
    </div>
  );
}
