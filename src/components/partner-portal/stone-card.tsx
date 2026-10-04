import type { ReactNode } from "react";
import { Award, Gem } from "lucide-react";
import type { StoneDto, StoneSpecsDto, StoneStage, TimelineItemDto } from "@/lib/partner-dto";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { CgiBadge } from "@/components/cgi-badge";
import { cn } from "@/lib/utils";
import { PublicMediaStrip } from "./media-strip";
import { PublicProvenance, type ProvenanceContext } from "./provenance";
import { Block, KV, Row, fmtCt, fmtDate, fmtMoney } from "./portal-ui";

const STAGES: Record<StoneStage, { label: string; variant: BadgeProps["variant"] }> = {
  PURCHASED: { label: "Purchased", variant: "muted" },
  IN_CUTTING: { label: "In cutting", variant: "purple" },
  CUT: { label: "Cut", variant: "teal" },
  IN_STOCK: { label: "In stock", variant: "teal" },
  RESERVED: { label: "Reserved", variant: "warning" },
  SOLD: { label: "Sold", variant: "success" },
  SOLD_AWAITING_PAYMENT: { label: "Sold - awaiting payment", variant: "warning" },
  SOLD_PART_PAID: { label: "Sold - part paid", variant: "warning" },
  SOLD_PAID: { label: "Sold - paid", variant: "success" },
  PARTLY_SOLD: { label: "Partly sold", variant: "success" },
  UNAVAILABLE: { label: "Unavailable", variant: "muted" },
};

const FALLBACK_STAGE: { label: string; variant: BadgeProps["variant"] } = { label: "In progress", variant: "muted" };

function specRows(s: StoneSpecsDto): { label: string; value: string }[] {
  const rows: { label: string; value: string | null }[] = [
    { label: "Type", value: s.gemType },
    { label: "Variety", value: s.variety },
    { label: "Weight", value: s.weightCt !== null ? fmtCt(s.weightCt) : null },
    { label: "Dimensions", value: s.dimensionsMm },
    { label: "Shape", value: s.shape },
    { label: "Cut", value: s.cut },
    { label: "Colour", value: s.colorDescription },
    { label: "Clarity", value: s.clarity },
    { label: "Treatment", value: s.treatment },
    { label: "Origin", value: s.origin },
  ];
  return rows.filter((r): r is { label: string; value: string } => r.value !== null && r.value !== "");
}

export interface StoneCardContext {
  byKey: ReadonlyMap<string, StoneDto>;
  childrenOf: ReadonlyMap<string, readonly StoneDto[]>;
  timeline: readonly TimelineItemDto[] | null;
}

const MAX_DEPTH = 3;

// Every section renders only when its DTO field is non-null (and has something in it); a hidden field leaves no box behind.
export function StoneCard({ stone, ctx, depth = 0 }: { stone: StoneDto; ctx: StoneCardContext; depth?: number }) {
  const stage = STAGES[stone.stage] ?? FALLBACK_STAGE;
  const kids = ctx.childrenOf.get(stone.key) ?? [];
  const provCtx: ProvenanceContext = { byKey: ctx.byKey, kids, timeline: ctx.timeline };
  const specs = stone.specs ? specRows(stone.specs) : [];
  const cert = stone.certificate;
  const payments = stone.payments ?? [];
  const cost = stone.cost;
  const costRows = cost
    ? [
        cost.purchase ? <Row key="p" label="Purchase" value={fmtMoney(cost.purchase)} /> : null,
        ...(cost.lines ?? []).map((l, i) => <Row key={`l${i}`} label={l.label} value={fmtMoney(l.amount)} />),
        cost.total ? <Row key="t" label="Total cost" value={fmtMoney(cost.total)} strong /> : null,
      ].filter((r): r is NonNullable<typeof r> => r !== null)
    : [];

  const blocks: ReactNode[] = [];

  if (specs.length > 0) {
    blocks.push(
      <Block key="specs" title="Specifications">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
          {specs.map((r) => <KV key={r.label} label={r.label} value={r.value} />)}
        </dl>
      </Block>,
    );
  }

  if (cert) {
    blocks.push(
      <Block key="cert" title="Certificate">
        <div className="flex items-start gap-2 text-sm">
          <Award className="mt-0.5 h-4 w-4 shrink-0 text-sgs-purple-500" aria-hidden />
          <div className="min-w-0">
            <div className="font-medium">{cert.laboratory}</div>
            {cert.number && <div className="break-words text-muted-foreground">Report {cert.number}</div>}
            {cert.issuedOn && <div className="num text-xs text-muted-foreground">Issued {fmtDate(cert.issuedOn)}</div>}
          </div>
        </div>
      </Block>,
    );
  }

  if (stone.supplier) {
    blocks.push(
      <Block key="supplier" title="Supplier">
        <p className="break-words text-sm">{stone.supplier.name}</p>
      </Block>,
    );
  }

  if (stone.askingPrice) {
    blocks.push(
      <Block key="asking" title="Asking price">
        <p className="num font-serif text-xl">{fmtMoney(stone.askingPrice)}</p>
      </Block>,
    );
  }

  if (stone.sale) {
    const sale = stone.sale;
    const paid = sale.paidPct === null ? null : Math.min(100, Math.max(0, sale.paidPct));
    blocks.push(
      <Block key="sale" title="Sale">
        <dl>
          <Row label="Sold on" value={fmtDate(sale.soldOn)} />
          {sale.price && <Row label="Sale price" value={fmtMoney(sale.price)} />}
          {sale.priceOriginal && (
            <Row
              label="Original price"
              value={fmtMoney(sale.priceOriginal)}
              note={sale.fxNote ? `Converted at ${sale.fxNote}` : undefined}
            />
          )}
        </dl>
        {paid !== null && (
          <div className="mt-2">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Paid by the buyer</span>
              <span className="num">{Number(paid.toFixed(1))}%</span>
            </div>
            <div
              className="mt-1 h-1.5 overflow-hidden rounded-full bg-secondary"
              role="progressbar"
              aria-label="Share of the sale price paid by the buyer"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(paid)}
            >
              <div className="h-full bg-sgs-teal-600" style={{ width: `${paid}%` }} />
            </div>
          </div>
        )}
      </Block>,
    );
  }

  if (payments.length > 0) {
    blocks.push(
      <Block key="payments" title="Payments received">
        <ul className="divide-y text-sm">
          {payments.map((p, i) => (
            <li key={i} className="flex flex-wrap items-baseline justify-between gap-x-3 py-1.5">
              <span className="num text-muted-foreground">{fmtDate(p.on)}</span>
              <span className="num text-right">
                {p.amount ? fmtMoney(p.amount) : "Received"}
                {p.pct !== null && <span className="ml-2 text-xs text-muted-foreground">{Number(p.pct.toFixed(1))}%</span>}
              </span>
            </li>
          ))}
        </ul>
      </Block>,
    );
  }

  if (costRows.length > 0) {
    blocks.push(
      <Block key="cost" title="Costs">
        <dl>{costRows}</dl>
      </Block>,
    );
  }

  if (stone.profit || stone.contribution) {
    blocks.push(
      <Block key="result" title="Result">
        <dl>
          {stone.profit && <Row label="Recognised profit" value={fmtMoney(stone.profit)} negative={stone.profit.amount < 0} />}
          {stone.contribution && <Row label="Your part of the estimate" value={fmtMoney(stone.contribution)} strong />}
        </dl>
      </Block>,
    );
  }

  const prov = <PublicProvenance stone={stone} ctx={provCtx} />;
  const hasMedia = stone.media !== null && stone.media.length > 0;

  return (
    <Card className={cn("avoid-break overflow-hidden", depth > 0 && "border-l-4 border-l-sgs-teal-300 shadow-none")}>
      <div className="space-y-4 p-4 sm:p-6">
        <header className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
          <div className="flex min-w-0 items-start gap-2">
            <Gem className="mt-1 h-4 w-4 shrink-0 text-sgs-purple-500" aria-hidden />
            <div className="min-w-0">
              <h3 className="break-words font-serif text-xl leading-tight">{stone.displayName}</h3>
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
                {stone.kind === "ROUGH" ? "Rough stone" : "Gemstone"}
                {stone.title ? ` · ${stone.title}` : ""}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant={stage.variant}>{stage.label}</Badge>
            {stone.cgi && <CgiBadge score={stone.cgi.score} band={stone.cgi.band} size="md" />}
          </div>
        </header>

        {hasMedia && stone.media && <PublicMediaStrip media={stone.media} name={stone.displayName} />}

        {prov}

        {blocks.length > 0 && <div className="grid gap-x-8 gap-y-5 md:grid-cols-2">{blocks}</div>}

        {kids.length > 0 && depth < MAX_DEPTH && (
          <div className="space-y-3 pt-1">
            <h4 className="font-sans text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              Cut from {stone.displayName}
            </h4>
            {kids.map((k) => <StoneCard key={k.key} stone={k} ctx={ctx} depth={depth + 1} />)}
          </div>
        )}
      </div>
    </Card>
  );
}
