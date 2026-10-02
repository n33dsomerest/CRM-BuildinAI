import type { NextAuthConfig } from "next-auth";

/**
 * Edge-safe Auth.js configuration (no Prisma / bcrypt imports here).
 * The credentials provider is attached in `auth.ts` (Node runtime only).
 */
export const authConfig = {
  pages: {
    signIn: "/login",
  },
  // Required in production (NODE_ENV=production) — without it every login
  // POST fails with UntrustedHost outside of `next dev`.
  trustHost: true,
  session: {
    strategy: "jwt",
  },
  providers: [],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as "ADMIN" | "SALES";
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
