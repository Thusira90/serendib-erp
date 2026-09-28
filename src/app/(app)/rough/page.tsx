import Link from "next/link";
import { requireCapability, can } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatCarat, formatCurrency } from "@/lib/utils";
import { Plus, Diamond } from "lucide-react";
import { QrPrintButton } from "@/components/qr-print-button";
import { TimedShareButton } from "@/components/timed-share-button";
import { SelectableRoughTable, type RoughRow } from "@/components/selectable-rough-table";

export default async function RoughListPage() {
  const session = await requireCapability("rough:read");
  const rough = await prisma.roughStone.findMany({
    orderBy: { createdAt: "desc" },
    include: { supplier: true, location: true, parcel: true, _count: { select: { transformationsAsInput: true } } },
  });
  const canWrite = can(session.user.role, "rough:write");

  const rows: RoughRow[] = rough.map((r) => ({
    id: r.id, code: r.code,
    gemType: r.gemType, variety: r.variety,
    origin: r.origin,
    weightCt: Number(r.weightCt),
    purchasePrice: Number(r.purchasePrice), currency: r.currency,
    supplierName: r.supplier?.name ?? null,
    locationName: r.location?.name ?? null,
    status: r.status,
    yielded: r._count.transformationsAsInput,
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl flex items-center gap-3"><Diamond className="h-7 w-7 text-sgs-teal-500" /> Rough Stones</h1>
          <p className="text-sm text-muted-foreground">Every rough acquisition, permanent record.</p>
        </div>
        <div className="flex items-center gap-2">
          {rough.length > 0 && (
            <>
              <TimedShareButton
                scope="ROUGHS"
                roughCodes={rough.map((r) => r.code)}
                label="Timed link (all)"
                sharerDefaults={{ name: session.user.name ?? "", email: session.user.email ?? undefined }}
              />
              <QrPrintButton codes={rough.map((r) => r.code)} kind="rough" layout="sheet" label={`Print all ${rough.length} labels`} />
            </>
          )}
          {canWrite && (
            <Button asChild variant="accent"><Link href="/rough/new"><Plus className="h-4 w-4" /> New rough stone</Link></Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Total pieces" value={String(rough.length)} />
        <StatCard label="Total weight" value={formatCarat(rough.reduce((s, r) => s + Number(r.weightCt), 0))} />
        <StatCard label="Acquisition value" value={formatCurrency(rough.reduce((s, r) => s + Number(r.purchasePrice), 0))} />
        <StatCard label="Available" value={String(rough.filter(r => r.status === "AVAILABLE").length)} />
      </div>

      {rough.length === 0 ? (
        <div className="text-center text-sm text-muted-foreground py-12 border rounded-lg">
          No rough stones yet.{canWrite && <> <Link href="/rough/new" className="text-sgs-teal-700 hover:underline">Register the first one →</Link></>}
        </div>
      ) : (
        <Card>
          <CardContent className="p-0">
            <SelectableRoughTable
              rows={rows}
              sharerName={session.user.name ?? ""}
              sharerEmail={session.user.email ?? ""}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
        <div className="font-serif text-2xl num mt-1">{value}</div>
      </CardContent>
    </Card>
  );
}
