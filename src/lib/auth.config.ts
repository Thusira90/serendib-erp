import type { NextAuthConfig } from "next-auth";

// Edge-safe slice of the NextAuth config: no Prisma, no bcrypt. Middleware
// only needs to verify the JWT cookie, so it builds its own NextAuth
// instance from this. The full config (providers, callbacks) is in auth.ts.
export const authConfig = {
  // Working-day sessions; the jwt callback in auth.ts also re-checks the user against the database.
  session: { strategy: "jwt", maxAge: 12 * 60 * 60 },
  pages: { signIn: "/login" },
  trustHost: true,
  providers: [],
} satisfies NextAuthConfig;
