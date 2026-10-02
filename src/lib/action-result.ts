/** Uniform result shape for every server action consumed by client components. */
export type ActionResult<T = null> = { ok: true; data: T } | { ok: false; error: string };

export const fail = (error: string): ActionResult<never> => ({ ok: false, error });

export const ok = <T>(data: T): ActionResult<T> => ({ ok: true, data });
