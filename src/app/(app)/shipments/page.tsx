import Link from "next/link";
import { requireCapability } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Plane } from "lucide-react";

const statusVariant: Record<string, "muted" | "teal" | "warning" | "success" | "danger" | "purple"> = {
  PREPARING: "muted", PACKED: "teal", SHIPPED: "purple",
  IN_TRANSIT: "warning", DELIVERED: "success", RETURNED: "danger", CANCELLED: "danger",
};

export default async function ShipmentsPage() {
  await requireCapability("shipment:read");
  const shipments = await prisma.shipment.findMany({
    orderBy: { createdAt: "desc" },
    include: { salesOrder: { include: { customer: true, gemstone: true } } },
  });
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-3xl flex items-center gap-3"><Plane className="h-7 w-7 text-sgs-purple-500" /> Shipments</h1>
        <p className="text-sm text-muted-foreground">Post-sale export and delivery, tracked to the doorstep.</p>
      </div>
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Shipment</TableHead>
                <TableHead>Sales order</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Destination</TableHead>
                <TableHead>Courier / Tracking</TableHead>
                <TableHead className="text-right">Declared value</TableHead>
                <TableHead>Shipped</TableHead>
                <TableHead>Delivered</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {shipments.length === 0 && (
                <TableRow><TableCell colSpan={9} className="text-center text-sm text-muted-foreground py-10">No shipments yet.</TableCell></TableRow>
              )}
              {shipments.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="font-mono text-xs">
                    <Link href={`/shipments/${s.id}`} className="text-sgs-teal-700 hover:underline">{s.code}</Link>
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    <Link href={`/sales/${s.salesOrderId}`} className="text-sgs-teal-700 hover:underline">{s.salesOrder.code}</Link>
                  </TableCell>
                  <TableCell>{s.salesOrder.customer.displayName}</TableCell>
                  <TableCell className="text-sm">
                    {s.destination ?? "—"}{s.destCountry ? `, ${s.destCountry}` : ""}
                  </TableCell>
                  <TableCell className="text-xs">
                    {s.courier ?? "—"}
                    {s.trackingNumber && <div className="text-muted-foreground">{s.trackingNumber}</div>}
                  </TableCell>
                  <TableCell className="text-right num">{s.declaredValue != null ? formatCurrency(Number(s.declaredValue), s.currency) : "—"}</TableCell>
                  <TableCell className="text-xs">{formatDate(s.shippedAt)}</TableCell>
                  <TableCell className="text-xs">{formatDate(s.deliveredAt)}</TableCell>
                  <TableCell><Badge variant={statusVariant[s.status] ?? "muted"}>{s.status.replaceAll("_", " ")}</Badge></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
