import { notFound } from "next/navigation";
import Link from "next/link";
import { requireCapability, can } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatCurrency, formatDate } from "@/lib/utils";
import { ArrowLeft, Plane } from "lucide-react";
import { updateShipmentStatus } from "../actions";
import { CommentsThread } from "@/components/comments-thread";
import { TrackingButton } from "./tracking-button";
import { trackingUrl, CARRIERS } from "@/lib/carriers";
import { ExternalLink } from "lucide-react";

const statusVariant: Record<string, "muted" | "teal" | "warning" | "success" | "danger" | "purple"> = {
  PREPARING: "muted", PACKED: "teal", SHIPPED: "purple",
  IN_TRANSIT: "warning", DELIVERED: "success", RETURNED: "danger", CANCELLED: "danger",
};

const STAGES = ["PREPARING", "PACKED", "SHIPPED", "IN_TRANSIT", "DELIVERED"] as const;

export default async function ShipmentDetail({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireCapability("shipment:read");
  const { id } = await params;
  const s = await prisma.shipment.findUnique({
    where: { id },
    include: {
      salesOrder: {
        include: { customer: true, gemstone: true },
      },
    },
  });
  if (!s) return notFound();
  const canWrite = can(session.user.role, "shipment:write");

  return (
    <div className="space-y-4">
      <Link href="/shipments" className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
        <ArrowLeft className="h-4 w-4" /> Back to shipments
      </Link>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Plane className="h-5 w-5 text-sgs-purple-500" />
              Shipment <span className="font-mono text-sm text-muted-foreground">{s.code}</span>
              <Badge variant={statusVariant[s.status] ?? "muted"}>{s.status.replaceAll("_", " ")}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
            <KV label="Sales order" value={<Link href={`/sales/${s.salesOrderId}`} className="font-mono text-sgs-teal-700 hover:underline">{s.salesOrder.code}</Link>} />
            <KV label="Invoice" value={<span className="font-mono">{s.salesOrder.invoiceNumber}</span>} />
            <KV label="Customer" value={<Link href={`/customers/${s.salesOrder.customerId}`} className="text-sgs-teal-700 hover:underline">{s.salesOrder.customer.displayName}</Link>} />
            <KV label="Gemstone" value={<Link href={`/gemstones/${s.salesOrder.gemstoneId}`} className="font-mono text-xs text-sgs-teal-700 hover:underline">{s.salesOrder.gemstone.code}</Link>} />
            <KV
              label="Courier"
              value={
                <div className="flex items-center gap-2">
                  <span>{CARRIERS.find((c) => c.code === s.courier)?.name ?? s.courier ?? "—"}</span>
                  {canWrite && <TrackingButton id={s.id} courier={s.courier} trackingNumber={s.trackingNumber} />}
                </div>
              }
            />
            <KV
              label="Tracking"
              value={
                s.trackingNumber ? (
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm">{s.trackingNumber}</span>
                    {trackingUrl(s.courier, s.trackingNumber) && (
                      <Link
                        href={trackingUrl(s.courier, s.trackingNumber)!}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-sgs-teal-700 hover:underline"
                      >
                        Track <ExternalLink className="h-3 w-3" />
                      </Link>
                    )}
                  </div>
                ) : "—"
              }
            />
            <KV label="Destination" value={[s.destination, s.destCountry].filter(Boolean).join(", ") || "—"} span />
            <KV label="Shipping cost" value={s.shippingCost != null ? formatCurrency(Number(s.shippingCost), s.currency) : "—"} />
            <KV label="Insurance" value={s.insuranceCost != null ? formatCurrency(Number(s.insuranceCost), s.currency) : "—"} />
            <KV label="Declared value" value={s.declaredValue != null ? formatCurrency(Number(s.declaredValue), s.currency) : "—"} />
            <KV label="Currency" value={s.currency} />
            {s.notes && <KV label="Notes" value={<div className="whitespace-pre-wrap">{s.notes}</div>} span />}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Progress</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            <Stage label="Prepared"  date={s.preparedAt}  current={s.status === "PREPARING"} done={!!s.preparedAt} />
            <Stage label="Packed"    date={s.packedAt}    current={s.status === "PACKED"}    done={!!s.packedAt} />
            <Stage label="Shipped"   date={s.shippedAt}   current={s.status === "SHIPPED"}   done={!!s.shippedAt} />
            <Stage label="In transit" date={null}         current={s.status === "IN_TRANSIT"} done={s.status === "IN_TRANSIT" || s.status === "DELIVERED"} />
            <Stage label="Delivered" date={s.deliveredAt} current={s.status === "DELIVERED"} done={!!s.deliveredAt} />

            {canWrite && (
              <div className="pt-3 border-t">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Set status</div>
                <div className="flex flex-wrap gap-1">
                  {STAGES.map((st) => (
                    <form key={st} action={updateShipmentStatus}>
                      <input type="hidden" name="id" value={s.id} />
                      <input type="hidden" name="status" value={st} />
                      <Button size="sm" variant={st === s.status ? "default" : "outline"} disabled={st === s.status}>
                        {st.replaceAll("_", " ")}
                      </Button>
                    </form>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <CommentsThread entity="Shipment" entityId={s.id} entityCode={s.code} revalidate={`/shipments/${s.id}`} />
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

function Stage({ label, date, current, done }: { label: string; date: Date | null; current: boolean; done: boolean }) {
  return (
    <div className="flex items-center gap-3 text-sm">
      <div className={`h-2.5 w-2.5 rounded-full ${current ? "bg-sgs-purple-500 ring-2 ring-sgs-purple-200" : done ? "bg-sgs-teal-500" : "bg-muted"}`} />
      <div className="flex-1">{label}</div>
      <div className="text-xs text-muted-foreground">{formatDate(date)}</div>
    </div>
  );
}
