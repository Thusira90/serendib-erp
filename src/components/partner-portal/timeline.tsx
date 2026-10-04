import type { ComponentType } from "react";
import {
  Award, Banknote, Camera, CheckCircle2, ClipboardList, FileEdit, Flag, Gem, Handshake, Receipt, Scissors, ShoppingBag, Wallet,
} from "lucide-react";
import type { PartnerEventType, TimelineItemDto } from "@/lib/partner-dto";
import { Card } from "@/components/ui/card";
import { fmtDate, fmtMoney, Section } from "./portal-ui";

type IconType = ComponentType<{ className?: string }>;

const ICONS: Record<PartnerEventType, IconType> = {
  ACQUIRED: Gem,
  CUTTING_STARTED: Scissors,
  CUTTING_COMPLETED: Scissors,
  GEM_REGISTERED: Gem,
  CERTIFICATE_SUBMITTED: Award,
  CERTIFICATE_ISSUED: Award,
  MEDIA_ADDED: Camera,
  COST_RECORDED: Receipt,
  SOLD: ShoppingBag,
  PAYMENT_RECEIVED: Banknote,
  SETTLEMENT_RECORDED: ClipboardList,
  ADJUSTMENT_RECORDED: FileEdit,
  PAYOUT_MADE: Wallet,
  TERMS_AMENDED: Handshake,
  DEAL_STARTED: Flag,
  DEAL_CLOSED: CheckCircle2,
};

export function PublicTimeline({ items }: { items: TimelineItemDto[] | null }) {
  if (items === null) return null;
  const sorted = items
    .map((t, seq) => ({ t, seq }))
    .sort((a, b) => b.t.on.localeCompare(a.t.on) || a.seq - b.seq)
    .map((x) => x.t);
  return (
    <Section id="timeline" title="Timeline" intro="What has happened to the stones in this deal, newest first.">
      <Card className="p-4 sm:p-6">
        {sorted.length === 0 ? (
          <p className="text-sm text-muted-foreground">No activity yet. Updates appear here as your stones move through cutting, sale and payment.</p>
        ) : (
          <ol className="relative ml-3 space-y-5 border-l pl-6">
            {sorted.map((t, i) => {
              const Icon = ICONS[t.type] ?? Flag;
              return (
                <li key={i} className="avoid-break relative">
                  <span className="absolute -left-[37px] top-0 flex h-7 w-7 items-center justify-center rounded-full border bg-white text-sgs-teal-600">
                    <Icon className="h-3.5 w-3.5" />
                  </span>
                  <div className="num text-xs text-muted-foreground">{fmtDate(t.on)}</div>
                  <div className="text-sm">{t.text}</div>
                  {t.amount && <div className="num mt-0.5 text-sm font-medium">{fmtMoney(t.amount)}</div>}
                </li>
              );
            })}
          </ol>
        )}
      </Card>
    </Section>
  );
}
