"use client";

import { useEffect } from "react";
import { RefreshCw, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Server-side log hygiene: name only — the error object can carry query data.
    console.error(`[app-error] ${error.name}${error.digest ? ` (${error.digest})` : ""}`);
  }, [error]);

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 text-center">
      <div className="flex size-14 items-center justify-center rounded-2xl bg-destructive/10">
        <TriangleAlert className="size-7 text-destructive" />
      </div>
      <div>
        <h2 className="text-lg font-semibold">Something went wrong</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          The page hit an unexpected error. Retry, or head back to the dashboard if it keeps failing.
        </p>
      </div>
      <Button onClick={reset}>
        <RefreshCw className="size-4" /> Try again
      </Button>
    </div>
  );
}
