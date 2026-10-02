import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: "ADMIN" | "SALES";
    } & DefaultSession["user"];
  }

  interface User {
    role?: "ADMIN" | "SALES";
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    role?: "ADMIN" | "SALES";
  }
}
