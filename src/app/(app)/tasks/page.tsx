import { requireAuth } from "@/lib/session";
import { getMyTasks } from "@/lib/queries";
import { PageHeader } from "@/components/page-header";
import { TaskList } from "@/components/tasks/task-list";
import { CreateTaskDialog } from "@/components/tasks/create-task-dialog";

export const dynamic = "force-dynamic";
export const metadata = { title: "Tasks" };

export default async function TasksPage() {
  const session = await requireAuth();
  const tasks = await getMyTasks({ id: session.user.id, role: session.user.role });
  const openCount = tasks.filter((task) => task.status === "OPEN").length;

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Tasks"
        description={
          session.user.role === "ADMIN"
            ? `All follow-ups across the team — ${openCount} open.`
            : `Your follow-ups — ${openCount} open.`
        }
        actions={<CreateTaskDialog />}
      />
      <TaskList tasks={tasks} />
    </div>
  );
}
