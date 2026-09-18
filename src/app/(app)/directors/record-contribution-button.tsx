"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Banknote } from "lucide-react";
import { PAYMENT_METHODS } from "@/lib/enums";
import { recordCapitalContribution } from "./actions";

const methodLabel = (m: string) =>
  m.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (l) => l.toUpperCase());

/**
 * Record a director's capital contribution. When `presetDirectorId` is
 * given (from the director's own detail page) the picker is locked to that
 * director so users can't accidentally attribute the payment to the wrong
 * person while they're looking at someone else's page.
 */
export function RecordContributionButton({
  directors, defaultCurrency = "LKR", presetDirectorId,
}: {
  directors: { id: string; name: string; code: string; active: boolean }[];
  defaultCurrency?: string;
  presetDirectorId?: string;
}) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const activeDirectors = directors.filter((d) => d.active);
  const hasDirectors = activeDirectors.length > 0;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="accent" disabled={!hasDirectors}>
          <Banknote className="h-4 w-4" /> Record contribution
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Record capital contribution</DialogTitle></DialogHeader>
        {!hasDirectors ? (
          <div className="text-sm text-muted-foreground py-6 text-center">
            Add at least one active director before recording a contribution.
          </div>
        ) : (
          <form
            action={(fd) => start(async () => { await recordCapitalContribution(fd); setOpen(false); })}
            className="grid grid-cols-2 gap-3"
          >
            <Field label="Director *" span>
              {presetDirectorId ? (
                <>
                  <input type="hidden" name="directorId" value={presetDirectorId} />
                  <div className="h-9 rounded-md border border-input bg-secondary/30 px-3 flex items-center text-sm">
                    {directors.find((d) => d.id === presetDirectorId)?.name ?? "—"}
                  </div>
                </>
              ) : (
                <select
                  name="directorId" required defaultValue=""
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="">— Select —</option>
                  {activeDirectors.map((d) => (
                    <option key={d.id} value={d.id}>{d.name} · {d.code}</option>
                  ))}
                </select>
              )}
            </Field>
            <Field label="Amount *" span>
              <CurrencyInput
                amountName="amount"
                currencyName="currency"
                defaultCurrency={defaultCurrency}
                required
                placeholder="500000"
              />
            </Field>
            <Field label="Method *">
              <select name="method" defaultValue="BANK_TRANSFER" required
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
                {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{methodLabel(m)}</option>)}
              </select>
            </Field>
            <Field label="Reference"><Input name="reference" placeholder="Board res. 2026/03" /></Field>
            <Field label="Date"><Input name="contributedAt" type="date" defaultValue={new Date().toISOString().slice(0,10)} /></Field>
            <Field label="Receipt (image or PDF)" span>
              <Input name="receiptFile" type="file" accept="application/pdf,image/*" />
            </Field>
            <Field label="Notes" span><Textarea name="notes" rows={2} /></Field>
            <div className="col-span-full flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button disabled={pending}>{pending ? "Saving…" : "Record"}</Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children, span = false }: { label: string; children: React.ReactNode; span?: boolean }) {
  return (
    <div className={`space-y-1.5 ${span ? "col-span-2" : ""}`}>
      <Label>{label}</Label>
      {children}
    </div>
  );
}
