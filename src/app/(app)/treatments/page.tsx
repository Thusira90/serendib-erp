import Link from "next/link";
import { Flame } from "lucide-react";
import { requireCapability, can } from "@/lib/rbac";
import { Card, CardContent } from "@/components/ui/card";
import { loadStoneOptions, loadTreatmentVocab, loadTreatments } from "@/lib/treatment-queries";
import { TREATMENT_STATUSES, TREATMENT_STATUS_LABEL, isTreatmentStatus } from "@/lib/treatment-types";
import { TreatmentDialog } from "@/components/treatment-dialog";
import { TreatmentsTable } from "@/components/treatments-table";

export const dynamic = "force-dynamic";

export default async function TreatmentsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const session = await requireCapability("treatment:read");
  const canWrite = can(session.user, "treatment:write");
  const { status } = await searchParams;
  const filter = isTreatmentStatus(status) ? status : null;

  const [all, vocab, stones] = await Promise.all([
    loadTreatments(),
    loadTreatmentVocab(),
    canWrite ? loadStoneOptions() : Promise.resolve(undefined),
  ]);
  const rows = filter ? all.rows.filter((r) => r.status === filter) : all.rows;
  const count = (s: string) => all.rows.filter((r) => r.status === s).length;

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl flex items-center gap-3"><Flame className="h-7 w-7 text-sgs-purple-500" /> Treatments</h1>
          <p className="text-sm text-muted-foreground max-w-2xl">
            Every treatment done to a rough or cut stone: the type, who did it, how many days it took and what it cost.
            Each one also shows on the stone&apos;s own page under Treatments.
          </p>
        </div>
        {canWrite && !all.missingTable && stones && <TreatmentDialog stones={stones} vocab={vocab} label="New treatment" />}
      </div>

      {all.missingTable ? (
        <Card>
          <CardContent className="p-6 text-sm text-amber-800 bg-amber-50 rounded-lg">
            Treatments are not set up in the database yet. Run <span className="font-mono">npm run db:push</span> once, then reload this page.
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {(["PLANNED", "IN_PROGRESS", "COMPLETED"] as const).map((s) => (
              <Card key={s}>
                <CardContent className="p-4">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{TREATMENT_STATUS_LABEL[s]}</div>
                  <div className="font-serif text-3xl num mt-1">{count(s)}</div>
                </CardContent>
              </Card>
            ))}
            <Card>
              <CardContent className="p-4">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">All treatments</div>
                <div className="font-serif text-3xl num mt-1">{all.rows.length}</div>
              </CardContent>
            </Card>
          </div>

          <div className="flex flex-wrap gap-1.5 text-xs">
            <Chip href="/treatments" active={!filter}>All ({all.rows.length})</Chip>
            {TREATMENT_STATUSES.map((s) => (
              <Chip key={s} href={`/treatments?status=${s}`} active={filter === s}>
                {TREATMENT_STATUS_LABEL[s]} ({count(s)})
              </Chip>
            ))}
          </div>

          <Card>
            <CardContent className="p-0">
              <TreatmentsTable rows={rows} canWrite={canWrite} vocab={vocab} stones={stones} />
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function Chip({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className={`px-2.5 py-1 rounded-full border ${
        active ? "bg-sgs-teal-500 text-white border-sgs-teal-500" : "bg-secondary/40 text-foreground/80 hover:bg-secondary"
      }`}
    >
      {children}
    </Link>
  );
}
