"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { PlusCircle } from "lucide-react";
import { formatCarat, formatCurrency } from "@/lib/utils";
import { createCuttingPlan, selectCuttingPlan } from "../plan-actions";

type Plan = {
  id: string; name: string;
  proposedShape: string | null;
  expectedWeightCt: number | null;
  expectedYieldPct: number | null;
  expectedValue: number | null;
  cutterRecommendation: string | null;
  riskAssessment: string | null;
  notes: string | null;
  selected: boolean;
};

export function CuttingPlansEditor({
  roughStoneId, plans, canWrite,
}: {
  roughStoneId: string;
  plans: Plan[];
  canWrite: boolean;
}) {
  return (
    <div className="space-y-3">
      {canWrite && (
        <div className="flex justify-end">
          <NewPlanDialog roughStoneId={roughStoneId} defaultName={`Plan ${String.fromCharCode(65 + plans.length)}`} />
        </div>
      )}
      {plans.length === 0 && (
        <div className="text-sm text-muted-foreground p-6 text-center border rounded-md">
          No plans yet. {canWrite && "Draft your first cut alternative above."}
        </div>
      )}
      {plans.map((p) => (
        <div key={p.id} className={`p-3 rounded-md border ${p.selected ? "border-sgs-purple-300 bg-sgs-purple-50" : "bg-secondary/40"}`}>
          <div className="flex items-center justify-between">
            <div className="font-medium">
              {p.name} {p.selected && <Badge variant="purple" className="ml-2">Selected</Badge>}
            </div>
            <div className="text-sm text-muted-foreground">
              {p.proposedShape ?? "—"}
              {p.expectedWeightCt != null && ` · expected ${formatCarat(Number(p.expectedWeightCt))}`}
              {p.expectedYieldPct != null && ` · ${Number(p.expectedYieldPct).toFixed(1)}% yield`}
              {p.expectedValue != null && ` · ${formatCurrency(Number(p.expectedValue))}`}
            </div>
          </div>
          {p.cutterRecommendation && <div className="text-sm text-muted-foreground mt-1">{p.cutterRecommendation}</div>}
          {p.riskAssessment && <div className="text-xs text-muted-foreground mt-0.5">Risks: {p.riskAssessment}</div>}
          {canWrite && !p.selected && (
            <form action={selectCuttingPlan} className="mt-2">
              <input type="hidden" name="id" value={p.id} />
              <Button size="sm" variant="outline">Mark as selected</Button>
            </form>
          )}
        </div>
      ))}
    </div>
  );
}

function NewPlanDialog({ roughStoneId, defaultName }: { roughStoneId: string; defaultName: string }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="accent" size="sm"><PlusCircle className="h-4 w-4" /> Add plan</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Add cutting plan</DialogTitle></DialogHeader>
        <form action={(fd) => start(async () => { await createCuttingPlan(fd); setOpen(false); })} className="space-y-3">
          <input type="hidden" name="roughStoneId" value={roughStoneId} />
          <div className="space-y-1.5"><Label>Name *</Label><Input name="name" required defaultValue={defaultName} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>Proposed shape</Label><Input name="proposedShape" placeholder="Oval" /></div>
            <div className="space-y-1.5"><Label>Expected weight (ct)</Label><Input name="expectedWeightCt" inputMode="decimal" /></div>
            <div className="space-y-1.5"><Label>Expected yield %</Label><Input name="expectedYieldPct" inputMode="decimal" placeholder="33.5" /></div>
            <div className="space-y-1.5"><Label>Expected value</Label><Input name="expectedValue" inputMode="decimal" /></div>
          </div>
          <div className="space-y-1.5"><Label>Cutter recommendation</Label><Textarea name="cutterRecommendation" rows={2} /></div>
          <div className="space-y-1.5"><Label>Risk assessment</Label><Textarea name="riskAssessment" rows={2} /></div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button disabled={pending}>{pending ? "Saving…" : "Add plan"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
