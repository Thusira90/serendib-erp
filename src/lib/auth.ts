import NextAuth, { type DefaultSession } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import type { Role } from "@/lib/enums";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: Role;
      // Per-user capability overlays. Empty arrays when unset. Combined
      // with role's matrix inside rbac.can() to produce the effective set.
      grants: string[];
      denies: string[];
    } & DefaultSession["user"];
  }
  interface User {
    role: Role;
    grants?: string[];
    denies?: string[];
  }
}


const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

function parseArr(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === "string") : [];
  } catch { return []; }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  trustHost: true,
  providers: [
    Credentials({
      credentials: {
        email: {},
        password: {},
      },
      async authorize(raw) {
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) return null;
        const { email, password } = parsed.data;
        const user = await prisma.user.findUnique({ where: { email } });
        if (!user || !user.active) return null;
        const ok = await bcrypt.compare(password, user.passwordHash);
        if (!ok) return null;
        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role as Role,
          grants: parseArr(user.capabilityGrants),
          denies: parseArr(user.capabilityDenies),
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
        token.grants = user.grants ?? [];
        token.denies = user.denies ?? [];
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as Role;
        session.user.grants = (token.grants as string[]) ?? [];
        session.user.denies = (token.denies as string[]) ?? [];
      }
      return session;
    },
  },
});
