import Link from "next/link";
import { Diamond, Scissors, Gem, ChevronRight } from "lucide-react";
import { formatDate } from "@/lib/utils";
import type { Provenance } from "@/lib/provenance";

/**
 * One-line provenance strip showing the chain from source rough → cutting
 * job → this gemstone. Each hop is a link so you can walk backwards or
 * forwards at will. Renders nothing when the gem has no rough parent
 * (direct-acquisition) so the header stays clean.
 *
 * `variant`:
 *   - `chip` — default, compact chips suitable for header rows
 *   - `line` — one plain line for the sales invoice / verify page
 */
export function ProvenanceChain({
  gemCode, gemId, provenance, variant = "chip",
}: {
  gemCode: string;
  gemId?: string;
  provenance: Provenance;
  variant?: "chip" | "line";
}) {
  if (!provenance.roughCode) return null;

  if (variant === "line") {
    return (
      <div className="text-xs text-muted-foreground">
        Cut from our own rough{" "}
        <Link href={`/rough/${provenance.roughId}`} className="font-mono text-sgs-teal-700 hover:underline">
          {provenance.roughCode}
        </Link>
        {provenance.roughPurchasedAt && (
          <> · acquired {formatDate(provenance.roughPurchasedAt)}</>
        )}
        {provenance.cuttingJobCode && (
          <> · cut on <Link href={`/cutting/${provenance.cuttingJobId}`} className="font-mono text-sgs-teal-700 hover:underline">{provenance.cuttingJobCode}</Link></>
        )}
      </div>
    );
  }

  return (
    <div className="flex items-center flex-wrap gap-1.5 text-xs">
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground mr-1">Provenance</span>

      <Link href={`/rough/${provenance.roughId}`}
        className="inline-flex items-center gap-1 h-6 px-2 rounded-full border bg-sgs-teal-50 border-sgs-teal-500/30 text-sgs-teal-700 hover:bg-sgs-teal-100">
        <Diamond className="h-3 w-3" /> <span className="font-mono">{provenance.roughCode}</span>
      </Link>

      {provenance.cuttingJobCode && (
        <>
          <ChevronRight className="h-3 w-3 text-muted-foreground" />
          <Link href={`/cutting/${provenance.cuttingJobId}`}
            className="inline-flex items-center gap-1 h-6 px-2 rounded-full border bg-sgs-purple-500/10 border-sgs-purple-500/30 text-sgs-purple-500 hover:bg-sgs-purple-500/20">
            <Scissors className="h-3 w-3" /> <span className="font-mono">{provenance.cuttingJobCode}</span>
          </Link>
        </>
      )}

      <ChevronRight className="h-3 w-3 text-muted-foreground" />
      <span className="inline-flex items-center gap-1 h-6 px-2 rounded-full border bg-emerald-50 border-emerald-500/30 text-emerald-700">
        <Gem className="h-3 w-3" /> <span className="font-mono">{gemCode}</span>
      </span>
    </div>
  );
}
