import { requireAuth } from "@/lib/session";
import { getLeadsPage } from "@/lib/queries";
import { getQuotaState } from "@/lib/ai/quota";
import { isAiConfigured } from "@/lib/ai/config";
import { PageHeader } from "@/components/page-header";
import { LeadsTable } from "@/components/leads/leads-table";

export const dynamic = "force-dynamic";
export const metadata = { title: "Leads" };

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireAuth();
  const params = await searchParams;
  const search = typeof params.search === "string" ? params.search : undefined;
  const status = typeof params.status === "string" ? params.status : undefined;
  const page = typeof params.page === "string" ? Number(params.page) : 1;

  const [data, aiRemaining] = await Promise.all([
    getLeadsPage({ id: session.user.id, role: session.user.role }, { search, status, page }),
    getQuotaState(session.user.id).then((state) => state.remaining),
  ]);

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="Leads"
        description="Raw prospects before qualification — convert a qualified lead into an account, contact and deal in one click."
      />
      <LeadsTable
        data={data}
        search={search ?? ""}
        status={status ?? ""}
        currentUserId={session.user.id}
        aiRemaining={aiRemaining}
        aiConfigured={isAiConfigured()}
      />
    </div>
  );
}
