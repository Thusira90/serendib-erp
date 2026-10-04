import type { CalcLineDto, PartnerPortalDto } from "@/lib/partner-dto";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { fmtMoney, fmtPct, Section } from "./portal-ui";

type Calculation = NonNullable<PartnerPortalDto["statement"]["calculation"]>;

function lineValue(l: CalcLineDto): string {
  if (l.value && l.pct !== null) return `${fmtPct(l.pct)} → ${fmtMoney(l.value)}`;
  if (l.value) return fmtMoney(l.value);
  if (l.pct !== null) return fmtPct(l.pct);
  return "–";
}

export function CalcSteps({ calculation }: { calculation: Calculation | null }) {
  const buckets = (calculation ?? []).filter((b) => b.lines.length > 0);
  if (buckets.length === 0) return null;
  return (
    <Section
      id="calc"
      title="How your amount was calculated"
      intro="Each line comes from your agreed terms and the figures in this statement. The last line of each block is the amount that counts towards your estimate."
    >
      <Card className="space-y-5 p-4 sm:p-6">
        {buckets.map((b, i) => (
          <div key={i} className="avoid-break">
            {b.bucketLabel && (
              <h3 className="mb-1 font-sans text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">{b.bucketLabel}</h3>
            )}
            <ol className="divide-y rounded-lg border">
              {b.lines.map((l, j) => (
                <li
                  key={j}
                  className={cn(
                    "flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 px-3 py-2 text-sm",
                    l.emphasis && "bg-secondary/50 font-semibold",
                  )}
                >
                  <span className="min-w-0">{l.label}</span>
                  <span className="num text-right">{lineValue(l)}</span>
                </li>
              ))}
            </ol>
          </div>
        ))}
      </Card>
    </Section>
  );
}
