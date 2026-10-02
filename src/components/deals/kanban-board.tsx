"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { DragDropContext, Droppable, Draggable, type DropResult } from "@hello-pangea/dnd";
import { CalendarDays, GripVertical, Plus, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import type { DealCard, FunnelColumn } from "@/lib/queries";
import { moveDealStage } from "@/lib/actions/deals";
import { DealFormDialog } from "@/components/deals/deal-form-dialog";
import { formatCompactCurrency, formatDate, initials } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface UsersOption {
  id: string;
  name: string;
  email: string;
  role: "ADMIN" | "SALES";
}

interface StagesOption {
  id: string;
  name: string;
  order: number;
  probability: number;
  isWon: boolean;
  isLost: boolean;
}

interface ContactsOption {
  id: string;
  name: string;
  accountId: string;
}

interface KanbanBoardProps {
  columns: FunnelColumn[];
  stages: StagesOption[];
  users: UsersOption[];
  accounts: { id: string; name: string }[];
  contacts: ContactsOption[];
  currentUserId: string;
  isAdmin: boolean;
}

export function KanbanBoard({ columns: serverColumns, stages, users, accounts, contacts, currentUserId, isAdmin }: KanbanBoardProps) {
  const router = useRouter();
  // Local copy so a drag renders instantly. Re-synced from server data using
  // the "adjust state when a prop changes during render" pattern (no effect).
  const [columns, setColumns] = React.useState(serverColumns);
  const [syncedFrom, setSyncedFrom] = React.useState(serverColumns);
  if (serverColumns !== syncedFrom) {
    setSyncedFrom(serverColumns);
    setColumns(serverColumns);
  }
  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<DealCard | null>(null);
  const [defaultStageId, setDefaultStageId] = React.useState<string | undefined>(undefined);

  const onDragEnd = async (result: DropResult) => {
    const { destination, draggableId, source } = result;
    if (!destination || destination.droppableId === source.droppableId) return;

    const targetStage = columns.find((column) => column.id === destination.droppableId);
    if (!targetStage) return;

    // Optimistic move
    setColumns((previous) =>
      previous.map((column) => {
        if (column.id === source.droppableId) {
          return { ...column, deals: column.deals.filter((deal) => deal.id !== draggableId) };
        }
        if (column.id === destination.droppableId) {
          const deal = previous
            .find((c) => c.id === source.droppableId)
            ?.deals.find((d) => d.id === draggableId);
          if (!deal) return column;
          const deals = [...column.deals];
          deals.splice(destination.index, 0, deal);
          const totalValue = deals.reduce((sum, d) => sum + d.value, 0);
          return { ...column, deals, totalValue, weightedValue: Math.round((totalValue * column.probability) / 100) };
        }
        return column;
      })
    );

    const moveResult = await moveDealStage(draggableId, destination.droppableId);
    if (moveResult.ok) {
      toast.success(`Moved to ${moveResult.data.stageName}`);
    } else {
      toast.error(moveResult.error);
    }
    router.refresh();
  };

  const openNew = (stageId?: string) => {
    setEditing(null);
    setDefaultStageId(stageId ?? stages[0]?.id);
    setFormOpen(true);
  };

  return (
    <>
      <div className="mb-4 flex justify-end">
        <Button onClick={() => openNew()}>
          <Plus className="size-4" /> New deal
        </Button>
      </div>

      <DragDropContext onDragEnd={(result) => void onDragEnd(result)}>
        <div className="flex gap-4 overflow-x-auto pb-4">
          {columns.map((column) => (
            <section
              key={column.id}
              className={cn(
                "flex w-[290px] shrink-0 flex-col rounded-xl border bg-muted/40",
                column.isWon && "border-emerald-500/40",
                column.isLost && "border-red-500/40"
              )}
            >
              {/* Column header */}
              <header className="space-y-1 border-b p-3">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-sm font-semibold">{column.name}</h2>
                  <Badge variant="secondary" className="tabular-nums">
                    {column.deals.length}
                  </Badge>
                </div>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span className="tabular-nums">{formatCompactCurrency(column.totalValue)}</span>
                  <span className="flex items-center gap-1 tabular-nums">
                    <TrendingUp className="size-3" />
                    {formatCompactCurrency(column.weightedValue)} · {column.probability}%
                  </span>
                </div>
              </header>

              {/* Cards */}
              <Droppable droppableId={column.id}>
                {(dropProvided, dropSnapshot) => (
                  <div
                    ref={dropProvided.innerRef}
                    {...dropProvided.droppableProps}
                    className={cn(
                      "min-h-[120px] flex-1 p-2 transition-colors",
                      dropSnapshot.isDraggingOver && "bg-sidebar-accent/50"
                    )}
                  >
                    <div className="space-y-2">
                      {column.deals.map((deal, index) => (
                        <Draggable key={deal.id} draggableId={deal.id} index={index}>
                          {(dragProvided, dragSnapshot) => (
                            <article
                              ref={dragProvided.innerRef}
                              {...dragProvided.draggableProps}
                              {...dragProvided.dragHandleProps}
                              onClick={() => {
                                setEditing(deal);
                                setDefaultStageId(column.id);
                                setFormOpen(true);
                              }}
                              className={cn(
                                "cursor-grab rounded-lg border bg-card p-3 shadow-sm transition-shadow hover:shadow-md active:cursor-grabbing",
                                dragSnapshot.isDragging && "shadow-lg"
                              )}
                            >
                              <div className="flex items-start gap-1.5">
                                <p className="min-w-0 flex-1 text-sm font-medium leading-snug">{deal.title}</p>
                                <GripVertical className="mt-0.5 size-3.5 shrink-0 text-muted-foreground/50" />
                              </div>
                              <p className="mt-1 truncate text-xs text-muted-foreground">
                                {deal.accountName} · {deal.contactName}
                              </p>
                              <div className="mt-2 flex items-center justify-between gap-2">
                                <span className="text-sm font-semibold tabular-nums">{formatCompactCurrency(deal.value)}</span>
                                <span className="flex items-center gap-2 text-[11px] text-muted-foreground">
                                  {deal.expectedCloseDate ? (
                                    <span className="flex items-center gap-1">
                                      <CalendarDays className="size-3" />
                                      {formatDate(deal.expectedCloseDate)}
                                    </span>
                                  ) : null}
                                  <Badge variant="outline" className="px-1.5 text-[10px]">
                                    {initials(deal.ownerName)}
                                  </Badge>
                                </span>
                              </div>
                            </article>
                          )}
                        </Draggable>
                      ))}
                    </div>
                    {dropProvided.placeholder}
                    {column.deals.length === 0 && !dropSnapshot.isDraggingOver ? (
                      <p className="py-6 text-center text-xs text-muted-foreground">Drop deals here</p>
                    ) : null}
                  </div>
                )}
              </Droppable>

              <footer className="border-t p-2">
                <Button variant="ghost" size="sm" className="w-full text-muted-foreground" onClick={() => openNew(column.id)}>
                  <Plus className="size-3.5" /> Add deal to {column.name}
                </Button>
              </footer>
            </section>
          ))}
        </div>
      </DragDropContext>

      <DealFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        initial={editing}
        defaultStageId={defaultStageId}
        stages={stages}
        users={users}
        accounts={accounts}
        contacts={contacts}
        currentUserId={currentUserId}
        isAdmin={isAdmin}
      />
    </>
  );
}
