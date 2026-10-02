"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { FileUp, Loader2, Upload } from "lucide-react";
import { toast } from "sonner";
import { importContactsCsv } from "@/lib/actions/contacts";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export function ImportContactsDialog() {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [csv, setCsv] = React.useState("");
  const [fileName, setFileName] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);
  const [summary, setSummary] = React.useState<{ created: number; skipped: number; errors: string[] } | null>(null);

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    setFileName(file.name);
    setCsv(await file.text());
  };

  const handleImport = async () => {
    setPending(true);
    setSummary(null);
    const result = await importContactsCsv(csv);
    setPending(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    setSummary(result.data);
    if (result.data.created > 0) {
      toast.success(`Imported ${result.data.created} contacts`);
      router.refresh();
    } else {
      toast.info("Nothing imported — check the report below");
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setCsv("");
          setFileName(null);
          setSummary(null);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline">
          <Upload className="size-4" /> Import
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Import contacts from CSV</DialogTitle>
          <DialogDescription>
            Columns: <code className="text-xs">name,email,phone,company,status</code>. Existing accounts are matched
            by company name (created when missing); duplicate contacts are skipped.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          <label className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border border-dashed p-6 text-sm text-muted-foreground hover:bg-muted/50">
            <FileUp className="size-6" />
            <span>{fileName ?? "Click to choose a .csv file (or paste below)"}</span>
            <input
              type="file"
              accept=".csv,text/csv"
              className="sr-only"
              onChange={(event) => void handleFile(event.target.files?.[0])}
            />
          </label>
          <textarea
            value={csv}
            onChange={(event) => {
              setCsv(event.target.value);
              setFileName(null);
            }}
            rows={5}
            placeholder={"name,email,phone,company,status\nJane Doe,jane@acme.com,+1 555-0100,Acme Corp,PROSPECT"}
            className="w-full rounded-md border bg-transparent px-3 py-2 font-mono text-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
          />
          {summary ? (
            <div className="rounded-md border bg-muted/50 p-3 text-sm">
              <p>
                Created <span className="font-semibold text-emerald-600 dark:text-emerald-400">{summary.created}</span>{" "}
                · Skipped <span className="font-semibold">{summary.skipped}</span> · Errors{" "}
                <span className="font-semibold text-red-500">{summary.errors.length}</span>
              </p>
              {summary.errors.length > 0 ? (
                <ul className="mt-2 max-h-28 space-y-1 overflow-y-auto text-xs text-muted-foreground">
                  {summary.errors.slice(0, 10).map((error) => (
                    <li key={error}>{error}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Close
          </Button>
          <Button onClick={() => void handleImport()} disabled={pending || csv.trim().length === 0}>
            {pending ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
            Import
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
