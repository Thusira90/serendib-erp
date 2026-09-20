"use client";

import { useState, useTransition, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import Link from "next/link";
import { Plus, Trash2 } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { postManualJournal } from "../actions";

type Account = { id: string; code: string; name: string; type: string; currency: string };

type Row = {
  accountId: string;
  debit: string;
  credit: string;
  description: string;
};
const emptyRow = (): Row => ({ accountId: "", debit: "", credit: "", description: "" });

const num = (v: string) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};

export function ManualJournalForm({ accounts, defaultCurrency = "LKR" }: { accounts: Account[]; defaultCurrency?: string }) {
  const [rows, setRows] = useState<Row[]>([emptyRow(), emptyRow()]);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const totals = useMemo(() => {
    const debit = rows.reduce((s, r) => s + num(r.debit), 0);
    const credit = rows.reduce((s, r) => s + num(r.credit), 0);
    return {
      debit, credit, difference: Math.round((debit - credit) * 100) / 100,
      balanced: Math.abs(debit - credit) < 0.005 && debit > 0,
    };
  }, [rows]);

  const setRow = (i: number, patch: Partial<Row>) =>
    setRows((prev) => prev.map((r, idx) => idx === i ? { ...r, ...patch } : r));

  return (
    <form
      action={(fd) => start(async () => {
        setError(null);
        try { await postManualJournal(fd); }
        catch (e) { setError((e as Error).message); }
      })}
      className="space-y-6"
    >
      <input type="hidden" name="lineCount" value={String(rows.length)} />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Field label="Transaction date *"><Input name="transactionDate" type="date" required defaultValue={new Date().toISOString().slice(0,10)} /></Field>
        <Field label="Currency"><Input name="currency" defaultValue={defaultCurrency} /></Field>
        <Field label="Reference"><Input name="reference" placeholder="Voucher / doc ref" /></Field>
      </div>
      <Field label="Description *"><Textarea name="description" required rows={2} placeholder="Opening balance / adjustment / ..." /></Field>

      <div>
        <div className="flex items-center justify-between mb-2">
          <div className="text-sm font-medium">Lines</div>
          <div className="text-xs text-muted-foreground">
            Debit {formatCurrency(totals.debit, defaultCurrency)} · Credit {formatCurrency(totals.credit, defaultCurrency)}
            {totals.difference !== 0 && (
              <span className="text-red-600 ml-2">
                Δ {formatCurrency(Math.abs(totals.difference), defaultCurrency)}
              </span>
            )}
          </div>
        </div>
        <div className="space-y-2">
          {rows.map((r, i) => (
            <div key={i} className="grid grid-cols-12 gap-2 items-end border rounded-md p-3 bg-secondary/30">
              <input type="hidden" name={`line.${i}.accountId`} value={r.accountId} />
              <input type="hidden" name={`line.${i}.debit`}     value={r.debit} />
              <input type="hidden" name={`line.${i}.credit`}    value={r.credit} />
              <input type="hidden" name={`line.${i}.description`} value={r.description} />

              <div className="col-span-5 space-y-1">
                <Label className="text-[10px]">Account</Label>
                <select
                  value={r.accountId} onChange={(e) => setRow(i, { accountId: e.target.value })}
                  className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                >
                  <option value="">— Select —</option>
                  {accounts.map((a) => <option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}
                </select>
              </div>
              <div className="col-span-2 space-y-1">
                <Label className="text-[10px]">Debit</Label>
                <Input inputMode="decimal" value={r.debit}
                  onChange={(e) => setRow(i, { debit: e.target.value, credit: e.target.value ? "" : r.credit })}
                  placeholder="0.00"
                />
              </div>
              <div className="col-span-2 space-y-1">
                <Label className="text-[10px]">Credit</Label>
                <Input inputMode="decimal" value={r.credit}
                  onChange={(e) => setRow(i, { credit: e.target.value, debit: e.target.value ? "" : r.debit })}
                  placeholder="0.00"
                />
              </div>
              <div className="col-span-2 space-y-1">
                <Label className="text-[10px]">Note</Label>
                <Input value={r.description} onChange={(e) => setRow(i, { description: e.target.value })} placeholder="Line note" />
              </div>
              <div className="col-span-1 flex justify-end">
                <Button type="button" size="icon" variant="ghost"
                  onClick={() => setRows((rs) => rs.filter((_, idx) => idx !== i))}
                  disabled={rows.length <= 2}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
        <Button type="button" variant="outline" size="sm" className="mt-3" onClick={() => setRows((rs) => [...rs, emptyRow()])}>
          <Plus className="h-4 w-4" /> Add line
        </Button>
      </div>

      {error && <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">{error}</div>}

      <div className="flex justify-end gap-3 pt-4 border-t">
        <Button asChild variant="outline"><Link href="/journals">Cancel</Link></Button>
        <Button type="submit" disabled={pending || !totals.balanced}>
          {pending ? "Posting…" : totals.balanced ? "Post entry" : "Balance debits to credits to post"}
        </Button>
      </div>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><Label>{label}</Label>{children}</div>;
}
