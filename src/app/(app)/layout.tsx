import { requireAuth } from "@/lib/session";
import { AppShell } from "@/components/app-shell";
import { getAiConfig, DEFAULT_AI_CHAT_MODEL } from "@/lib/ai/config";
import { getPrimaryModelBudget } from "@/lib/ai/quota";
import { AiChatWidget } from "@/components/ai/chat-widget";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await requireAuth();
  const user = {
    id: session.user.id,
    name: session.user.name ?? session.user.email ?? "User",
    email: session.user.email ?? "",
    role: session.user.role,
  };

  // The chat widget is mounted once here so it appears on every authenticated
  // page (and never on /login). Budget figures for the chat model are computed
  // server-side; the QuotaIndicator in the panel header is informational and
  // refreshes on the next full page load.
  const aiConfig = getAiConfig();
  const chatModel = aiConfig?.chatModel ?? DEFAULT_AI_CHAT_MODEL;
  const chatLimit = aiConfig?.budgets.get(chatModel);
  const chatUserLimit =
    aiConfig?.userShare != null && chatLimit !== undefined
      ? Math.floor(chatLimit * aiConfig.userShare)
      : undefined;
  const chatBudget = aiConfig
    ? await getPrimaryModelBudget(session.user.id, chatModel, aiConfig.budgets, chatUserLimit)
    : null;

  return (
    <AppShell user={user}>
      {children}
      <AiChatWidget
        chatModel={chatModel}
        aiBudget={chatBudget}
        aiConfigured={aiConfig !== null}
      />
    </AppShell>
  );
}
