import { handlers } from "@/lib/auth";

// Credentials login uses bcrypt + Prisma, so the full (Node runtime) auth
// instance is required here — not the edge-safe auth.config.
export const { GET, POST } = handlers;
