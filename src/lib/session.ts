import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";

/** Session or null — for components that can handle anonymous users. */
export async function getSession() {
  return await auth();
}

/** Server-component guard: redirects to /login when not authenticated. */
export async function requireAuth() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  return session;
}

/** Admin-only guard: redirects non-admins to the dashboard. */
export async function requireAdmin() {
  const session = await requireAuth();
  if (session.user.role !== "ADMIN") redirect("/");
  return session;
}
