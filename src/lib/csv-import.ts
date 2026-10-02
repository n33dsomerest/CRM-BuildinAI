import Papa from "papaparse";
import { contactImportRowSchema } from "@/lib/validations";

/** Shared CSV-import limits — exported for tests so they exercise the shipped values. */
export const MAX_CSV_BYTES = 2 * 1024 * 1024; // 2 MB
export const MAX_ROWS = 2_000;
/** Abort the whole import when more than 10% of rows fail validation. */
export const ERROR_ABORT_RATIO = 0.1;

export interface ImportRow {
  name: string;
  email?: string;
  phone?: string;
  status: "LEAD" | "PROSPECT" | "CUSTOMER";
  company: string;
}

export interface ParsedImport {
  validRows: ImportRow[];
  errors: string[];
  /** More than ERROR_ABORT_RATIO of rows failed validation — caller must not write. */
  aborted: boolean;
  /** Hard rejection (size cap / empty file) — caller should return `fail(rejected)`. */
  rejected?: string;
}

/**
 * Pure CSV parsing + validation (no DB, no session). Used by the
 * `importContactsCsv` server action and directly by integration tests, so the
 * caps and validation rules shipped in the app are the exact ones tests exercise.
 */
export function parseImportCsv(csv: string): ParsedImport {
  if (csv.length > MAX_CSV_BYTES) {
    return { validRows: [], errors: [], aborted: true, rejected: "CSV too large — max 2 MB per import" };
  }

  const parsed = Papa.parse<Record<string, string>>(csv, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim().toLowerCase(),
  });

  if (!parsed.data.length) {
    return { validRows: [], errors: [], aborted: true, rejected: "No rows found in the CSV file" };
  }
  if (parsed.data.length > MAX_ROWS) {
    return { validRows: [], errors: [], aborted: true, rejected: "CSV too large — max 2,000 rows per import" };
  }

  const errors: string[] = [];
  const validRows: ImportRow[] = [];
  for (const [index, row] of parsed.data.entries()) {
    const check = contactImportRowSchema.safeParse({
      name: row.name,
      email: row.email,
      phone: row.phone,
      company: row.company,
      status: row.status?.trim().toUpperCase(),
    });
    if (!check.success) {
      errors.push(`Row ${index + 2}: ${check.error.issues[0]?.message ?? "invalid row"}`);
      continue;
    }
    if (!check.data.company) {
      errors.push(`Row ${index + 2}: missing company name`);
      continue;
    }
    validRows.push({
      name: check.data.name,
      email: check.data.email,
      phone: check.data.phone,
      status: check.data.status,
      company: check.data.company,
    });
  }

  return { validRows, errors, aborted: errors.length > parsed.data.length * ERROR_ABORT_RATIO };
}
