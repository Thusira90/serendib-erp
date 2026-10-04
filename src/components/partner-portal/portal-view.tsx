import { FileText, Info, Lock } from "lucide-react";
import type { PartnerNotice, PartnerPortalDto, StoneDto } from "@/lib/partner-dto";
import { SgsLogo } from "@/components/brand/logo";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Watermark } from "@/components/public/watermark";
import { CalcSteps } from "./calc-steps";
import { PortalPrintButton } from "./print-button";
import { fmtDateTime, Section } from "./portal-ui";
import { StatementCards, TermsCard } from "./statement-cards";
import { StoneCard, type StoneCardContext } from "./stone-card";
import { PublicTimeline } from "./timeline";

export interface PartnerPortalViewProps {
  dto: PartnerPortalDto;
  mode: "public" | "preview";
  /** Bearer token of the link being viewed; only used to build document hrefs in public mode, never displayed. */
  token?: string;
  /** Preview mode only: base path of the admin twin of the document route, for example /partners/deals/<id>/preview/doc. */
  docBase?: string;
}

const NOTICE_TEXT: Partial<Record<PartnerNotice, string>> = {
  INCOMPLETE_DATA: "Some figures are still being finalised and may change.",
  APPROX_RATES: "Some amounts use approximate exchange rates and may change once final rates are applied.",
};

function arrangeStones(stones: StoneDto[]): { roots: StoneDto[]; ctx: Omit<StoneCardContext, "timeline"> } {
  const byKey = new Map(stones.map((s) => [s.key, s] as const));
  const parentOf = (s: StoneDto): string | null => {
    if (!s.parentKey || s.parentKey === s.key || !byKey.has(s.parentKey)) return null;
    const seen = new Set<string>([s.key]);
    let cur: string | null = s.parentKey;
    while (cur) {
      if (seen.has(cur)) return null;
      seen.add(cur);
      const next: string | null = byKey.get(cur)?.parentKey ?? null;
      cur = next && byKey.has(next) ? next : null;
    }
    return s.parentKey;
  };
  const childrenOf = new Map<string, StoneDto[]>();
  const roots: StoneDto[] = [];
  for (const s of stones) {
    const p = parentOf(s);
    if (p === null) {
      roots.push(s);
    } else {
      const list = childrenOf.get(p);
      if (list) list.push(s);
      else childrenOf.set(p, [s]);
    }
  }
  return { roots, ctx: { byKey, childrenOf } };
}

export function PartnerPortalView({ dto, mode, token, docBase }: PartnerPortalViewProps) {
  const preview = mode === "preview";
  const Shell = preview ? "div" : "main";
  const { roots, ctx } = arrangeStones(dto.stones);
  const stoneCtx: StoneCardContext = { ...ctx, timeline: dto.timeline };
  const closed = dto.notices.includes("DEAL_CLOSED");
  const notices = dto.notices.map((n) => NOTICE_TEXT[n]).filter((t): t is string => t !== undefined);
  const docs = dto.documents ?? [];
  const stoneName = (key: string | null): string | null => (key ? ctx.byKey.get(key)?.displayName ?? null : null);

  const docHref = (key: string): string | null => {
    if (mode === "public") return token ? `/p/${encodeURIComponent(token)}/doc/${encodeURIComponent(key)}` : null;
    return docBase ? `${docBase.replace(/\/+$/, "")}/${encodeURIComponent(key)}` : null;
  };

  return (
    <div className={preview ? "pp-root relative overflow-hidden bg-sgs-bone" : "pp-root relative min-h-screen bg-sgs-bone print:bg-white"}>
      <Watermark forName={dto.watermarkName} contained={preview} />

      <Shell className="relative z-10 mx-auto w-full max-w-5xl space-y-6 px-4 py-6 sm:space-y-8 sm:px-6 sm:py-10">
        <header className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <SgsLogo size={36} />
            <div className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground">Deal statement</div>
          </div>
          <div>
            <h1 className="break-words font-serif text-3xl sm:text-4xl">{dto.deal.title || dto.deal.reference}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm text-muted-foreground">
              <span className="font-mono">{dto.deal.reference}</span>
              <Badge variant="outline">{dto.deal.statusLabel}</Badge>
              <span>{dto.partner.name} ({dto.partner.kindLabel})</span>
            </div>
          </div>
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span className="num">As of {fmtDateTime(dto.generatedAt)}</span>
            <span className="inline-flex items-center gap-1">
              <Lock className="h-3 w-3" aria-hidden /> Private to {dto.partner.name}. Access is logged.
            </span>
          </p>
        </header>

        {closed && (
          <div role="status" className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
            <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <span>This deal is closed. The statement is kept here for your records.</span>
          </div>
        )}

        <StatementCards statement={dto.statement} />
        <TermsCard deal={dto.deal} />
        <CalcSteps calculation={dto.statement.calculation} />

        <Section
          id="stones"
          title="Stones"
          intro={dto.statement.estimate.totalStones > 0 ? `${dto.statement.estimate.soldStones} of ${dto.statement.estimate.totalStones} stones sold.` : undefined}
        >
          {roots.length === 0 ? (
            <Card className="p-6 text-center text-sm text-muted-foreground">No stones have been added to this deal yet.</Card>
          ) : (
            <div className="space-y-4">
              {roots.map((s) => <StoneCard key={s.key} stone={s} ctx={stoneCtx} />)}
            </div>
          )}
        </Section>

        <PublicTimeline items={dto.timeline} />

        {docs.length > 0 && (
          <Section id="documents" title="Documents" intro="Supporting documents for your stones. Links open in a new tab.">
            <Card className="p-2 sm:p-4">
              <ul className="divide-y">
                {docs.map((d, i) => {
                  const href = docHref(d.key);
                  const stone = stoneName(d.stoneKey);
                  const inner = (
                    <>
                      <FileText className="h-4 w-4 shrink-0 text-sgs-teal-600" aria-hidden />
                      <span className="min-w-0 flex-1">
                        <span className="block break-words text-sm font-medium">{d.label}</span>
                        {stone && <span className="block text-xs text-muted-foreground">{stone}</span>}
                      </span>
                      <Badge variant={d.kind === "RECEIPT" ? "muted" : "purple"}>{d.kind === "RECEIPT" ? "Receipt" : "Certificate"}</Badge>
                    </>
                  );
                  return (
                    <li key={i}>
                      {href ? (
                        <a
                          href={href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex min-h-[44px] items-center gap-3 rounded-md px-2 py-2 hover:bg-secondary/60"
                        >
                          {inner}
                        </a>
                      ) : (
                        <div className="flex min-h-[44px] items-center gap-3 px-2 py-2">{inner}</div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </Card>
          </Section>
        )}

        <footer className="space-y-4 border-t pt-6">
          <div className="no-print">
            <PortalPrintButton />
          </div>
          {notices.length > 0 && (
            <ul className="space-y-1 text-xs text-amber-900">
              {notices.map((n) => (
                <li key={n} className="flex items-start gap-1.5">
                  <Info className="mt-0.5 h-3 w-3 shrink-0" aria-hidden /> {n}
                </li>
              ))}
            </ul>
          )}
          <p className="text-xs text-muted-foreground">
            Confidential - for {dto.partner.name}. Please do not copy, forward or share this statement.
          </p>
          <p className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground">Serendib Gemstones</p>
        </footer>
      </Shell>

      <style>{`
        .pp-root img { -webkit-user-drag: none; user-select: none; pointer-events: none; }
        .pp-root { -webkit-touch-callout: none; }
        @media print {
          .pp-root section { break-inside: auto; page-break-inside: auto; }
          .pp-root h2 { break-after: avoid; page-break-after: avoid; }
        }
      `}</style>
    </div>
  );
}
