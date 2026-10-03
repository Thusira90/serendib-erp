import NextAuth, { type DefaultSession } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { authConfig } from "@/lib/auth.config";
import { prisma } from "@/lib/db";
import type { Role } from "@/lib/enums";
import { loadLiveUser, parseArr, pwStamp } from "@/lib/session-guard";

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
    stamp?: string;
  }
}


const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

// Compared against when the email is unknown or inactive, so response time does not reveal which emails exist.
let dummyHash: Promise<string> | null = null;
const getDummyHash = () => (dummyHash ??= bcrypt.hash("serendib-timing-equaliser", 10));

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
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
        if (!user || !user.active) {
          await bcrypt.compare(password, await getDummyHash());
          return null;
        }
        const ok = await bcrypt.compare(password, user.passwordHash);
        if (!ok) return null;
        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role as Role,
          grants: parseArr(user.capabilityGrants),
          denies: parseArr(user.capabilityDenies),
          stamp: pwStamp(user.passwordHash),
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
        token.stamp = user.stamp;
        return token;
      }
      if (typeof token.id !== "string") return null;
      const live = await loadLiveUser(token.id);
      // Deactivated, deleted, or password reset since this session began: end it.
      if (!live || live.stamp !== token.stamp) return null;
      token.role = live.role;
      token.grants = live.grants;
      token.denies = live.denies;
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
