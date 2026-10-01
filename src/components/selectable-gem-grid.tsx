"use client";

import { useState } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCarat, formatCurrency } from "@/lib/utils";
import { StatusBadge } from "@/components/status-badge";
import { PrintLabelChip } from "@/components/print-label-chip";
import { TimedShareButton } from "@/components/timed-share-button";
import { QrPrintButton } from "@/components/qr-print-button";
import { CgiBadge } from "@/components/cgi-badge";
import { X, CheckSquare, Square } from "lucide-react";

/**
 * Grid of cut-stone cards with a per-card selection checkbox. When the
 * user picks any, a floating action bar docks to the bottom-centre with
 * "Share N stones (timed)" and "Print N labels" so they can send a
 * hand-picked shortlist to a client without leaving the page.
 *
 * The Link that wraps each card ignores clicks on the checkbox and on
 * the print chip via stopPropagation, so full-card navigation still
 * works.
 */
export type GemCard = {
  id: string;
  code: string;
  gemType: string;
  variety: string | null;
  weightCt: number;
  status: string;
  origin: string | null;
  currency: string;
  askingPrice: number | null;
  totalCost: number;
  heroBadge: string | null;
  cgiScore: number | null;
  cgiBand: string | null;
};

export function SelectableGemGrid({
  gems, sharerName, sharerEmail,
}: {
  gems: GemCard[];
  sharerName: string;
  sharerEmail: string;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  function toggle(code: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  }
  function clear() { setSelected(new Set()); }
  function selectAll() { setSelected(new Set(gems.map((g) => g.code))); }

  const selectedCodes = Array.from(selected);
  const anySelected = selectedCodes.length > 0;

  return (
    <>
      {gems.length > 0 && (
        <div className="flex items-center justify-between text-xs">
          <div className="text-muted-foreground">
            {anySelected
              ? <>{selectedCodes.length} of {gems.length} selected</>
              : <>Tick the box on a card to add it to a share link.</>}
          </div>
          <div className="flex items-center gap-2">
            {anySelected && (
              <button type="button" onClick={clear} className="text-muted-foreground hover:text-foreground">
                Clear
              </button>
            )}
            <button type="button" onClick={selectAll} className="text-sgs-teal-700 hover:underline">
              {selected.size === gems.length ? "Deselect all" : "Select all"}
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {gems.map((g) => {
          const isSel = selected.has(g.code);
          const margin = g.askingPrice != null ? g.askingPrice - g.totalCost : null;
          return (
            <Link key={g.id} href={`/gemstones/${g.id}`} className="relative">
              <Card className={`hover:shadow-luxe-lg transition-shadow overflow-hidden ${isSel ? "ring-2 ring-sgs-teal-500" : ""}`}>
                <button
                  type="button"
                  aria-label={isSel ? `Deselect ${g.code}` : `Select ${g.code}`}
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggle(g.code); }}
                  className="absolute top-2 left-2 z-10 h-7 w-7 rounded-md bg-white/80 backdrop-blur border flex items-center justify-center hover:bg-white"
                >
                  {isSel
                    ? <CheckSquare className="h-4 w-4 text-sgs-teal-600" />
                    : <Square className="h-4 w-4 text-muted-foreground" />}
                </button>
                <div className="h-28 bg-sgs-gradient relative">
                  <div className="absolute top-3 right-3"><StatusBadge status={g.status} kind="gemstone" /></div>
                  <div className="absolute bottom-3 left-4 text-white">
                    <div className="text-[10px] uppercase tracking-widest opacity-80">{g.gemType}{g.variety ? ` · ${g.variety}` : ""}</div>
                    <div className="font-serif text-2xl leading-tight">{formatCarat(g.weightCt)}</div>
                  </div>
                </div>
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-center justify-between gap-1">
                    <span className="font-mono text-xs text-sgs-teal-700">{g.code}</span>
                    <div className="flex items-center gap-1">
                      {g.origin && <Badge variant="teal">{g.origin}</Badge>}
                      <PrintLabelChip code={g.code} kind="gemstone" />
                    </div>
                  </div>
                  {g.heroBadge ? (
                    <div className="text-[10px] text-muted-foreground">From rough <span className="font-mono text-sgs-teal-700">{g.heroBadge}</span></div>
                  ) : (
                    <div className="text-[10px] text-muted-foreground italic">Direct acquisition</div>
                  )}
                  <div><CgiBadge score={g.cgiScore} band={g.cgiBand} size="sm" /></div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Asking</span>
                    <span className="num font-medium">{g.askingPrice ? formatCurrency(g.askingPrice, g.currency) : "—"}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">True cost</span>
                    <span className="num">{formatCurrency(g.totalCost, g.currency)}</span>
                  </div>
                  {margin != null && (
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Est. margin</span>
                      <span className={`num font-medium ${margin >= 0 ? "text-emerald-700" : "text-red-700"}`}>{formatCurrency(margin, g.currency)}</span>
                    </div>
                  )}
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>

      {anySelected && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 rounded-full border bg-card shadow-luxe-lg px-3 py-2 flex items-center gap-2">
          <span className="text-xs font-medium px-2">
            {selectedCodes.length} stone{selectedCodes.length === 1 ? "" : "s"}
          </span>
          <span className="h-4 w-px bg-border" />
          <TimedShareButton
            scope="GEMSTONES"
            gemstoneCodes={selectedCodes}
            label={`Share ${selectedCodes.length} with expiry`}
            sharerDefaults={{ name: sharerName, email: sharerEmail }}
          />
          <QrPrintButton
            codes={selectedCodes}
            kind="gemstone"
            layout="sheet"
            label={`Print ${selectedCodes.length} labels`}
          />
          <button
            type="button"
            onClick={clear}
            aria-label="Clear selection"
            className="h-8 w-8 rounded-full hover:bg-secondary flex items-center justify-center text-muted-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
    </>
  );
}
