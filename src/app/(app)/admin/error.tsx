"use client";

import { useEffect } from "react";
import { RefreshCw, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(`[admin-error] ${error.name}${error.digest ? ` (${error.digest})` : ""}`);
  }, [error]);

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 text-center">
      <div className="flex size-14 items-center justify-center rounded-2xl bg-destructive/10">
        <TriangleAlert className="size-7 text-destructive" />
      </div>
      <div>
        <h2 className="text-lg font-semibold">Admin panel error</h2>
        <p className="mt-1 text-sm text-muted-foreground">The admin page hit an unexpected error.</p>
      </div>
      <Button onClick={reset}>
        <RefreshCw className="size-4" /> Try again
      </Button>
    </div>
  );
}
