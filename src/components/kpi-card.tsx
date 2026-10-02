import type { LucideIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "cn";

interface KpiCardProps {
  title: string;
  value: string;
  hint?: string;
  icon: LucideIcon;
  accent?: "default" | "positive" | "warning";
}

export function KpiCard({ title, value, hint, icon: Icon, accent = "default" }: KpiCardProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <Icon
          className={cn(
            "size-4",
            accent === "positive" && "text-emerald-500",
            accent === "warning" && "text-amber-500"
          )}
        />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-semibold tracking-tight">{value}</div>
        {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
      </CardContent>
    </Card>
  );
}
