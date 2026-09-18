"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Banknote } from "lucide-react";
import { CAPITAL_TXN_TYPES, CAPITAL_TXN_META, PAYMENT_METHODS, type CapitalTxnType } from "@/lib/enums";
import { recordCapitalTransaction } from "@/app/(app)/directors/actions";

type Director = { id: string; name: string; code: string; active: boolean };
type Shareholder = { id: string; name: string; code: string; active: boolean };

const methodLabel = (m: string) => m.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (l) => l.toUpperCase());

// SHARE_CAPITAL and DIVIDEND go through /shareholders → issueShares (paired
// with a share transaction). This dialog surfaces the remaining director-
// side types plus DIVIDEND for completeness.
const RECORDABLE_TYPES: CapitalTxnType[] = [
  "DIRECTOR_LOAN", "LOAN_REPAY",
  "ADVANCE", "ADVANCE_REPAY",
  "EXPENSE_PAID_ON_BEHALF",
  "WITHDRAWAL",
  "DIVIDEND",
];

export function RecordCapitalTxnButton({
  directors, shareholders, defaultCurrency = "LKR", presetType, presetDirectorId, presetShareholderId,
}: {
  directors: Director[];
  shareholders: Shareholder[];
  defaultCurrency?: string;
  presetType?: CapitalTxnType;
  presetDirectorId?: string;
  presetShareholderId?: string;
}) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [type, setType] = useState<CapitalTxnType>(presetType ?? "DIRECTOR_LOAN");
  const meta = CAPITAL_TXN_META[type];
  const activeDirectors = directors.filter((d) => d.active);
  const activeShareholders = shareholders.filter((s) => s.active);
  const disabledReason = meta.party === "director"
    ? (activeDirectors.length === 0 ? "Add an active director first." : null)
    : (activeShareholders.length === 0 ? "Add an active shareholder first." : null);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="accent"><Banknote className="h-4 w-4" /> Record capital movement</Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Record capital movement</DialogTitle></DialogHeader>
        <p className="text-xs text-muted-foreground -mt-1">
          Share capital is recorded from the Shareholders page so it pairs with the share issue.
          Use this dialog for loans, advances, expenses paid on behalf, withdrawals and dividends.
        </p>
        <form
          action={(fd) => start(async () => { await recordCapitalTransaction(fd); setOpen(false); })}
          className="grid grid-cols-2 gap-3"
        >
          <Field label="Type *" span>
            <select name="type" value={type} onChange={(e) => setType(e.target.value as CapitalTxnType)} required
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
              {RECORDABLE_TYPES.map((t) => (
                <option key={t} value={t}>{CAPITAL_TXN_META[t].label}</option>
              ))}
            </select>
            <p className="text-[10px] text-muted-foreground">{meta.hint}</p>
          </Field>

          {meta.party === "director" ? (
            <Field label="Director *" span>
              {presetDirectorId ? (
                <>
                  <input type="hidden" name="directorId" value={presetDirectorId} />
                  <div className="h-9 rounded-md border border-input bg-secondary/30 px-3 flex items-center text-sm">
                    {directors.find((d) => d.id === presetDirectorId)?.name ?? "—"}
                  </div>
                </>
              ) : (
                <select name="directorId" required defaultValue=""
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
                  <option value="">— Select —</option>
                  {activeDirectors.map((d) => <option key={d.id} value={d.id}>{d.name} · {d.code}</option>)}
                </select>
              )}
            </Field>
          ) : (
            <Field label="Shareholder *" span>
              {presetShareholderId ? (
                <>
                  <input type="hidden" name="shareholderId" value={presetShareholderId} />
                  <div className="h-9 rounded-md border border-input bg-secondary/30 px-3 flex items-center text-sm">
                    {shareholders.find((s) => s.id === presetShareholderId)?.name ?? "—"}
                  </div>
                </>
              ) : (
                <select name="shareholderId" required defaultValue=""
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
                  <option value="">— Select —</option>
                  {activeShareholders.map((s) => <option key={s.id} value={s.id}>{s.name} · {s.code}</option>)}
                </select>
              )}
            </Field>
          )}

          <Field label="Amount *" span>
            <CurrencyInput amountName="amount" currencyName="currency"
              defaultCurrency={defaultCurrency} required placeholder="0.00" />
          </Field>
          <Field label="Method *">
            <select name="method" defaultValue="BANK_TRANSFER" required
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
              {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{methodLabel(m)}</option>)}
            </select>
          </Field>
          <Field label="Date">
            <Input name="transactionDate" type="date" defaultValue={new Date().toISOString().slice(0,10)} />
          </Field>
          <Field label="Reference"><Input name="reference" placeholder="Board res. / bank ref" /></Field>
          <Field label="Receipt (image or PDF)">
            <Input name="receiptFile" type="file" accept="application/pdf,image/*" />
          </Field>
          <Field label="Notes" span><Textarea name="notes" rows={2} /></Field>

          {disabledReason && (
            <div className="col-span-full text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
              {disabledReason}
            </div>
          )}

          <div className="col-span-full flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button disabled={pending || !!disabledReason}>{pending ? "Saving…" : "Post entry"}</Button>
          </div>
        </form>
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
