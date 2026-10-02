import Link from "next/link";
import { requireAuth } from "@/lib/session";
import { getTasksForUser } from "@/lib/queries";
import { PageHeader } from "@/components/page-header";
import { TaskList } from "@/components/tasks/task-list";
import { CreateTaskDialog } from "@/components/tasks/create-task-dialog";

export const dynamic = "force-dynamic";
export const metadata = { title: "Tasks" };

export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireAuth();
  const params = await searchParams;
  const scope = params.scope === "all" && session.user.role === "ADMIN" ? "all" : "mine";
  const tasks = await getTasksForUser({ id: session.user.id, role: session.user.role }, scope);
  const openCount = tasks.filter((task) => task.status === "OPEN").length;

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Tasks"
        description={
          scope === "all"
            ? `Team follow-ups — ${openCount} open.`
            : `Your follow-ups — ${openCount} open.`
        }
        actions={
          <div className="flex items-center gap-2">
            {session.user.role === "ADMIN" ? (
              <>
                <Link
                  href="/tasks?scope=mine"
                  className={scope === "mine" ? "font-medium text-foreground" : "text-muted-foreground hover:text-foreground"}
                >
                  Mine
                </Link>
                <Link
                  href="/tasks?scope=all"
                  className={scope === "all" ? "font-medium text-foreground" : "text-muted-foreground hover:text-foreground"}
                >
                  Team
                </Link>
              </>
            ) : null}
            <CreateTaskDialog />
          </div>
        }
      />
      <TaskList tasks={tasks} />
    </div>
  );
}
