/**
 * Log hygiene: error objects thrown by Prisma can embed query parameters
 * (customer emails, phone numbers…). Never print the object — only its type
 * and, when present, the database error code.
 */
export function logError(context: string, error: unknown): void {
  const name = error instanceof Error ? error.name : typeof error;
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? String((error as { code: unknown }).code)
      : "";
  console.error(`[${context}] ${name}${code ? ` (${code})` : ""}`);
}
