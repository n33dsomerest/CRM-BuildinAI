/**
 * Client-shared input limits. Own file (instead of living next to the server
 * CSV parser) so client components can import the constants without dragging
 * papaparse into the browser bundle; csv-import.ts re-exports them so tests
 * and the parser exercise the same shipped values.
 */

/** Maximum CSV upload size in bytes (client pre-check + server hard cap). */
export const MAX_CSV_BYTES = 2 * 1024 * 1024; // 2 MB
/** Maximum data rows per CSV import (client pre-check + server hard cap). */
export const MAX_ROWS = 2_000;
/** Abort the whole import when more than this fraction of rows fail validation. */
export const ERROR_ABORT_RATIO = 0.1;
