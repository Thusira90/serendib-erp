import { notFound } from "next/navigation";
import Link from "next/link";
import { requireCapability, can } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/status-badge";
import { formatCarat, formatCurrency, formatDate } from "@/lib/utils";
import { ArrowLeft, Scissors, Diamond, Gem } from "lucide-react";
import { CUTTING_JOB_STATUSES } from "@/lib/enums";
import { updateCuttingJobStatus } from "../actions";
import { CompleteJobDialog } from "./complete-job-dialog";
import { CommentsThread } from "@/components/comments-thread";

export default async function CuttingJobDetail({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireCapability("cutting:read");
  const canWrite = can(session.user.role, "cutting:write");
  const { id } = await params;
  const j = await prisma.cuttingJob.findUnique({
    where: { id },
    include: {
      roughStone: true,
      cutter: true,
      transformation: { include: { outputs: { include: { gemstone: true } } } },
    },
  });
  if (!j) return notFound();

  const totalCost = Number(j.cuttingCost) + Number(j.laborCost) + Number(j.machineCost);
  const audit = await prisma.auditLog.findMany({
    where: { entity: "CuttingJob", entityId: j.id },
    orderBy: { at: "desc" }, take: 20,
  });

  return (
    <div className="space-y-6">
      <Link href="/cutting" className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
        <ArrowLeft className="h-4 w-4" /> Back to cutting jobs
      </Link>

      <div className="flex items-start justify-between gap-6">
        <div>
          <div className="flex items-center gap-3 text-xs">
            <Badge variant="purple"><Scissors className="h-3 w-3 mr-1" /> Cutting job</Badge>
            <span className="font-mono">{j.code}</span>
            <StatusBadge status={j.status} kind="cuttingJob" />
          </div>
          <h1 className="font-serif text-3xl mt-2">
            Cutting <Link href={`/rough/${j.roughStoneId}`} className="text-sgs-teal-700 hover:underline font-mono text-2xl">{j.roughStone.code}</Link>
          </h1>
          <div className="text-sm text-muted-foreground mt-1">
            {j.roughStone.gemType}{j.roughStone.variety ? ` · ${j.roughStone.variety}` : ""} · {formatCarat(Number(j.roughStone.weightCt))}
            {j.roughStone.origin ? ` · ${j.roughStone.origin}` : ""}
          </div>
        </div>
        <div className="text-right">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Total cost</div>
          <div className="font-serif text-2xl num">{formatCurrency(totalCost, j.currency)}</div>
          {j.actualYieldPct != null && <div className="text-xs text-muted-foreground">Yield {Number(j.actualYieldPct).toFixed(1)}%</div>}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle>Job</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
            <KV label="Cutter" value={j.cutter?.name ?? "Unassigned"} />
            <KV label="Started" value={formatDate(j.startedAt)} />
            <KV label="Expected completion" value={formatDate(j.expectedCompletion)} />
            <KV label="Completed" value={formatDate(j.completedAt)} />
            <KV label="Planned cut" value={j.plannedCut ?? "—"} />
            <KV label="Actual cut" value={j.actualCut ?? "—"} />
            <KV label="Target weight" value={j.targetWeightCt ? formatCarat(Number(j.targetWeightCt)) : "—"} />
            <KV label="Expected yield" value={j.expectedYieldPct ? `${Number(j.expectedYieldPct).toFixed(1)}%` : "—"} />
            <KV label="Notes" value={j.notes ?? "—"} span />
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Costs</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
            <KV label="Cutting" value={formatCurrency(Number(j.cuttingCost), j.currency)} />
            <KV label="Labour" value={formatCurrency(Number(j.laborCost), j.currency)} />
            <KV label="Machine" value={formatCurrency(Number(j.machineCost), j.currency)} />
            <KV label="Total" value={<span className="num font-medium">{formatCurrency(totalCost, j.currency)}</span>} />
          </CardContent>
        </Card>
      </div>

      {canWrite && j.status !== "COMPLETED" && j.status !== "REJECTED" && (
        <Card>
          <CardHeader><CardTitle>Actions</CardTitle></CardHeader>
          <CardContent className="flex flex-wrap items-center gap-2">
            {CUTTING_JOB_STATUSES.map((s) => (
              <form key={s} action={updateCuttingJobStatus}>
                <input type="hidden" name="id" value={j.id} />
                <input type="hidden" name="status" value={s} />
                <Button size="sm" variant={s === j.status ? "default" : "outline"} disabled={s === j.status || s === "COMPLETED"}>
                  {s.replaceAll("_", " ")}
                </Button>
              </form>
            ))}
            <CompleteJobDialog
              jobId={j.id}
              defaultCurrency={j.currency}
              defaultCuttingCost={Number(j.cuttingCost)}
              defaultLaborCost={Number(j.laborCost)}
              defaultMachineCost={Number(j.machineCost)}
              defaultPlannedCut={j.plannedCut}
              roughWeight={Number(j.roughStone.weightCt)}
              roughGemType={j.roughStone.gemType}
              roughVariety={j.roughStone.variety}
            />
          </CardContent>
        </Card>
      )}

      {j.transformation && (
        <Card>
          <CardHeader><CardTitle>Output — {j.transformation.code}</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4 text-sm mb-4">
              <KV label="Input" value={formatCarat(Number(j.transformation.totalInputWeightCt))} />
              <KV label="Output" value={formatCarat(Number(j.transformation.totalOutputWeightCt))} />
              <KV label="Waste" value={<span className="text-red-700">{formatCarat(Number(j.transformation.wasteWeightCt))}</span>} />
            </div>
            <div className="space-y-2">
              {j.transformation.outputs.map((o) => (
                <Link key={o.id} href={`/gemstones/${o.gemstoneId}`} className="flex items-center justify-between p-3 rounded border bg-card hover:border-sgs-purple-500">
                  <div className="flex items-center gap-2 text-sm">
                    <Gem className="h-4 w-4 text-sgs-purple-500" />
                    <span className="font-mono text-xs">{o.gemstone.code}</span>
                    <span>{o.gemstone.gemType}{o.gemstone.variety ? ` · ${o.gemstone.variety}` : ""}</span>
                  </div>
                  <div className="text-xs">{formatCarat(Number(o.outputWeightCt))} · allocated {formatCurrency(Number(o.allocatedCost), j.transformation!.currency)}</div>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle>Audit</CardTitle></CardHeader>
        <CardContent className="divide-y">
          {audit.map((a) => (
            <div key={a.id} className="py-2 text-sm flex items-center justify-between">
              <div>
                <Badge variant="muted" className="mr-2">{a.action}</Badge>
                {a.field && <span className="text-muted-foreground">{a.field}: {a.oldValue ?? "∅"} → {a.newValue ?? "∅"}</span>}
                {!a.field && a.newValue && <span>{a.newValue}</span>}
              </div>
              <div className="text-xs text-muted-foreground">{formatDate(a.at)} · {a.userName ?? "—"}</div>
            </div>
          ))}
        </CardContent>
      </Card>

      <CommentsThread entity="CuttingJob" entityId={j.id} entityCode={j.code} revalidate={`/cutting/${j.id}`} />
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
