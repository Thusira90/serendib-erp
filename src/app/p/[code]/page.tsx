import { cookies, headers } from "next/headers";
import { notFound } from "next/navigation";
import { SgsLogo } from "@/components/brand/logo";
import { PartnerPortalView } from "@/components/partner-portal/portal-view";
import { PasswordGate } from "@/components/partner-portal/password-gate";
import { checkUnlockWithCookie, requestContext, resolvePartnerAccess, tokenFingerprint, unlockCookieName, writeAccessLog } from "@/lib/partner-access";
import { PartnerViewError, buildPartnerPortalDto } from "@/lib/partner-view";
import { verifyPartnerPassword } from "./actions";

export const dynamic = "force-dynamic";

export function generateMetadata() {
  return { title: "Deal statement", robots: { index: false, follow: false } };
}

function Notice({ title, body }: { title: string; body: string }) {
  return (
    <main className="min-h-screen grid place-items-center px-4 py-10">
      <div className="max-w-sm text-center space-y-4">
        <div className="flex justify-center"><SgsLogo size={36} /></div>
        <h1 className="font-serif text-2xl">{title}</h1>
        <p className="text-sm text-muted-foreground">{body}</p>
      </div>
    </main>
  );
}

export default async function PartnerPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const ctx = requestContext(await headers());

  // Malformed codes return before any database work; unknown, expired, revoked and inactive links all end in the same page.
  const resolved = await resolvePartnerAccess(code, ctx);
  if (!resolved.ok) {
    if (resolved.reason === "BOT") return <Notice title="Private deal statement" body="This page is shared privately and is not shown in previews." />;
    if (resolved.reason === "RATE_LIMITED" || resolved.reason === "LOCKED") {
      return <Notice title="Please try again later" body="Too many requests were made to this link. Wait a little while and reload." />;
    }
    notFound();
  }
  const access = resolved.access;
  const fp = tokenFingerprint(code);

  if (access.needsPassword) {
    const cookie = (await cookies()).get(unlockCookieName(access.accessId))?.value;
    if (!(await checkUnlockWithCookie(access, cookie))) {
      await writeAccessLog({ accessId: access.accessId, dealId: access.dealId, outcome: "PASSWORD_REQUIRED", path: "/p/[code]", tokenFp: fp, ctx, viewer: access });
      return (
        <main className="min-h-screen grid place-items-center px-4 py-10">
          <PasswordGate action={verifyPartnerPassword.bind(null, code)} />
        </main>
      );
    }
  }

  let dto;
  try {
    dto = await buildPartnerPortalDto({ dealId: access.dealId, viewer: access });
  } catch (e) {
    if (!(e instanceof PartnerViewError)) console.error("partner page failed:", e instanceof Error ? e.name : "unknown");
    notFound();
  }

  await writeAccessLog({ accessId: access.accessId, dealId: access.dealId, outcome: "OK", path: "/p/[code]", tokenFp: fp, ctx, viewer: access });
  return <PartnerPortalView dto={dto} mode="public" token={code} />;
}
