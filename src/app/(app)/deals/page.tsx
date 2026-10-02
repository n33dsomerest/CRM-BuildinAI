import { requireAuth } from "@/lib/session";
import { getAccountsList, getContactsForSelect, getDealsBoard, getStagesList, getUsersList } from "@/lib/queries";
import { PageHeader } from "@/components/page-header";
import { KanbanBoard } from "@/components/deals/kanban-board";

export const dynamic = "force-dynamic";
export const metadata = { title: "Deals" };

export default async function DealsPage() {
  const session = await requireAuth();
  const user = { id: session.user.id, role: session.user.role };

  const [columns, stages, users, accounts, contacts] = await Promise.all([
    getDealsBoard(user),
    getStagesList(),
    getUsersList(),
    getAccountsList(user),
    getContactsForSelect(user),
  ]);

  return (
    <div className="mx-auto max-w-[1400px]">
      <PageHeader
        title="Deal pipeline"
        description="Drag deals across stages. Each column shows open value and its probability weighting."
      />
      <KanbanBoard
        columns={columns}
        stages={stages}
        users={users}
        accounts={accounts}
        contacts={contacts}
        currentUserId={session.user.id}
        isAdmin={session.user.role === "ADMIN"}
      />
    </div>
  );
}
