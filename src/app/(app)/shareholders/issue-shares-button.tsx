"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Coins } from "lucide-react";
import { PAYMENT_METHODS } from "@/lib/enums";
import { issueShares } from "@/app/(app)/directors/actions";

type ShareClass = { id: string; code: string; name: string; faceValue: number; currency: string };
type Shareholder = { id: string; code: string; name: string; active: boolean };

const methodLabel = (m: string) =>
  m.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (l) => l.toUpperCase());

export function IssueSharesButton({
  shareClasses, shareholders, presetShareholderId,
}: {
  shareClasses: ShareClass[];
  shareholders: Shareholder[];
  presetShareholderId?: string;
}) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [selectedClassId, setSelectedClassId] = useState(shareClasses[0]?.id ?? "");
  const [shares, setShares] = useState("");
  const [price, setPrice] = useState("");
  const [withMoney, setWithMoney] = useState(true);

  const cls = shareClasses.find((c) => c.id === selectedClassId);
  const total = (parseFloat(shares || "0") || 0) * (parseFloat(price || String(cls?.faceValue ?? 0)) || 0);
  const hasClasses = shareClasses.length > 0;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="accent" disabled={!hasClasses || shareholders.filter((s) => s.active).length === 0}>
          <Coins className="h-4 w-4" /> Issue shares
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Issue shares</DialogTitle></DialogHeader>
        {!hasClasses ? (
          <div className="text-sm text-muted-foreground py-6 text-center">
            Add a share class before issuing shares.
          </div>
        ) : (
          <form
            action={(fd) => start(async () => { await issueShares(fd); setOpen(false); })}
            className="grid grid-cols-2 gap-3"
          >
            <input type="hidden" name="createCapitalTxn" value={String(withMoney)} />
            <Field label="Shareholder *" span>
              {presetShareholderId ? (
                <>
                  <input type="hidden" name="transfereeId" value={presetShareholderId} />
                  <div className="h-9 rounded-md border border-input bg-secondary/30 px-3 flex items-center text-sm">
                    {shareholders.find((s) => s.id === presetShareholderId)?.name ?? "—"}
                  </div>
                </>
              ) : (
                <select name="transfereeId" required defaultValue=""
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
                  <option value="">— Select —</option>
                  {shareholders.filter((s) => s.active).map((s) => (
                    <option key={s.id} value={s.id}>{s.name} · {s.code}</option>
                  ))}
                </select>
              )}
            </Field>
            <Field label="Share class *">
              <select name="shareClassId" value={selectedClassId} onChange={(e) => setSelectedClassId(e.target.value)} required
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
                {shareClasses.map((c) => (
                  <option key={c.id} value={c.id}>{c.code} · {c.name} (face {c.faceValue} {c.currency})</option>
                ))}
              </select>
            </Field>
            <Field label="Number of shares *">
              <Input name="numberOfShares" required inputMode="decimal" value={shares}
                onChange={(e) => setShares(e.target.value)} placeholder="1000" />
            </Field>
            <Field label={`Price per share (${cls?.currency ?? "LKR"}) *`}>
              <Input name="pricePerShare" required inputMode="decimal" value={price}
                onChange={(e) => setPrice(e.target.value)} placeholder={String(cls?.faceValue ?? "")} />
            </Field>
            <Field label="Total value" >
              <div className="h-9 rounded-md border border-input bg-secondary/30 px-3 flex items-center text-sm num">
                {total.toLocaleString(undefined, { maximumFractionDigits: 2 })} {cls?.currency ?? "LKR"}
              </div>
            </Field>
            <Field label="Transaction date">
              <Input name="transactionDate" type="date" defaultValue={new Date().toISOString().slice(0,10)} />
            </Field>
            <Field label="Reference" span>
              <Input name="reference" placeholder="Board resolution 2026/03" />
            </Field>
            <Field label="Supporting document (PDF or image)" span>
              <Input name="documentFile" type="file" accept="application/pdf,image/*" />
            </Field>
            <Field label="Notes" span><Textarea name="notes" rows={2} /></Field>

            <div className="col-span-full border-t pt-3 space-y-2">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={withMoney} onChange={(e) => setWithMoney(e.target.checked)} />
                Also record the paid-in cash as a SHARE_CAPITAL entry on the capital ledger
              </label>
              {withMoney && (
                <div className="pl-6 grid grid-cols-2 gap-3">
                  <Field label="Method">
                    <select name="method" defaultValue="BANK_TRANSFER"
                      className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
                      {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{methodLabel(m)}</option>)}
                    </select>
                  </Field>
                </div>
              )}
            </div>

            <div className="col-span-full flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button disabled={pending}>{pending ? "Saving…" : "Issue"}</Button>
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
