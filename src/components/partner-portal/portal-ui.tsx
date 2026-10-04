import type { ReactNode } from "react";
import { cn, formatCurrency } from "@/lib/utils";
import type { Money } from "@/lib/partner-dto";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;
const MINUS = "−";
const DASH = "–";

// Date-only ISO strings are formatted from their parts so the viewer's time zone can never shift the day.
export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return DASH;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  const month = m ? MONTHS[Number(m[2]) - 1] : undefined;
  return m && month ? `${Number(m[3])} ${month} ${m[1]}` : DASH;
}

export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return DASH;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return DASH;
  const text = new Intl.DateTimeFormat("en-GB", {
    day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Colombo",
  }).format(d);
  return `${text} (Sri Lanka time)`;
}

export function fmtMoney(m: Money | null | undefined): string {
  if (!m) return DASH;
  try {
    return formatCurrency(m.amount, m.currency);
  } catch {
    return `${m.currency} ${m.amount.toFixed(2)}`;
  }
}

/** An amount with its effect on the balance spelled out: +X, minus X, or plain X for zero. `sign` flips a stored amount (a payout reduces the balance). */
export function fmtEffect(m: Money, sign: 1 | -1 = 1): string {
  const v = m.amount * sign;
  if (v === 0) return fmtMoney({ amount: 0, currency: m.currency });
  return `${v > 0 ? "+" : MINUS}${fmtMoney({ amount: Math.abs(v), currency: m.currency })}`;
}

export const effectIsNegative = (m: Money, sign: 1 | -1 = 1): boolean => m.amount * sign < 0;

export const fmtPct = (n: number): string => `${Number(n.toFixed(2))}%`;

export const fmtCt = (n: number): string => `${n.toFixed(2)} ct`;

export function Section({ id, title, intro, children, className }: {
  id: string;
  title: string;
  intro?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section aria-labelledby={`pp-${id}`} className={cn("space-y-3", className)}>
      <div>
        <h2 id={`pp-${id}`} className="font-serif text-2xl">{title}</h2>
        {intro && <p className="mt-1 text-sm text-muted-foreground">{intro}</p>}
      </div>
      {children}
    </section>
  );
}

export function Row({ label, value, strong, note, negative }: {
  label: ReactNode;
  value: ReactNode;
  strong?: boolean;
  note?: ReactNode;
  negative?: boolean;
}) {
  return (
    <div className={cn("flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 py-1.5 text-sm", strong && "border-t pt-2 font-semibold")}>
      <dt className={cn("min-w-0", !strong && "text-muted-foreground")}>{label}</dt>
      <dd className={cn("num text-right", negative && "text-red-700")}>{value}</dd>
      {note && <dd className="w-full text-xs font-normal text-muted-foreground">{note}</dd>}
    </div>
  );
}

export function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="mb-1 font-sans text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">{title}</p>
      {children}
    </div>
  );
}

export function KV({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 break-words text-sm">{value}</dd>
    </div>
  );
}
