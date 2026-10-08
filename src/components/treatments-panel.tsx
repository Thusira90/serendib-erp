import { Card, CardContent } from "@/components/ui/card";
import { loadTreatmentVocab, loadTreatments } from "@/lib/treatment-queries";
import { TreatmentDialog } from "@/components/treatment-dialog";
import { TreatmentsTable } from "@/components/treatments-table";
import type { StoneKind } from "@/lib/treatment-types";

/** The "Treatments" tab on a rough or cut stone: its treatments, and a button to add one. */
export async function TreatmentsPanel({
  kind, stoneId, stoneLabel, canWrite,
}: {
  kind: StoneKind;
  stoneId: string;
  stoneLabel: string;
  canWrite: boolean;
}) {
  const [{ rows, missingTable }, vocab] = await Promise.all([
    loadTreatments(kind === "ROUGH" ? { roughStoneId: stoneId } : { gemstoneId: stoneId }),
    loadTreatmentVocab(),
  ]);
  return (
    <Card>
      <CardContent className="pt-6 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="font-serif text-lg">Treatments</h3>
            <p className="text-xs text-muted-foreground max-w-lg">
              Heating, diffusion, filling and other treatments done to this stone: who did them, how long they took and what they cost.
            </p>
          </div>
          {canWrite && !missingTable && (
            <TreatmentDialog stone={{ kind, id: stoneId, label: stoneLabel }} vocab={vocab} />
          )}
        </div>
        {missingTable ? (
          <div className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
            Treatments are not set up in the database yet. Run <span className="font-mono">npm run db:push</span> once.
          </div>
        ) : (
          <TreatmentsTable rows={rows} canWrite={canWrite} vocab={vocab} showStone={false} />
        )}
      </CardContent>
    </Card>
  );
}
