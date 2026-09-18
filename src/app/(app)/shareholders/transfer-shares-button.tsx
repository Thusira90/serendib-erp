"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ArrowRightLeft } from "lucide-react";
import { transferShares } from "@/app/(app)/directors/actions";

type ShareClass = { id: string; code: string; name: string; currency: string };
type LotHolder = { id: string; code: string; name: string; classId: string; numberOfShares: number };

export function TransferSharesButton({
  shareClasses, holders, presetTransferorId,
}: {
  shareClasses: ShareClass[];
  holders: LotHolder[];      // one row per (shareholder, class) with numberOfShares > 0
  presetTransferorId?: string;
}) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [transferor, setTransferor] = useState<string>(presetTransferorId ?? "");
  const [selectedClass, setSelectedClass] = useState<string>("");

  const availableClasses = holders
    .filter((h) => h.id === transferor)
    .map((h) => h.classId);
  const currentLot = holders.find((h) => h.id === transferor && h.classId === selectedClass);

  const canOpen = holders.length > 0;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" disabled={!canOpen}>
          <ArrowRightLeft className="h-4 w-4" /> Transfer shares
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Transfer shares</DialogTitle></DialogHeader>
        {!canOpen ? (
          <div className="text-sm text-muted-foreground py-6 text-center">
            Nobody holds shares yet.
          </div>
        ) : (
          <form
            action={(fd) => start(async () => { await transferShares(fd); setOpen(false); })}
            className="grid grid-cols-2 gap-3"
          >
            <Field label="Transferor (from) *" span>
              <select name="transferorId" required value={transferor}
                onChange={(e) => { setTransferor(e.target.value); setSelectedClass(""); }}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
                <option value="">— Select —</option>
                {Array.from(new Set(holders.map((h) => h.id))).map((id) => {
                  const h = holders.find((x) => x.id === id)!;
                  return <option key={id} value={id}>{h.name} · {h.code}</option>;
                })}
              </select>
            </Field>
            <Field label="Share class *">
              <select name="shareClassId" required value={selectedClass}
                onChange={(e) => setSelectedClass(e.target.value)}
                disabled={!transferor}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
                <option value="">— Select —</option>
                {shareClasses.filter((c) => availableClasses.includes(c.id)).map((c) => (
                  <option key={c.id} value={c.id}>{c.code} · {c.name}</option>
                ))}
              </select>
            </Field>
            <Field label="Number of shares *">
              <Input name="numberOfShares" required inputMode="decimal"
                placeholder={currentLot ? `Max ${currentLot.numberOfShares}` : ""} />
            </Field>
            <Field label={`Price per share`}>
              <Input name="pricePerShare" required inputMode="decimal" placeholder="0" />
            </Field>
            <Field label="Transaction date">
              <Input name="transactionDate" type="date" defaultValue={new Date().toISOString().slice(0,10)} />
            </Field>
            <Field label="Transferee (to) *" span>
              <select name="transfereeId" required defaultValue=""
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
                <option value="">— Select —</option>
                {Array.from(new Set(holders.filter((h) => h.id !== transferor).map((h) => h.id))).map((id) => {
                  const h = holders.find((x) => x.id === id)!;
                  return <option key={id} value={id}>{h.name} · {h.code}</option>;
                })}
              </select>
              <p className="text-[10px] text-muted-foreground">
                Only existing shareholders are transfer targets. Add the transferee as a shareholder first if needed.
              </p>
            </Field>
            <Field label="Reference" span><Input name="reference" placeholder="Transfer form ref" /></Field>
            <Field label="Supporting document" span>
              <Input name="documentFile" type="file" accept="application/pdf,image/*" />
            </Field>
            <Field label="Notes" span><Textarea name="notes" rows={2} /></Field>
            <div className="col-span-full flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button disabled={pending}>{pending ? "Saving…" : "Transfer"}</Button>
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
