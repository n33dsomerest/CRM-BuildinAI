"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowUp, CircleStop, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { askAiQuestion, type ChatAnswer } from "@/lib/actions/ai-chat";
import { QuotaIndicator } from "@/components/ai/quota-indicator";
import type { ModelBudgetState } from "@/lib/ai/quota";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

interface ChatWidgetProps {
  chatModel: string;
  /** Chat model's token budget state - surfaced in the panel header. */
  aiBudget?: ModelBudgetState | null;
  aiConfigured?: boolean;
}

interface ChatMessage {
  id: number;
  role: "user" | "assistant";
  content: string;
  actions?: { label: string; href: string }[];
}

const EXAMPLE_QUESTIONS = [
  "How many deals do I have open?",
  "Which deals have no recent activity?",
  "What tasks are due soon?",
];

const SUGGESTED_QUESTION_CLASS =
  "rounded-full border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground";

/**
 * Floating "Ask AI" panel (Plan B). Client holds the conversation and sends
 * the last CHAT_MESSAGE_CAP messages per request; the server rebuilds the
 * scoped grounding snapshot every turn.
 *
 * The Stop button abandons the in-flight response client-side - server actions
 * have no abort path, so the attempt still finalises server-side and counts
 * against the daily budget (same honesty rule as every other AI surface).
 */
export function AiChatWidget({ chatModel, aiBudget, aiConfigured = false }: ChatWidgetProps) {
  const [open, setOpen] = React.useState(false);
  const [messages, setMessages] = React.useState<ChatMessage[]>([]);
  const [input, setInput] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const nextId = React.useRef(1);
  const abandonRef = React.useRef(false);
  const sentTextRef = React.useRef("");
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLTextAreaElement>(null);
  const fabRef = React.useRef<HTMLButtonElement>(null);

  // Auto-scroll to the newest message; jump-cut for prefers-reduced-motion.
  React.useEffect(() => {
    const viewport = scrollRef.current?.querySelector("[data-slot=scroll-area-viewport]");
    if (!viewport) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    viewport.scrollTo({ top: viewport.scrollHeight, behavior: reduced ? "auto" : "smooth" });
  }, [messages, pending]);

  if (!aiConfigured) return null;

  const openPanel = () => {
    setOpen(true);
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const closePanel = () => {
    setOpen(false);
    fabRef.current?.focus();
  };

  const send = async () => {
    const text = input.trim();
    if (!text || pending) return;

    const userMessage: ChatMessage = { id: nextId.current++, role: "user", content: text };
    const history = [...messages, userMessage]
      .slice(-12)
      .map(({ role, content }) => ({ role, content }));

    sentTextRef.current = text;
    setInput("");
    setMessages((prev) => [...prev, userMessage]);
    setPending(true);
    abandonRef.current = false;

    const result = await askAiQuestion({ messages: history });
    setPending(false);

    if (abandonRef.current) {
      // Stopped by the user: drop the optimistic bubble and restore the
      // question so it can be re-sent. The abandoned attempt still counted.
      abandonRef.current = false;
      setMessages((prev) => prev.filter((m) => m.id !== userMessage.id));
      if (!inputRef.current?.value.trim()) setInput(sentTextRef.current);
      return;
    }

    if (!result.ok) {
      // Input already holds whatever the user typed while waiting; restore the
      // sent text only when they have not started a new one. Never clear it.
      toast.error(result.error);
      setMessages((prev) => prev.filter((m) => m.id !== userMessage.id));
      if (!inputRef.current?.value.trim()) setInput(sentTextRef.current);
      return;
    }

    const answer: ChatAnswer = result.data;
    setMessages((prev) => [
      ...prev,
      { id: nextId.current++, role: "assistant", content: answer.answer, actions: answer.suggestedActions },
    ]);
  };

  const stop = () => {
    abandonRef.current = true;
    setPending(false);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void send();
    }
  };

  return (
    <div className="fixed right-4 bottom-6 z-50 md:right-6" data-testid="ai-chat-widget">
      {open ? (
        <div
          role="dialog"
          aria-label="Ask AI about your CRM"
          className="absolute right-0 bottom-[4.25rem] flex h-[520px] max-h-[calc(100svh-7rem)] w-[380px] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-xl border bg-background shadow-xl"
        >
          {/* Header */}
          <div className="flex items-center gap-2 border-b px-3 py-2.5">
            <span className="flex size-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Sparkles className="size-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm leading-tight font-medium">Ask AI</p>
              <p className="truncate text-[10px] text-muted-foreground">{chatModel}</p>
            </div>
            {aiBudget ? (
              <QuotaIndicator
                model={aiBudget.model}
                sharedUsed={aiBudget.sharedUsed}
                sharedLimit={aiBudget.sharedLimit}
                sharedRemaining={aiBudget.sharedRemaining}
                userUsed={aiBudget.userUsed}
                userLimit={aiBudget.userLimit}
                unknown={aiBudget.unknown}
                className="text-[10px]"
              />
            ) : null}
            <Button variant="ghost" size="icon-sm" aria-label="Close AI chat" onClick={closePanel}>
              <X className="size-4" />
            </Button>
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="min-h-0 flex-1">
            <ScrollArea className="h-full">
              <div className="space-y-3 px-3 py-3">
                {messages.length === 0 ? (
                  <div className="space-y-3 py-6 text-center">
                    <p className="text-sm text-muted-foreground">
                      Ask about your pipeline, contacts or tasks. Answers come from a snapshot of
                      records you can already see — no live database access.
                    </p>
                    <div className="flex flex-wrap justify-center gap-1.5">
                      {EXAMPLE_QUESTIONS.map((question) => (
                        <button
                          key={question}
                          type="button"
                          className={SUGGESTED_QUESTION_CLASS}
                          onClick={() => {
                            setInput(question);
                            inputRef.current?.focus();
                          }}
                        >
                          {question}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}

                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={cn("flex", message.role === "user" ? "justify-end" : "justify-start")}
                  >
                    <div
                      className={cn(
                        "max-w-[85%] space-y-1.5 rounded-lg px-3 py-2 text-sm whitespace-pre-wrap",
                        message.role === "user"
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-foreground"
                      )}
                    >
                      <p>{message.content}</p>
                      {message.actions?.length ? (
                        <div className="flex flex-wrap gap-1.5 pt-0.5">
                          {message.actions.map((action) => (
                            <Link
                              key={action.href}
                              href={action.href}
                              className={cn(SUGGESTED_QUESTION_CLASS, "bg-background")}
                            >
                              {action.label}
                            </Link>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  </div>
                ))}

                {pending ? (
                  <div className="flex justify-start">
                    <div className="flex items-center gap-2 rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground" role="status" aria-busy="true">
                      <Sparkles className="size-3.5 animate-pulse" />
                      {chatModel} is thinking…
                    </div>
                  </div>
                ) : null}
              </div>
            </ScrollArea>
          </div>

          {/* Composer */}
          <div className="flex items-end gap-2 border-t p-2">
            <Textarea
              ref={inputRef}
              rows={1}
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Ask about your CRM…"
              aria-label="Ask AI a question"
              className="max-h-28 min-h-9 resize-none"
            />
            {pending ? (
              <Button
                type="button"
                size="icon"
                variant="secondary"
                aria-label="Stop generating"
                title="Stop waiting (the attempt still counts against the daily limit)"
                onClick={stop}
              >
                <CircleStop className="size-4" />
              </Button>
            ) : (
              <Button
                type="button"
                size="icon"
                aria-label="Send message"
                disabled={input.trim().length === 0}
                onClick={() => void send()}
              >
                <ArrowUp className="size-4" />
              </Button>
            )}
          </div>
        </div>
      ) : null}

      <Button
        ref={fabRef}
        type="button"
        size="icon"
        aria-label="Ask AI about your CRM"
        aria-expanded={open}
        className="size-12 rounded-full shadow-lg"
        onClick={() => (open ? closePanel() : openPanel())}
      >
        {open ? <X className="size-5" /> : <Sparkles className="size-5" />}
      </Button>
    </div>
  );
}
