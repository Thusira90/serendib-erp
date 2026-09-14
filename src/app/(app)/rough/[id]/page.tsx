import { notFound } from "next/navigation";
import Link from "next/link";
import { requireCapability, can } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/status-badge";
import { formatCarat, formatCurrency, formatDate } from "@/lib/utils";
import { buildRoughGenealogy } from "@/lib/genealogy";
import { GenealogyTree } from "@/components/genealogy-tree";
import { ArrowLeft, Diamond, Scissors } from "lucide-react";
import { CuttingPlansEditor } from "./plan-editor";
import { StartCuttingButton } from "./start-cutting-button";
import { QrCard } from "@/components/qr-card";
import { MoveButton } from "@/components/move-button";
import { EditRoughButton } from "./edit-rough-button";
import { CommentsThread } from "@/components/comments-thread";

export default async function RoughDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireCapability("rough:read");
  const canPlan = can(session.user.role, "cutting:plan");
  const canCut = can(session.user.role, "cutting:write");
  const { id } = await params;
  const r = await prisma.roughStone.findUnique({
    where: { id },
    include: {
      supplier: true,
      parcel: true,
      location: true,
      cuttingPlans: { orderBy: { createdAt: "asc" } },
      cuttingJobs: { orderBy: { createdAt: "desc" }, include: { cutter: true } },
    },
  });
  if (!r) return notFound();
  const [genealogy, audit, cutters, locations] = await Promise.all([
    buildRoughGenealogy(r.id),
    prisma.auditLog.findMany({
      where: { entity: "RoughStone", entityId: r.id },
      orderBy: { at: "desc" }, take: 30,
    }),
    prisma.user.findMany({ where: { role: "CUTTER", active: true }, select: { id: true, name: true } }),
    prisma.inventoryLocation.findMany({ orderBy: { code: "asc" }, select: { id: true, code: true, name: true } }),
  ]);
  const canStartJob = canCut && !["IN_CUTTING","CONVERTED","SOLD","LOST"].includes(r.status);
  const canMove = can(session.user.role, "location:write");
  const canEdit = can(session.user.role, "rough:write");
  const selectedPlan = r.cuttingPlans.find((p) => p.selected);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
        <Link href="/rough" className="inline-flex items-center gap-1 hover:text-foreground"><ArrowLeft className="h-4 w-4" /> Back to rough stones</Link>
        {canEdit && (
          <EditRoughButton
            rough={{
              id: r.id, code: r.code,
              gemType: r.gemType, variety: r.variety,
              weightCt: Number(r.weightCt),
              color: r.color, clarity: r.clarity,
              origin: r.origin,
              purchasePrice: Number(r.purchasePrice), currency: r.currency,
              status: r.status,
              locationId: r.locationId,
              observations: r.observations,
            }}
            locations={locations}
          />
        )}
      </div>

      <header className="flex items-start justify-between gap-6">
        <div>
          <div className="flex items-center gap-3 text-xs">
            <Badge variant="teal"><Diamond className="h-3 w-3 mr-1" /> Rough</Badge>
            <span className="font-mono">{r.code}</span>
            <StatusBadge status={r.status} kind="rough" />
          </div>
          <h1 className="font-serif text-4xl mt-2">{r.gemType}{r.variety ? ` · ${r.variety}` : ""}</h1>
          <div className="text-sm text-muted-foreground mt-1">
            {formatCarat(Number(r.weightCt))} · {r.origin ?? "Origin unknown"}
            {r.supplier ? ` · ${r.supplier.name}` : ""}
          </div>
        </div>
        <div className="text-right">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Purchase price</div>
          <div className="font-serif text-3xl num">{formatCurrency(Number(r.purchasePrice), r.currency)}</div>
          {r.pricePerCt && <div className="text-xs text-muted-foreground">{formatCurrency(Number(r.pricePerCt), r.currency)} / ct</div>}
        </div>
      </header>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="genealogy">Genealogy</TabsTrigger>
          <TabsTrigger value="cutting">Cutting</TabsTrigger>
          <TabsTrigger value="notes">Notes</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Card className="lg:col-span-2">
              <CardHeader><CardTitle>Physical characteristics</CardTitle></CardHeader>
              <CardContent className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
                <KV label="Weight" value={formatCarat(Number(r.weightCt))} />
                <KV label="Shape" value={r.shape ?? "—"} />
                <KV label="Dimensions" value={[r.lengthMm, r.widthMm, r.heightMm].filter(Boolean).map((v) => `${Number(v).toFixed(1)}mm`).join(" × ") || "—"} />
                <KV label="Color" value={r.color ?? "—"} />
                <KV label="Transparency" value={r.transparency ?? "—"} />
                <KV label="Clarity" value={r.clarity ?? "—"} />
                <KV label="Inclusions" value={r.inclusions ?? "—"} span />
                <KV label="Observations" value={r.observations ?? "—"} span />
              </CardContent>
            </Card>
            <Card className="lg:col-span-2">
              <CardHeader className="flex-row items-center justify-between space-y-0">
                <CardTitle>Sourcing & value</CardTitle>
                {canMove && <MoveButton itemKind="ROUGH" roughStoneId={r.id} currentLocationId={r.locationId} locations={locations} />}
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
                <KV label="Supplier" value={r.supplier?.name ?? "—"} />
                <KV label="Parcel" value={r.parcel?.code ?? "—"} />
                <KV label="Purchase date" value={formatDate(r.purchaseDate)} />
                <KV label="Origin" value={r.origin ?? "—"} />
                <KV label="Mine / source" value={r.mineSource ?? "—"} />
                <KV label="Location" value={r.location?.name ?? "—"} />
                <KV label="Purchase price" value={formatCurrency(Number(r.purchasePrice), r.currency)} />
                <KV label="Price / ct" value={r.pricePerCt ? formatCurrency(Number(r.pricePerCt), r.currency) : "—"} />
                <KV label="Initial valuation" value={r.initialValuation ? formatCurrency(Number(r.initialValuation), r.currency) : "—"} />
                <KV label="Valued by" value={r.valuationBy ?? "—"} />
                <KV label="Valuation notes" value={r.valuationNotes ?? "—"} span />
              </CardContent>
            </Card>
            <QrCard code={r.code} kind="rough" label={`${r.gemType}${r.variety ? ` · ${r.variety}` : ""}`} />
          </div>
        </TabsContent>

        <TabsContent value="genealogy">
          <Card>
            <CardHeader><CardTitle>Rough → finished lineage</CardTitle></CardHeader>
            <CardContent>
              <GenealogyTree root={genealogy} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="cutting">
          <div className="space-y-4">
            <Card>
              <CardHeader className="flex-row items-center justify-between">
                <CardTitle>Cutting plans</CardTitle>
                <div className="text-xs text-muted-foreground">Selected plan wins.</div>
              </CardHeader>
              <CardContent>
                <CuttingPlansEditor
                  roughStoneId={r.id}
                  canWrite={canPlan}
                  plans={r.cuttingPlans.map((p) => ({
                    id: p.id, name: p.name,
                    proposedShape: p.proposedShape,
                    expectedWeightCt: p.expectedWeightCt != null ? Number(p.expectedWeightCt) : null,
                    expectedYieldPct: p.expectedYieldPct != null ? Number(p.expectedYieldPct) : null,
                    expectedValue: p.expectedValue != null ? Number(p.expectedValue) : null,
                    cutterRecommendation: p.cutterRecommendation,
                    riskAssessment: p.riskAssessment,
                    notes: p.notes,
                    selected: p.selected,
                  }))}
                />
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex-row items-center justify-between space-y-0">
                <CardTitle>Cutting jobs</CardTitle>
                {canStartJob && (
                  <StartCuttingButton
                    roughStoneId={r.id}
                    cutters={cutters}
                    defaultShape={selectedPlan?.proposedShape ?? r.shape}
                  />
                )}
              </CardHeader>
              <CardContent className="space-y-2">
                {r.cuttingJobs.length === 0 && <div className="text-sm text-muted-foreground">No cutting jobs.</div>}
                {r.cuttingJobs.map((j) => (
                  <Link key={j.id} href={`/cutting/${j.id}`} className="p-3 rounded-md border block hover:bg-secondary/40">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-sm">
                        <Scissors className="h-4 w-4 text-sgs-purple-500" />
                        <span className="font-mono text-xs">{j.code}</span>
                        <StatusBadge status={j.status} kind="cuttingJob" />
                      </div>
                      <div className="text-xs text-muted-foreground">Cutter: {j.cutter?.name ?? "—"} · {formatDate(j.completedAt ?? j.startedAt)}</div>
                    </div>
                  </Link>
                ))}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="notes">
          <CommentsThread entity="RoughStone" entityId={r.id} entityCode={r.code} revalidate={`/rough/${r.id}`} />
        </TabsContent>

        <TabsContent value="history">
          <Card>
            <CardHeader><CardTitle>Audit trail</CardTitle></CardHeader>
            <CardContent className="divide-y">
              {audit.length === 0 && <div className="text-sm text-muted-foreground py-4">No history yet.</div>}
              {audit.map((a) => (
                <div key={a.id} className="py-2 flex items-center justify-between text-sm">
                  <div><Badge variant="muted" className="mr-2">{a.action}</Badge>{a.field && <span className="text-muted-foreground">{a.field}: {a.oldValue ?? "∅"} → {a.newValue ?? "∅"}</span>}{!a.field && a.newValue && <span>{a.newValue}</span>}</div>
                  <div className="text-xs text-muted-foreground">{formatDate(a.at)} · {a.userName ?? "system"}</div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
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
