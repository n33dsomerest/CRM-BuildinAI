import { db } from "@/lib/db";

/**
 * Postgres-backed login throttle. In-memory maps are useless on serverless —
 * every instance restart wipes them, so the counter lives in the database.
 *
 * Policy: max 5 failed attempts per (email, ip) per 15-minute window.
 * Successful login clears the counter. Never log the email or password.
 */

const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000;

function windowStart(): Date {
  return new Date(Date.now() - WINDOW_MS);
}

/** `true` when the attempt is allowed. */
export async function checkLoginLimit(email: string, ip: string): Promise<boolean> {
  const record = await db.loginAttempt.findUnique({
    where: { email_ip: { email, ip } },
  });
  if (!record) return true;
  if (record.windowStart < windowStart()) return true;
  return record.attempts < MAX_ATTEMPTS;
}

export async function recordLoginFailure(email: string, ip: string): Promise<void> {
  const now = new Date();
  const stale = windowStart();
  const existing = await db.loginAttempt.findUnique({
    where: { email_ip: { email, ip } },
  });

  // First failure, or the previous window expired → start a fresh window.
  if (!existing || existing.windowStart < stale) {
    await db.loginAttempt.upsert({
      where: { email_ip: { email, ip } },
      create: { email, ip, attempts: 1, windowStart: now },
      update: { attempts: 1, windowStart: now },
    });
    return;
  }

  await db.loginAttempt.update({
    where: { email_ip: { email, ip } },
    data: { attempts: { increment: 1 } },
  });
}

export async function resetLoginFailures(email: string, ip: string): Promise<void> {
  await db.loginAttempt.deleteMany({ where: { email, ip } });
}
