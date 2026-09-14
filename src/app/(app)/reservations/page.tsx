import Link from "next/link";
import { requireCapability, can } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatCurrency, formatDate } from "@/lib/utils";
import { releaseReservation } from "@/app/(app)/sales/actions";
import { Lock } from "lucide-react";
import { sweepExpiredReservations } from "@/lib/sweeper";

const statusVariant: Record<string, "muted" | "warning" | "success" | "danger"> = {
  ACTIVE: "warning", RELEASED: "muted", EXPIRED: "danger", CONVERTED: "success",
};

export default async function ReservationsPage() {
  const session = await requireCapability("reservation:read");
  await sweepExpiredReservations();
  const canWrite = can(session.user.role, "reservation:write");
  const reservations = await prisma.reservation.findMany({
    orderBy: { reservedAt: "desc" },
    include: { customer: true, gemstone: true },
  });
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-3xl flex items-center gap-3"><Lock className="h-7 w-7 text-sgs-purple-500" /> Reservations</h1>
        <p className="text-sm text-muted-foreground">Active holds on gemstones. Only one can be active per stone at a time.</p>
      </div>
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Res ID</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Gemstone</TableHead>
                <TableHead className="text-right">Price</TableHead>
                <TableHead className="text-right">Deposit</TableHead>
                <TableHead>Reserved</TableHead>
                <TableHead>Expires</TableHead>
                <TableHead>Status</TableHead>
                {canWrite && <TableHead />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {reservations.length === 0 && (
                <TableRow><TableCell colSpan={9} className="text-center text-sm text-muted-foreground py-10">No reservations yet.</TableCell></TableRow>
              )}
              {reservations.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-mono text-xs">
                    <Link href={`/reservations/${r.id}`} className="text-sgs-teal-700 hover:underline">{r.code}</Link>
                  </TableCell>
                  <TableCell>
                    <Link href={`/customers/${r.customerId}`} className="text-sgs-teal-700 hover:underline">{r.customer.displayName}</Link>
                  </TableCell>
                  <TableCell>
                    <Link href={`/gemstones/${r.gemstoneId}`} className="text-sgs-teal-700 hover:underline font-mono text-xs">{r.gemstone.code}</Link>
                    <div className="text-xs text-muted-foreground">{r.gemstone.gemType}</div>
                  </TableCell>
                  <TableCell className="text-right num">{formatCurrency(Number(r.price), r.currency)}</TableCell>
                  <TableCell className="text-right num">{r.deposit != null ? formatCurrency(Number(r.deposit), r.currency) : "—"}</TableCell>
                  <TableCell className="text-xs">{formatDate(r.reservedAt)}</TableCell>
                  <TableCell className="text-xs">{formatDate(r.expiresAt)}</TableCell>
                  <TableCell><Badge variant={statusVariant[r.status] ?? "muted"}>{r.status}</Badge></TableCell>
                  {canWrite && (
                    <TableCell>
                      {r.status === "ACTIVE" && (
                        <form action={releaseReservation}>
                          <input type="hidden" name="id" value={r.id} />
                          <input type="hidden" name="reason" value="Manually released" />
                          <Button size="sm" variant="outline">Release</Button>
                        </form>
                      )}
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
