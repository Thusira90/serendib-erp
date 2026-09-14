import { notFound } from "next/navigation";
import Link from "next/link";
import { requireCapability, can } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCarat, formatCurrency, formatDate } from "@/lib/utils";
import { ArrowLeft, Lock, User, Gem, Calendar } from "lucide-react";
import { ExtendReservationButton, ReleaseReservationButton, ConvertToSaleButton } from "./actions-client";

const statusVariant: Record<string, "muted" | "warning" | "success" | "danger"> = {
  ACTIVE: "warning", RELEASED: "muted", EXPIRED: "danger", CONVERTED: "success",
};

export default async function ReservationDetail({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireCapability("reservation:read");
  const { id } = await params;
  const r = await prisma.reservation.findUnique({
    where: { id },
    include: { customer: true, gemstone: true },
  });
  if (!r) return notFound();
  const canWrite = can(session.user.role, "reservation:write");
  const canSell = can(session.user.role, "sale:write");
  const isActive = r.status === "ACTIVE";
  const daysLeft = r.expiresAt ? Math.ceil((r.expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : null;
  const expiryUrgent = daysLeft != null && daysLeft <= 2 && daysLeft >= 0;
  const expired = daysLeft != null && daysLeft < 0;

  return (
    <div className="space-y-6">
      <Link href="/reservations" className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
        <ArrowLeft className="h-4 w-4" /> Back to reservations
      </Link>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4">
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="flex items-center gap-2">
              <Lock className="h-5 w-5 text-sgs-purple-500" />
              Reservation <span className="font-mono text-sm text-muted-foreground">{r.code}</span>
              <Badge variant={statusVariant[r.status] ?? "muted"}>{r.status}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <section>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
                <User className="h-3 w-3" /> Customer
              </div>
              <div className="flex items-baseline justify-between">
                <div>
                  <Link href={`/customers/${r.customerId}`} className="font-serif text-lg text-sgs-teal-700 hover:underline">
                    {r.customer.displayName}
                  </Link>
                  {r.customer.companyName && (
                    <div className="text-sm text-muted-foreground">{r.customer.companyName}</div>
                  )}
                  <div className="text-xs text-muted-foreground">
                    {[r.customer.city, r.customer.country].filter(Boolean).join(", ") || "—"}
                    {r.customer.email && ` · ${r.customer.email}`}
                  </div>
                </div>
                <div className="text-xs text-muted-foreground font-mono">{r.customer.code}</div>
              </div>
            </section>

            <section>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
                <Gem className="h-3 w-3" /> Held stone
              </div>
              <div className="border rounded-md p-4 grid grid-cols-1 md:grid-cols-[200px_1fr] gap-4">
                <div className="rounded bg-sgs-gradient text-white p-4 h-32 flex flex-col justify-between">
                  <div className="text-[10px] uppercase tracking-widest opacity-80">
                    {r.gemstone.gemType}{r.gemstone.variety ? ` · ${r.gemstone.variety}` : ""}
                  </div>
                  <div>
                    <div className="font-serif text-2xl num">{formatCarat(Number(r.gemstone.weightCt))}</div>
                    <Link href={`/gemstones/${r.gemstoneId}`} className="text-[10px] opacity-85 font-mono mt-1 hover:opacity-100">
                      {r.gemstone.code} →
                    </Link>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                  <KV label="Origin" value={r.gemstone.origin ?? "—"} />
                  <KV label="Treatment" value={r.gemstone.treatment ?? "—"} />
                  <KV label="Shape" value={r.gemstone.shape ?? "—"} />
                  <KV label="Cut" value={r.gemstone.cut ?? "—"} />
                  <KV label="Colour" value={r.gemstone.colorDescription ?? "—"} span />
                  <KV label="Current status" value={<Badge variant="muted">{r.gemstone.status}</Badge>} />
                </div>
              </div>
            </section>

            <section className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <KV label="Held at" value={formatCurrency(Number(r.price), r.currency)} />
              <KV label="Deposit" value={r.deposit != null ? formatCurrency(Number(r.deposit), r.currency) : "—"} />
              <KV label="Currency" value={r.currency} />
              <KV label="Salesperson" value={r.salespersonId ?? "—"} />
            </section>

            {r.notes && (
              <section>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Notes</div>
                <div className="text-sm whitespace-pre-wrap text-muted-foreground">{r.notes}</div>
              </section>
            )}

            {(r.releasedAt || r.releasedReason) && (
              <section className="border-t pt-4">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Release history</div>
                <div className="text-sm mt-1">
                  Released on {formatDate(r.releasedAt)}
                  {r.releasedReason && <>. Reason: <span className="text-muted-foreground">{r.releasedReason}</span></>}
                </div>
              </section>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-sgs-teal-500" /> Timeline
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <KV label="Reserved" value={formatDate(r.reservedAt)} />
            <KV
              label="Expires"
              value={
                r.expiresAt ? (
                  <span className={expiryUrgent ? "text-amber-700 font-medium" : expired ? "text-red-700 font-medium" : ""}>
                    {formatDate(r.expiresAt)}
                    {daysLeft != null && daysLeft >= 0 && <span className="text-xs text-muted-foreground"> · {daysLeft}d left</span>}
                    {expired && <span className="text-xs"> · expired</span>}
                  </span>
                ) : "—"
              }
            />
            {r.quotationId && (
              <KV
                label="From quotation"
                value={<Link href={`/quotations/${r.quotationId}`} className="font-mono text-xs text-sgs-teal-700 hover:underline">Open quotation →</Link>}
              />
            )}

            {canWrite && isActive && (
              <div className="pt-3 border-t space-y-2">
                <ExtendReservationButton id={r.id} />
                {canSell && (
                  <ConvertToSaleButton
                    reservationId={r.id}
                    customerId={r.customerId}
                    gemstoneId={r.gemstoneId}
                    price={Number(r.price)}
                    currency={r.currency}
                  />
                )}
                <ReleaseReservationButton id={r.id} />
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function KV({ label, value, span = false }: { label: string; value: React.ReactNode; span?: boolean }) {
  return (
    <div className={span ? "col-span-2" : ""}>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-0.5">{value}</div>
    </div>
  );
}
