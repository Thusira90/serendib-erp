import Link from "next/link";
import { formatDate } from "@/lib/utils";
import { SgsLogo } from "@/components/brand/logo";

/**
 * Landing shown when a share link is past its expiry OR was revoked.
 * In broker mode we still avoid the SGS logo and message so the buyer
 * doesn't learn who the underlying vendor is even after expiry.
 */
export function ExpiredView({
  expiresAt, revokedAt, brokerMode = false, brandLabel = null,
}: {
  expiresAt: Date;
  revokedAt: Date | null;
  brokerMode?: boolean;
  brandLabel?: string | null;
}) {
  return (
    <div className={`min-h-screen ${brokerMode ? "bg-slate-50" : "bg-secondary/20"} flex items-center justify-center p-6`}>
      <div className="max-w-md text-center bg-white border rounded-xl p-10">
        {brokerMode
          ? <div className="font-serif text-lg mb-4">{brandLabel ?? "Private inventory"}</div>
          : <div className="flex justify-center mb-4"><SgsLogo /></div>}
        <div className="text-[11px] uppercase tracking-[0.3em] text-red-700">
          {revokedAt ? "Link revoked" : "Link expired"}
        </div>
        <h1 className="font-serif text-2xl mt-2">This share link is no longer active.</h1>
        <p className="text-sm text-muted-foreground mt-3">
          {revokedAt
            ? "The sender revoked access to this page."
            : `The link expired ${formatDate(expiresAt)}. Please ask the sender for a fresh one.`}
        </p>
        {!brokerMode && (
          <div className="mt-6">
            <Link href="/catalogue" className="text-sm text-sgs-teal-700 hover:underline">
              Browse our public catalogue →
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
