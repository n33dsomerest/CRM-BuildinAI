import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { headers } from "next/headers";
import { authConfig } from "@/lib/auth.config";
import { db } from "@/lib/db";
import { signInSchema } from "@/lib/validations";
import { checkLoginLimit, recordLoginFailure, resetLoginFailures } from "@/lib/rate-limit";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      authorize: async (credentials) => {
        const parsed = signInSchema.safeParse(credentials);
        if (!parsed.success) return null;
        const email = parsed.data.email.toLowerCase();

        // Throttle per (email, ip): blocked → same generic failure as a wrong
        // password, so the endpoint never reveals account existence.
        const h = await headers();
        const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
        if (!(await checkLoginLimit(email, ip))) return null;

        const user = await db.user.findUnique({ where: { email } });
        if (!user) {
          await recordLoginFailure(email, ip);
          return null;
        }

        const valid = await bcrypt.compare(parsed.data.password, user.passwordHash);
        if (!valid) {
          await recordLoginFailure(email, ip);
          return null;
        }

        await resetLoginFailures(email, ip);
        return { id: user.id, name: user.name, email: user.email, role: user.role };
      },
    }),
  ],
});
