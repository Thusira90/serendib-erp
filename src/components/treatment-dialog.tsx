"use client";

import { useState, useTransition } from "react";
import { Flame, Pencil, PlusCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { NumberInput } from "@/components/ui/number-input";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ComboboxInput } from "@/components/combobox-input";
import { EntityPicker, type PickerOption } from "@/components/entity-picker";
import {
  PROVIDER_KINDS, TREATMENT_STATUSES, TREATMENT_STATUS_LABEL,
  type StoneKind, type TreatmentRow, type TreatmentStatus,
} from "@/lib/treatment-types";
import { createTreatment, updateTreatment } from "@/app/(app)/treatments/actions";

const dateOnly = (iso: string | null) => (iso ? iso.slice(0, 10) : "");

/**
 * Add or edit a treatment. From a stone's own page the stone is fixed; from the
 * Treatments page the stone is chosen from all rough and cut stones.
 */
export function TreatmentDialog({
  treatment, stone, stones, vocab, label,
}: {
  treatment?: TreatmentRow;
  /** Fixed stone (opened from that stone's page). */
  stone?: { kind: StoneKind; id: string; label: string };
  /** Choices for the stone picker (Treatments page). */
  stones?: { rough: PickerOption[]; gems: PickerOption[] };
  vocab: { types: string[]; providers: string[] };
  label?: string;
}) {
  const editing = !!treatment;
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [kind, setKind] = useState<StoneKind>(treatment?.kind ?? stone?.kind ?? "GEMSTONE");
  const [status, setStatus] = useState<TreatmentStatus>(treatment?.status ?? "PLANNED");
  const [currency, setCurrency] = useState(treatment?.currency ?? "LKR");

  const fixedStone = treatment
    ? { kind: treatment.kind, id: treatment.stoneId, label: `${treatment.stoneCode} · ${treatment.stoneLabel}` }
    : stone;

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setError(null); }}>
      <DialogTrigger asChild>
        {editing ? (
          <Button size="sm" variant="ghost" aria-label={`Edit ${treatment!.code}`}><Pencil className="h-3.5 w-3.5" /> Edit</Button>
        ) : (
          <Button variant="accent" size="sm"><PlusCircle className="h-4 w-4" /> {label ?? "Add treatment"}</Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            <Flame className="inline h-4 w-4 mr-2" />
            {editing ? `Edit treatment — ${treatment!.code}` : "Add a treatment"}
          </DialogTitle>
        </DialogHeader>
        <form
          action={(fd) => start(async () => {
            setError(null);
            try {
              fd.set("kind", kind);
              await (editing ? updateTreatment(fd) : createTreatment(fd));
              setOpen(false);
            } catch (e) {
              setError((e as Error).message);
            }
          })}
          className="grid grid-cols-1 md:grid-cols-2 gap-3"
        >
          {editing && <input type="hidden" name="id" value={treatment!.id} />}

          <div className="md:col-span-2 space-y-1.5">
            <Label>Stone *</Label>
            {fixedStone ? (
              <>
                <input type="hidden" name="stoneId" value={fixedStone.id} />
                <div className="rounded-md border bg-secondary/30 px-3 py-2 text-sm">{fixedStone.label}</div>
              </>
            ) : (
              <div className="grid grid-cols-[160px_1fr] gap-2">
                <select
                  value={kind}
                  onChange={(e) => setKind(e.target.value as StoneKind)}
                  aria-label="Kind of stone"
                  className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="GEMSTONE">Cut & polished</option>
                  <option value="ROUGH">Rough</option>
                </select>
                <EntityPicker
                  key={kind}
                  name="stoneId"
                  emptyLabel="— Choose a stone —"
                  options={(kind === "ROUGH" ? stones?.rough : stones?.gems) ?? []}
                />
              </div>
            )}
          </div>

          <F label="Type of treatment *">
            <ComboboxInput name="type" required defaultValue={treatment?.type} options={vocab.types} placeholder="e.g. Heat treatment" />
          </F>
          <F label="Status">
            <select
              name="status"
              value={status}
              onChange={(e) => setStatus(e.target.value as TreatmentStatus)}
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              {TREATMENT_STATUSES.map((s) => <option key={s} value={s}>{TREATMENT_STATUS_LABEL[s]}</option>)}
            </select>
          </F>

          <F label="Done by">
            <select
              name="providerKind"
              defaultValue={treatment?.providerKind ?? "COMPANY"}
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              {PROVIDER_KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
            </select>
          </F>
          <F label="Company or person">
            <ComboboxInput name="providerName" defaultValue={treatment?.providerName} options={vocab.providers} placeholder="Name of the company or person" />
          </F>
          <F label="Contact (phone / email)" wide>
            <Input name="providerContact" defaultValue={treatment?.providerContact ?? ""} />
          </F>

          <F label="Start date"><Input name="startDate" type="date" defaultValue={dateOnly(treatment?.startDate ?? null)} /></F>
          <F label="End date"><Input name="endDate" type="date" defaultValue={dateOnly(treatment?.endDate ?? null)} /></F>

          <F label="Cost" wide>
            <CurrencyInput
              amountName="cost"
              currencyName="currency"
              defaultAmount={treatment?.cost || ""}
              currency={currency}
              onCurrencyChange={setCurrency}
              defaultCurrency={currency}
            />
          </F>

          <F label="Weight before (ct)"><NumberInput name="weightBeforeCt" defaultValue={treatment?.weightBeforeCt ?? ""} /></F>
          <F label="Weight after (ct)"><NumberInput name="weightAfterCt" defaultValue={treatment?.weightAfterCt ?? ""} /></F>

          <F label="Notes" wide><Textarea name="notes" rows={3} defaultValue={treatment?.notes ?? ""} placeholder="Temperature, atmosphere, result, anything worth remembering" /></F>

          {status === "COMPLETED" && (
            <label className="md:col-span-2 flex items-start gap-2.5 text-sm cursor-pointer rounded-md border p-3">
              <input type="checkbox" name="applyToStone" className="mt-0.5 h-4 w-4 accent-sgs-teal-500" />
              <span>
                Also record this as the stone&apos;s treatment
                <span className="block text-[11px] text-muted-foreground">
                  Sets the stone&apos;s own &ldquo;Treatment&rdquo; field to this type, so it shows on its profile, labels and certificates.
                </span>
              </span>
            </label>
          )}
          <p className="md:col-span-2 text-[11px] text-muted-foreground">
            The cost is recorded here for reference. To add it to the stone&apos;s cost, file it as a bill on the stone.
          </p>

          {error && <div className="md:col-span-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">{error}</div>}
          <div className="md:col-span-2 flex justify-end gap-2 pt-2 border-t">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button disabled={pending}>{pending ? "Saving…" : editing ? "Save changes" : "Add treatment"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function F({ label, children, wide = false }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className={`space-y-1.5 ${wide ? "md:col-span-2" : ""}`}>
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}
