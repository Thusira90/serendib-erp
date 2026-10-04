import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "@/lib/auth.config";

// Fail-closed allow-list: every path not listed here requires a session.
// Each entry matches the path itself and everything beneath it.
export const PUBLIC_PATHS = [
  "/login",
  "/api/auth", // NextAuth handlers
  "/verify", // public certificate verification
  "/catalogue",
  "/share", // legacy share links
  "/s", // seller-neutral share links (incl. /s/icon.svg)
  "/p", // partner deal statements: bearer-token links, the route never calls auth() (a segment match, so /partners and /pickles stay private)
  "/uploads", // local-disk uploads (dev fallback; R2 is served off-site)
  "/_next",
  "/icon.svg",
  "/favicon.ico",
  "/robots.txt",
  "/serendib-logo.jpg",
] as const;

export function isPublic(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

const { auth } = NextAuth(authConfig);

export default auth((req) => {
  const { pathname, search } = req.nextUrl;
  const isAuthed = !!req.auth?.user;

  if (!isAuthed && !isPublic(pathname)) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    url.searchParams.set("callbackUrl", pathname + search);
    return NextResponse.redirect(url);
  }

  // Signed-in users are not bounced away from /login: the cookie can still be valid here (the edge only
  // verifies the signature) while auth() has rejected it as deactivated or reset, which would loop.

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
