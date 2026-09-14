"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Trash2, CheckCircle2 } from "lucide-react";
import { completeCuttingJob } from "@/app/(app)/cutting/actions";

type OutputRow = {
  gemType: string;
  variety: string;
  weightCt: string;
  shape: string;
  cut: string;
  colorDescription: string;
  askingPrice: string;
};

const emptyRow = (gemType = "", variety = ""): OutputRow => ({
  gemType, variety, weightCt: "",
  shape: "", cut: "", colorDescription: "", askingPrice: "",
});

export function CompleteJobDialog({
  jobId, defaultCurrency, defaultCuttingCost, defaultLaborCost, defaultMachineCost,
  defaultPlannedCut, roughWeight, roughGemType, roughVariety,
}: {
  jobId: string;
  defaultCurrency: string;
  defaultCuttingCost: number;
  defaultLaborCost: number;
  defaultMachineCost: number;
  defaultPlannedCut: string | null;
  roughWeight: number;
  roughGemType: string;
  roughVariety: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<OutputRow[]>([emptyRow(roughGemType, roughVariety ?? "")]);

  const outputWeight = rows.reduce((s, r) => s + (parseFloat(r.weightCt) || 0), 0);
  const yieldPct = roughWeight > 0 ? (outputWeight / roughWeight) * 100 : 0;
  const overweight = outputWeight > roughWeight + 0.001;

  const setRow = (i: number, patch: Partial<OutputRow>) =>
    setRows((prev) => prev.map((r, idx) => idx === i ? { ...r, ...patch } : r));

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="default"><CheckCircle2 className="h-4 w-4" /> Complete job</Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl">
        <DialogHeader><DialogTitle>Complete cutting job</DialogTitle></DialogHeader>
        <form
          action={(fd) => start(async () => {
            setError(null);
            try { await completeCuttingJob(fd); setOpen(false); }
            catch (e) { setError((e as Error).message); }
          })}
          className="space-y-4"
        >
          <input type="hidden" name="jobId" value={jobId} />
          <input type="hidden" name="outputCount" value={String(rows.length)} />

          <section className="grid grid-cols-4 gap-3">
            <F label="Actual cut"><Input name="actualCut" defaultValue={defaultPlannedCut ?? ""} /></F>
            <F label="Cutting cost"><Input name="cuttingCost" inputMode="decimal" defaultValue={defaultCuttingCost || ""} /></F>
            <F label="Labour cost"><Input name="laborCost" inputMode="decimal" defaultValue={defaultLaborCost || ""} /></F>
            <F label="Machine cost"><Input name="machineCost" inputMode="decimal" defaultValue={defaultMachineCost || ""} /></F>
            <F label="Currency"><Input name="currency" defaultValue={defaultCurrency} /></F>
            <F label="Notes" span><Textarea name="notes" rows={2} /></F>
          </section>

          <section>
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm font-medium">Finished stones</div>
              <div className="text-xs text-muted-foreground">
                Rough weight {roughWeight.toFixed(2)}ct · output {outputWeight.toFixed(2)}ct · yield {yieldPct.toFixed(1)}% · waste {(roughWeight - outputWeight).toFixed(2)}ct
              </div>
            </div>
            {overweight && (
              <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1 mb-2">
                Output weight exceeds the rough weight.
              </div>
            )}
            <div className="space-y-2">
              {rows.map((r, i) => (
                <div key={i} className="grid grid-cols-12 gap-2 items-end border rounded-md p-3 bg-secondary/30">
                  <input type="hidden" name={`out.${i}.gemType`} value={r.gemType} />
                  <input type="hidden" name={`out.${i}.variety`} value={r.variety} />
                  <input type="hidden" name={`out.${i}.shape`} value={r.shape} />
                  <input type="hidden" name={`out.${i}.cut`} value={r.cut} />
                  <input type="hidden" name={`out.${i}.colorDescription`} value={r.colorDescription} />
                  <input type="hidden" name={`out.${i}.askingPrice`} value={r.askingPrice} />
                  <input type="hidden" name={`out.${i}.weightCt`} value={r.weightCt} />

                  <F label="Type" cols={2}><Input value={r.gemType} onChange={(e) => setRow(i, { gemType: e.target.value })} /></F>
                  <F label="Variety" cols={2}><Input value={r.variety} onChange={(e) => setRow(i, { variety: e.target.value })} /></F>
                  <F label="Weight (ct)" cols={2}><Input inputMode="decimal" value={r.weightCt} onChange={(e) => setRow(i, { weightCt: e.target.value })} /></F>
                  <F label="Shape" cols={2}><Input value={r.shape} onChange={(e) => setRow(i, { shape: e.target.value })} /></F>
                  <F label="Cut" cols={1}><Input value={r.cut} onChange={(e) => setRow(i, { cut: e.target.value })} /></F>
                  <F label="Asking" cols={2}><Input inputMode="decimal" value={r.askingPrice} onChange={(e) => setRow(i, { askingPrice: e.target.value })} /></F>
                  <div className="col-span-1 flex justify-end">
                    <Button type="button" size="icon" variant="ghost" onClick={() => setRows((rs) => rs.filter((_, idx) => idx !== i))} disabled={rows.length === 1}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  <F label="Colour description" cols={12}><Input value={r.colorDescription} onChange={(e) => setRow(i, { colorDescription: e.target.value })} /></F>
                </div>
              ))}
            </div>
            <Button type="button" variant="outline" size="sm" className="mt-2"
              onClick={() => setRows((rs) => [...rs, emptyRow(roughGemType, roughVariety ?? "")])}>
              <Plus className="h-4 w-4" /> Add another output
            </Button>
          </section>

          {error && <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">{error}</div>}

          <div className="flex justify-end gap-2 pt-2 border-t">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button disabled={pending || overweight || outputWeight <= 0}>{pending ? "Saving…" : "Complete job"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const colSpan: Record<number, string> = {
  1: "col-span-1", 2: "col-span-2", 3: "col-span-3", 4: "col-span-4",
  5: "col-span-5", 6: "col-span-6", 7: "col-span-7", 8: "col-span-8",
  9: "col-span-9", 10: "col-span-10", 11: "col-span-11", 12: "col-span-12",
};
function F({ label, children, span = false, cols }: { label: string; children: React.ReactNode; span?: boolean; cols?: number }) {
  const cls = cols ? colSpan[cols] : (span ? "col-span-2" : "");
  return (
    <div className={`space-y-1 ${cls}`}>
      <Label className="text-[10px]">{label}</Label>
      {children}
    </div>
  );
}
